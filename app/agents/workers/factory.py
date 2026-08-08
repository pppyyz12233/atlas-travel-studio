
import asyncio, json
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END, START

from app.utils.llm import chat
from app.agents.skill_loader import load_skill
from app.mcp.registry import WORKER_TOOLS_MAP
from app.utils.config import MAX_TOOL_ITERATIONS
from app.agents.skill_loader import load_skill


#子图State
class WorkerState(TypedDict):
    """每个Worker子图的内部State"""
    messages: list[dict]
    iteration_count: int          # LLM 推理轮数
    tool_call_count: int          # 工具调用次数（tool 消息条数）


#构建单个Worker子图
def build_worker_subgraph(worker_name: str, max_iterations: int = None, build_prompt=None):
    """构建一个 Worker 的标准 ReAct 子图。

    参数:
        worker_name:    Worker名称，对应 skill文件名和工具组
        max_iterations: 最大ReAct循环次数，默认取全局配置
        build_prompt:   可选，动态prompt回调(query, context) -> str
    """
    if max_iterations is None:
        max_iterations = MAX_TOOL_ITERATIONS

    #载该Worker的skill prompt和工具
    system_prompt = load_skill(worker_name) or f"You are a {worker_name} expert."
    tools = WORKER_TOOLS_MAP.get(worker_name, [])


#LLM节点
    async def llm_node(state: WorkerState):
        """调用 LLM，binding工具列表"""
        print(f"  [{worker_name}] LLM 思考 (第{state.get('iteration_count', 0) + 1}轮)")

        #动态promp
        if build_prompt and state["messages"]:
            query = state["messages"][-1].get("content", "")
            ctx = [
                {"step": m.get("step", ""), "result": m.get("content", "")}
                for m in state["messages"]
                if m.get("role") == "tool"
            ]
            dynamic_prompt = build_prompt(query, ctx)
            messages = [{"role": "system", "content": dynamic_prompt}] + state["messages"]
        else:
            messages = [{"role": "system", "content": system_prompt}] + state["messages"]

        #有工具传工具列表，无工具纯对话
        tool_schemas = None
        if tools:
            tool_schemas = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.args_schema.model_json_schema() if hasattr(t, 'args_schema') else {},
                    },
                }
                for t in tools
            ]

        resp = await chat(messages, tools=tool_schemas)
        resp = dict(resp)
        if "role" not in resp:
            resp["role"] = "assistant"
        if resp.get("tool_calls") and not resp.get("content"):
            resp.pop("content", None)
        #list[dict]无reducer→必须返回累积后的完整列表，否则旧消息丢失
        return {
            "messages": state["messages"] + [resp],
            "iteration_count": state.get("iteration_count", 0) + 1,
        }


#工具节点
    async def tool_node(state: WorkerState):
        """执行LLM请求的tool_calls，返回标准Tool消息"""
        last_msg = state["messages"][-1]
        tool_calls = last_msg.get("tool_calls", [])

        if not tool_calls:
            return {}

        #构建工具名函数映射
        tool_map = {t.name: t for t in tools}

        # 解析所有 tool_calls 的参数（不上网络，纯 CPU）
        tasks = []
        for tc in tool_calls:
            tc_id = str(tc.id) if hasattr(tc, 'id') else str(tc.get('id', ''))
            tc_name = tc.function.name if hasattr(tc, 'function') else tc.get('function', {}).get('name', '')
            tc_args = tc.function.arguments if hasattr(tc, 'function') else tc.get('function', {}).get('arguments', '{}')
            if isinstance(tc_args, str):
                try:
                    tc_args = json.loads(tc_args)
                except json.JSONDecodeError:
                    tc_args = {}

            tool = tool_map.get(tc_name)
            if tool is None:
                tasks.append((tc_id, tc_name, None, {}))
            else:
                tasks.append((tc_id, tc_name, tool, tc_args))

        # 并行执行所有工具（gather 替代串行 await）
        async def _run_one(tc_id, tc_name, tool, tc_args):
            if tool is None:
                return {"role": "tool", "tool_call_id": tc_id, "name": tc_name, "content": f"工具 {tc_name} 不存在"}
            print(f"  [{worker_name}] 执行工具: {tc_name}({tc_args})")
            try:
                observation = await tool.ainvoke(tc_args)
                content = str(observation)
                # 截断过长输出，保护 LLM context
                if len(content) > 3000:
                    content = content[:2800] + f"\n... (截断 {len(content) - 3000} 字符)"
            except Exception as e:
                content = f"工具执行错误: {e}"
            return {"role": "tool", "tool_call_id": tc_id, "name": tc_name, "content": content}

        tool_results = await asyncio.gather(*[_run_one(*t) for t in tasks])

        #list[dict]无reducer返回累积列表，保留之前的消息
        return {
            "messages": state["messages"] + list(tool_results),
            "tool_call_count": state.get("tool_call_count", 0) + len(tool_results),
        }


#路由判断
    def should_continue(state: WorkerState) -> Literal["tools", "__end__"]:
        """LLM 调用了工具去 tool_node；没调 结束子图"""
        last_msg = state["messages"][-1]

        #检查是否超最大循环次数
        if state.get("iteration_count", 0) >= max_iterations:
            return END

        tool_calls = last_msg.get("tool_calls", [])
        if tool_calls:
            return "tools"
        return END


#拼子图
    builder = StateGraph(WorkerState)
    builder.add_node("llm", llm_node)
    builder.add_node("tools", tool_node)

    builder.add_edge(START, "llm")
    builder.add_conditional_edges("llm", should_continue, {"tools": "tools", END: END})
    builder.add_edge("tools", "llm")  # ← ReAct 循环

    return builder.compile()


#创建所有 Worker 子图实例
flight_subgraph     = build_worker_subgraph("flight")
hotel_subgraph      = build_worker_subgraph("hotel")
attraction_subgraph = build_worker_subgraph("attraction")
itinerary_subgraph  = build_worker_subgraph("itinerary")


#budget需要动态prompt
OVERSEAS = {"Tokyo", "Paris", "Bangkok", "Singapore", "London",
            "New York", "Sydney", "Dubai", "Seoul", "Osaka", "Kyoto"}

def _budget_prompt(query: str, context: list) -> str:
    base = load_skill("budget") or "You are a budget expert."
    text = query or ""
    for item in context:
        text += " " + (item.get("result", "") or "")
    if any(f" {c} " in f" {text} " or f"{c}," in text or f"{c}." in text for c in OVERSEAS):
        extra = load_skill("budget_exchange")
        if extra:
            base += "\n\n" + extra
    return base

budget_subgraph = build_worker_subgraph("budget", build_prompt=_budget_prompt)


#名字对应子图映射
WORKER_SUBGRAPHS = {
    "flight": flight_subgraph,
    "hotel": hotel_subgraph,
    "attraction": attraction_subgraph,
    "itinerary": itinerary_subgraph,
    "budget": budget_subgraph,
}
