"""Worker 子图工厂 —— 每个 Worker 是一个独立的 StateGraph 子图

架构:
    主图(supervisor) 调度 → Worker 子图(StateGraph)
      → 子图内部: llm_node ↔ tool_node (ReAct 循环)

vs 旧版手工 ReAct 循环的优势:
  - 标准 LangGraph 子图，可独立 get_state() 查看内部状态
  - 自动处理 tool_call 解析和执行
  - 与主图共享 checkpointer，自动存档
"""

import json
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END, START

from app.utils.llm import chat
from app.agents.skill_loader import load_skill
from app.agents.tools import WORKER_TOOLS_MAP
from app.utils.config import MAX_TOOL_ITERATIONS


# ── Worker 子图的 State ──────────────────────────────────────

class WorkerState(TypedDict):
    """每个 Worker 子图的内部 State"""
    messages: list[dict]


# ── 构建单个 Worker 子图 ─────────────────────────────────────

def build_worker_subgraph(worker_name: str, max_iterations: int = None, build_prompt=None):
    """构建一个 Worker 的标准 ReAct 子图。

    参数:
        worker_name:    Worker 名称（如 "flight"、"hotel"），对应 skill 文件名和工具组
        max_iterations: 最大 ReAct 循环次数，默认取全局配置
        build_prompt:   可选，动态 prompt 回调 (query, context) -> str
    """
    if max_iterations is None:
        max_iterations = MAX_TOOL_ITERATIONS

    # 加载该 Worker 的 skill prompt 和工具
    system_prompt = load_skill(worker_name) or f"You are a {worker_name} expert."
    tools = WORKER_TOOLS_MAP.get(worker_name, [])

    _iteration_count = 0  # 闭包计数器，跟踪循环次数

    # ── LLM 节点 ──────────────────────────────────────────

    async def llm_node(state: WorkerState):
        """调用 LLM，binding 工具列表"""
        nonlocal _iteration_count
        _iteration_count += 1
        print(f"  [{worker_name}] LLM 思考 (第{_iteration_count}轮)")

        # 动态 prompt（如 budget worker 根据内容拼接境外汇率 skill）
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

        # 有工具→传工具列表，无工具→纯对话
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
        # list[dict] 无 reducer → 必须返回累积后的完整列表，否则旧消息丢失
        return {"messages": state["messages"] + [resp]}

    # ── Tool 节点 ─────────────────────────────────────────

    async def tool_node(state: WorkerState):
        """执行 LLM 请求的 tool_calls，返回标准 Tool 消息"""
        last_msg = state["messages"][-1]
        tool_calls = last_msg.get("tool_calls", [])

        if not tool_calls:
            return {}

        # 构建工具名 → 函数映射
        tool_map = {t.name: t for t in tools}
        tool_results = []

        for tc in tool_calls:
            # 兼容 OpenAI SDK 对象和 dict 两种格式
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
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "name": tc_name,
                    "content": f"工具 {tc_name} 不存在",
                })
                continue

            print(f"  [{worker_name}] 执行工具: {tc_name}({tc_args})")
            try:
                observation = await tool.ainvoke(tc_args)
                observation_str = str(observation)
            except Exception as e:
                observation_str = f"工具执行错误: {e}"

            tool_results.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "name": tc_name,
                "content": observation_str,
            })

        # list[dict] 无 reducer → 返回累积列表，保留之前的消息
        return {"messages": state["messages"] + tool_results}

    # ── 路由判断 ─────────────────────────────────────────

    def should_continue(state: WorkerState) -> Literal["tools", "__end__"]:
        """LLM 调用了工具 → 去 tool_node；没调 → 结束子图"""
        last_msg = state["messages"][-1]

        # 检查是否超最大循环次数
        if _iteration_count >= max_iterations:
            return END

        tool_calls = last_msg.get("tool_calls", [])
        if tool_calls:
            return "tools"
        return END

    # ── 拼子图 ──────────────────────────────────────────

    builder = StateGraph(WorkerState)
    builder.add_node("llm", llm_node)
    builder.add_node("tools", tool_node)

    builder.add_edge(START, "llm")
    builder.add_conditional_edges("llm", should_continue, {"tools": "tools", END: END})
    builder.add_edge("tools", "llm")  # ← ReAct 循环

    return builder.compile()


# ── 创建所有 Worker 子图实例 ──────────────────────────────────

flight_subgraph     = build_worker_subgraph("flight")
hotel_subgraph      = build_worker_subgraph("hotel")
attraction_subgraph = build_worker_subgraph("attraction")
itinerary_subgraph  = build_worker_subgraph("itinerary")

# budget 需要动态 prompt（境外自动拼汇率 skill）
from app.agents.skill_loader import load_skill

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

# 名字 → 子图映射（供 supervisor 使用）
WORKER_SUBGRAPHS = {
    "flight": flight_subgraph,
    "hotel": hotel_subgraph,
    "attraction": attraction_subgraph,
    "itinerary": itinerary_subgraph,
    "budget": budget_subgraph,
}
