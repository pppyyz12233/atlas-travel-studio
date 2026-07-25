"""Supervisor 主图 —— Plan-and-Execute + Worker 子图

图结构:
    guard → memory_reader → intent_router → planner → executor → memory_writer → aggregator → END
                              ↑ Worker 子图由 executor 动态调用

支持:
  - Checkpointer: 自动存档/加载对话历史（传 thread_id 即可）
  - Memory Store: 跨对话记住用户偏好
  - Worker 子图: 每个 Worker 是独立的 StateGraph
"""

import json, asyncio, time, os, re, logging, uuid
from langgraph.graph import StateGraph, END, START
from langgraph.types import Command

from app.agents.state import AgentState
from app.agents.intent_router import classify_intent
from app.agents.planner import generate_plan
from app.agents.workflow.guard import check
from app.agents.workers.factory import WORKER_SUBGRAPHS
from app.agents.skill_loader import load_skill
from app.utils.llm import chat
from app.schemas.trip import TripState, Location, TripItem, StepOutput

logger = logging.getLogger(__name__)

# ── 常量 ────────────────────────────────────────────────────

WORKER_LIST = "flight(航班) hotel(酒店) attraction(景点) itinerary(日程) budget(预算)"
WORKER_TIMEOUT = 120.0

CHINA_CITIES = ["上海", "北京", "深圳", "广州", "杭州", "成都", "南京", "重庆", "武汉", "西安"]
OVERSEAS_CITIES = ["东京", "巴黎", "曼谷", "新加坡", "伦敦", "纽约", "悉尼", "迪拜", "首尔", "大阪", "京都"]


# ── 城市提取（纯确定性，不调 LLM）─────────────────────────────

def _extract_cities(msg: str) -> tuple[str, str]:
    from_city, to_city = "出发地", "目的地"
    patterns = [
        r"从(\S{1,4})[去到往](\S{1,4})",
        r"(\S{1,4})[去到往](\S{1,4})",
    ]
    for p in patterns:
        m = re.search(p, msg)
        if m:
            candidate_from, candidate_to = m.group(1), m.group(2)
            all_cities = CHINA_CITIES + OVERSEAS_CITIES
            if candidate_from in all_cities or any(c in candidate_from for c in all_cities):
                from_city = candidate_from
            if candidate_to in all_cities or any(c in candidate_to for c in all_cities):
                to_city = candidate_to
            if from_city != "出发地" and to_city != "目的地":
                return from_city, to_city
    for c in OVERSEAS_CITIES + CHINA_CITIES:
        if c in msg:
            if to_city == "目的地":
                to_city = c
            elif from_city == "出发地":
                from_city = c
    return from_city, to_city


def _get_dep_ids(workers: list[str], deps: list[str]) -> list[int]:
    result = []
    for d in deps:
        if d in workers:
            idx = workers.index(d) + 1
            result.append(idx)
    return result


def _default_plan(msg: str, active_workers: list[str] | None = None) -> list[dict]:
    workers = active_workers or ["flight", "hotel", "attraction", "itinerary", "budget"]
    from_city, to_city = _extract_cities(msg)
    ALL_PLANS = {
        "flight": {"id": 1, "name": "查航班", "worker": "flight",
                    "description": f"查{from_city}到{to_city}的航班", "depends_on": []},
        "hotel": {"id": 2, "name": "找酒店", "worker": "hotel",
                   "description": f"找{to_city}的酒店", "depends_on": []},
        "attraction": {"id": 3, "name": "推荐景点", "worker": "attraction",
                        "description": f"推荐{to_city}的热门景点", "depends_on": []},
        "itinerary": {"id": 4, "name": "排日程", "worker": "itinerary",
                       "description": f"排{to_city}每日日程",
                       "depends_on": _get_dep_ids(workers, ["flight", "hotel", "attraction"])},
        "budget": {"id": 5, "name": "算预算", "worker": "budget",
                    "description": "汇总旅行预算", "depends_on": []},
    }
    plan = []
    for i, w in enumerate(workers):
        if w in ALL_PLANS:
            step = dict(ALL_PLANS[w])
            step["id"] = i + 1
            step["status"] = "pending"
            plan.append(step)
    return plan


# ── 结构化提取 ──────────────────────────────────────────────

async def _extract_structured(text: str, worker_type: str) -> StepOutput:
    prompt = f"""Extract structured data from this travel assistant output. Return ONLY valid JSON.
Output format:
{{"summary": "前80字摘要",
 "locations": [{{"lng": 经度, "lat": 纬度, "name": "名称", "address": "地址", "type": "airport/hotel/attraction/station/other"}}],
 "items": [{{"name": "名称", "detail": "详情", "price": "价格", "date": "日期"}}]}}
Worker type: {worker_type}
Text:
{text[:3000]}"""
    try:
        resp = await chat([{"role": "user", "content": prompt}])
        content = resp.get("content", "{}").strip()
        s = content.find("{")
        e = content.rfind("}")
        if s != -1 and e != -1:
            return StepOutput(**json.loads(content[s:e+1]))
    except Exception:
        logger.warning(f"structured extraction failed for {worker_type}", exc_info=True)
    if worker_type == "budget":
        try:
            bs = text.find("budget_breakdown")
            if bs != -1:
                js = text.find("[", bs)
                je = text.rfind("]", bs)
                if js != -1 and je != -1:
                    items_data = json.loads(text[js:je+1])
                    items = [
                        TripItem(
                            name=it.get("category", ""),
                            detail=it.get("note", ""),
                            price=f"{it.get('currency','CNY')} {it.get('amount',0):.0f}",
                        )
                        for it in items_data
                    ]
                    return StepOutput(summary=text[:80], items=items)
        except Exception:
            logger.warning("budget structured extraction failed", exc_info=True)
    return StepOutput(summary=text[:80])


# ── 依赖与分层 ──────────────────────────────────────────────

def _infer_depends_on(step: dict, all_steps: list[dict]) -> list[int]:
    if "depends_on" in step and step["depends_on"]:
        return step["depends_on"]
    if step.get("worker") == "itinerary":
        return [s["id"] for s in all_steps if s.get("worker") in {"flight", "hotel", "attraction"}]
    return []


def _build_execution_layers(steps: list[dict]) -> list[list[dict]]:
    layers = []
    remaining = list(steps)
    done_ids = set()
    while remaining:
        layer = []
        still_remaining = []
        for s in remaining:
            deps = _infer_depends_on(s, steps)
            if all(d in done_ids for d in deps):
                layer.append(s)
            else:
                still_remaining.append(s)
        if not layer and still_remaining:
            layer = still_remaining
            still_remaining = []
        layers.append(layer)
        for s in layer:
            done_ids.add(s["id"])
        remaining = still_remaining
    return layers


def _build_context(steps: list[dict]) -> list[dict]:
    return [
        {"step": s["name"], "result": s.get("result", "")}
        for s in steps if s.get("status") == "done"
    ]


# ── TripState 构建 ──────────────────────────────────────────

def _build_trip_state(steps: list[dict]) -> TripState:
    ts = TripState()
    trip_fields = {"name", "detail", "price", "date"}
    location_fields = {"lng", "lat", "name", "address", "type"}
    for s in steps:
        items = s.get("items", [])
        locs = s.get("locations", [])
        worker = s.get("worker", "")
        if worker == "flight":
            ts.flights = [TripItem(**{k: v for k, v in it.items() if k in trip_fields}) for it in items]
        elif worker == "hotel":
            ts.hotels = [TripItem(**{k: v for k, v in it.items() if k in trip_fields}) for it in items]
        elif worker == "attraction":
            ts.attractions = [TripItem(**{k: v for k, v in it.items() if k in trip_fields}) for it in items]
        elif worker == "itinerary":
            ts.itinerary = [{k: v for k, v in it.items() if k in trip_fields} for it in items]
        elif worker == "budget":
            ts.budget_items = [{k: v for k, v in it.items() if k in trip_fields} for it in items]
        for loc in locs:
            ts.locations.append(Location(**{k: v for k, v in loc.items() if k in location_fields}))
    return ts


# ══════════════════════════════════════════════════════════════
# 图节点
# ══════════════════════════════════════════════════════════════

# ── Guard（安全门卫）─────────────────────────────────────────

async def guard_node(state: AgentState) -> AgentState:
    """正则拦截违规输入，零 Token 消耗"""
    msg = state["messages"][-1]["content"]
    blocked, reason = check(msg)
    state["guard_blocked"] = blocked
    state["guard_reason"] = reason
    if blocked:
        state["final_answer"] = f"拒绝处理：{reason}"
    return state


# ── Memory Reader（加载长期记忆）─────────────────────────────

async def memory_reader_node(state: AgentState, config, *, store) -> AgentState:
    """每次对话开始时，从 Store 加载用户历史偏好，注入 system prompt"""
    if store is None:
        return state

    try:
        uid = config.get("configurable", {}).get("user_id", "anonymous")
        memories = list(store.search((uid, "preferences")))
        if memories:
            pref_lines = [f"- {m.key}: {m.value.get('value', '')}" for m in memories]
            pref_text = "用户历史偏好:\n" + "\n".join(pref_lines)
            # 插入到 messages 最前面，作为 system 级别的上下文
            state["messages"] = [
                {"role": "system", "content": pref_text}
            ] + state["messages"]
            print(f"[Memory] 加载了 {len(memories)} 条用户偏好")
    except Exception:
        logger.debug("memory_reader: store 不可用或为空", exc_info=True)

    return state


# ── Intent Router ──────────────────────────────────────────

async def intent_router_node(state: AgentState) -> AgentState:
    """分类用户意图，决定跑哪些 Worker"""
    msg = state["messages"][-1]["content"]
    result = await classify_intent(msg)
    state["intent"] = result.intent.value
    state["active_workers"] = result.workers
    print(f"[Intent] {result.intent.value} -> workers: {result.workers}")
    return state


# ── Planner ────────────────────────────────────────────────

async def planner_node(state: AgentState) -> AgentState:
    """根据意图生成执行计划"""
    plan = await generate_plan(state, WORKER_SUBGRAPHS, WORKER_LIST, _extract_cities, _default_plan)
    state["plan_steps"] = plan
    state["current_step_index"] = 0
    print(f"[Planner] {len(plan)}步计划: {[s['name'] for s in plan]}")
    return state


# ── Executor（调用 Worker 子图）─────────────────────────────

async def _run_step_with_subgraph(step: dict, ctx: list | None) -> None:
    """对单个步骤调用对应的 Worker 子图"""
    worker_name = step.get("worker", "")
    subgraph = WORKER_SUBGRAPHS.get(worker_name)

    if subgraph is None:
        step["status"] = "failed"
        step["result"] = f"无对应Worker: {worker_name}"
        return

    print(f"  [Executor] {step['name']} 开始...")
    step["status"] = "running"

    # 构建子图输入消息
    task_msg = step.get("description", "")
    context_msg = ""
    if ctx:
        context_msg = "前序步骤结果:\n" + "\n".join([
            f"--- {c['step']} ---\n{c['result']}" for c in ctx
        ])
    user_input = f"{task_msg}\n\n{context_msg}" if context_msg else task_msg

    try:
        result = await asyncio.wait_for(
            subgraph.ainvoke({
                "messages": [{"role": "user", "content": user_input}]
            }),
            timeout=WORKER_TIMEOUT
        )

        # 子图的最终回复是 messages 的最后一条
        final_msgs = result.get("messages", [])
        final_content = ""
        for m in reversed(final_msgs):
            if m.get("role") == "assistant" and m.get("content"):
                final_content = m["content"]
                break

        step["result"] = final_content or "Worker 无输出"
        step["status"] = "done" if final_content else "failed"

        # 结构化提取
        if final_content:
            try:
                structured = await _extract_structured(final_content, worker_name)
                step["summary"] = structured.summary
                step["locations"] = [
                    {"lng": loc.lng, "lat": loc.lat, "name": loc.name,
                     "address": loc.address, "type": loc.type}
                    for loc in structured.locations if loc.lng is not None and loc.lat is not None
                ]
                step["items"] = [
                    {"name": it.name, "detail": it.detail,
                     "price": it.price, "date": it.date}
                    for it in structured.items
                ]
            except Exception:
                logger.warning(f"structured extraction failed for {step['name']}", exc_info=True)

        print(f"  [Executor] {step['name']} [{'OK' if step['status'] == 'done' else 'FAIL'}]")

    except asyncio.TimeoutError:
        step["result"] = "该步骤执行超时，已跳过。请查看其他步骤的结果。"
        step["status"] = "timeout"
        logger.warning(f"step {step['name']} timed out after {WORKER_TIMEOUT}s")
    except Exception as e:
        step["result"] = str(e)
        step["status"] = "failed"
        logger.error(f"step {step['name']} failed: {e}", exc_info=True)


async def executor_node(state: AgentState) -> AgentState:
    """执行计划步骤，按依赖分层，同层并行"""
    steps = state.get("plan_steps", [])
    if not steps:
        state["current_step_index"] = 999
        return state

    # 补全依赖并分层
    for s in steps:
        if "depends_on" not in s or not s["depends_on"]:
            s["depends_on"] = _infer_depends_on(s, steps)

    layers = _build_execution_layers(steps)

    t_start = time.time()
    all_steps = [s for layer in layers for s in layer]
    print(f"[Executor] {len(all_steps)}步, {len(layers)}层: "
          f"{' → '.join(['|'.join(s['name'] for s in layer) for layer in layers])}")

    for layer in layers:
        layer_ctx = _build_context(steps)

        if len(layer) == 1:
            await _run_step_with_subgraph(layer[0], layer_ctx if layer_ctx else None)
        else:
            print(f"  [Executor] 并行执行 {len(layer)} 步: {[s['name'] for s in layer]}")
            await asyncio.gather(*[
                _run_step_with_subgraph(s, layer_ctx if layer_ctx else None)
                for s in layer
            ])

    elapsed = time.time() - t_start
    done_count = sum(1 for s in steps if s.get("status") == "done")
    print(f"[Executor] 完成: {done_count}/{len(steps)}步, 耗时 {elapsed:.1f}s")

    state["current_step_index"] = len(steps)
    return state


# ── Memory Writer（提取并保存长期记忆）───────────────────────

async def memory_writer_node(state: AgentState, config, *, store) -> AgentState:
    """从本次对话中提取用户偏好，存入 Store"""
    if store is None or not state.get("final_answer"):
        return state

    try:
        uid = config.get("configurable", {}).get("user_id", "anonymous")

        # 用 LLM 从最终回复中提取用户偏好
        extract_prompt = f"""从以下旅行对话提取用户的偏好和习惯。只输出 JSON:
对话内容:
用户: {state['messages'][-1]['content'] if state['messages'] else ''}
方案概要: {state['final_answer'][:500]}

格式:
{{"preferences": [{{"key": "偏好项", "value": "偏好值"}}]}}

偏好项示例: "预算档位", "出行季节", "酒店偏好", "航空公司偏好", "饮食偏好", "景点偏好"
如果没发现新偏好，输出 {{"preferences": []}}
只输出 JSON:"""

        resp = await chat([{"role": "user", "content": extract_prompt}])
        content = resp.get("content", "{}").strip()
        s = content.find("{")
        e = content.rfind("}")
        if s == -1 or e == -1:
            return state

        data = json.loads(content[s:e+1])
        prefs = data.get("preferences", [])

        for p in prefs:
            key = p.get("key", "")
            value = p.get("value", "")
            if key and value:
                namespace = (uid, "preferences")
                store.put(namespace, key, {"value": value})
                print(f"[Memory] 保存偏好: {key} = {value}")

        if prefs:
            print(f"[Memory] 本次保存了 {len(prefs)} 条偏好")

    except Exception:
        logger.debug("memory_writer: 偏好提取失败", exc_info=True)

    return state


# ── Aggregator（汇总）───────────────────────────────────────

async def aggregator_node(state: AgentState) -> AgentState:
    """汇总所有步骤结果，生成最终旅行方案"""
    steps = state.get("plan_steps", [])
    msg = state["messages"][-1]["content"]

    trip_state = _build_trip_state(steps)

    text = "\n\n".join([
        f"Step{s['id']}[{s['name']}]:\n{s.get('result', '')}"
        for s in steps
    ])

    trip_json = ""
    if trip_state.flights or trip_state.hotels or trip_state.attractions:
        trip_json = f"\n\n【结构化行程状态】\n{trip_state.model_dump_json(indent=2, ensure_ascii=False)}\n"

    planner_skill = load_skill("planner")

    p = f"""用户需求：{msg}
各步骤结果：{text}{trip_json}
输出方案："""
    messages = []
    if planner_skill:
        messages.append({"role": "system", "content": planner_skill})
    messages.append({"role": "user", "content": p})
    r = await chat(messages)
    state["final_answer"] = r.get("content", "")
    state["trip_state"] = trip_state.model_dump()
    return state


# ── 路由 ───────────────────────────────────────────────────

def route_guard(s: AgentState):
    """Guard 拦截 → 直接结束；放行 → 进入主流程"""
    return "end" if s.get("guard_blocked") else "memory_reader"


# ══════════════════════════════════════════════════════════════
# 构建图（单例 + checkpointer/store 支持）
# ══════════════════════════════════════════════════════════════

_graph = None
_graph_with_checkpointer = None


def build_graph(checkpointer=None, store=None):
    """构建主图。

    参数:
        checkpointer: LangGraph Checkpointer（如 SqliteSaver），None 则不存档
        store:        LangGraph Store（如 InMemoryStore），None 则不用长期记忆

    返回:
        编译后的 CompiledStateGraph
    """
    global _graph, _graph_with_checkpointer

    # 无 checkpointer → 复用单例（向后兼容）
    if checkpointer is None and store is None:
        if _graph is None:
            _graph = _build(checkpointer=None, store=None)
        return _graph

    # 有 checkpointer/store → 每次创建新实例（不缓存，因为外部可能换 store）
    return _build(checkpointer=checkpointer, store=store)


def _build(checkpointer, store):
    g = StateGraph(AgentState)

    # 添加节点
    g.add_node("guard", guard_node)
    g.add_node("memory_reader", memory_reader_node)
    g.add_node("intent_router", intent_router_node)
    g.add_node("planner", planner_node)
    g.add_node("executor", executor_node)
    g.add_node("memory_writer", memory_writer_node)
    g.add_node("aggregator", aggregator_node)

    # 连线
    g.set_entry_point("guard")
    g.add_conditional_edges("guard", route_guard, {
        "end": END,
        "memory_reader": "memory_reader",
    })
    g.add_edge("memory_reader", "intent_router")
    g.add_edge("intent_router", "planner")
    g.add_edge("planner", "executor")
    g.add_edge("executor", "memory_writer")
    g.add_edge("memory_writer", "aggregator")
    g.add_edge("aggregator", END)

    return g.compile(checkpointer=checkpointer, store=store)
