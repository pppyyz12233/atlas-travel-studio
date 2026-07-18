import json
import asyncio
import time
from langgraph.graph import StateGraph, END
from app.agents.state import AgentState
from app.agents.intent_router import classify_intent
from app.agents.workflow.guard import check
from app.agents.workers.flight_worker import FlightWorker
from app.agents.workers.hotel_worker import HotelWorker
from app.agents.workers.attraction_worker import AttractionWorker
from app.agents.workers.itinerary_worker import ItineraryWorker
from app.agents.workers.budget_worker import BudgetWorker
from app.utils.llm import chat
from app.schemas.trip import TripState, Location, TripItem, StepOutput


WORKERS = {
    "flight": FlightWorker(),
    "hotel": HotelWorker(),
    "attraction": AttractionWorker(),
    "itinerary": ItineraryWorker(),
    "budget": BudgetWorker(),
}

WORKER_LIST = "flight(航班) hotel(酒店) attraction(景点) itinerary(日程) budget(预算)"

# 常用城市列表
CHINA_CITIES = ["上海", "北京", "深圳", "广州", "杭州", "成都", "南京", "重庆", "武汉", "西安"]
OVERSEAS_CITIES = ["东京", "巴黎", "曼谷", "新加坡", "伦敦", "纽约", "悉尼", "迪拜", "首尔", "大阪", "京都"]


def _extract_cities(msg: str) -> tuple[str, str]:
    """从消息中提取出发地和目的地"""
    from_city, to_city = "出发地", "目的地"

    # 按"从X去Y"或"X到Y"模式提取
    import re
    patterns = [
        r"从(\S{1,4})[去到往](\S{1,4})",
        r"(\S{1,4})[去到往](\S{1,4})",
    ]
    for p in patterns:
        m = re.search(p, msg)
        if m:
            candidate_from, candidate_to = m.group(1), m.group(2)
            # 只信任已知城市
            all_cities = CHINA_CITIES + OVERSEAS_CITIES
            if candidate_from in all_cities or any(c in candidate_from for c in all_cities):
                from_city = candidate_from
            if candidate_to in all_cities or any(c in candidate_to for c in all_cities):
                to_city = candidate_to
            if from_city != "出发地" and to_city != "目的地":
                return from_city, to_city

    # 兜底：简单关键词匹配
    for c in OVERSEAS_CITIES + CHINA_CITIES:
        if c in msg:
            if to_city == "目的地":
                to_city = c
            elif from_city == "出发地":
                from_city = c
    return from_city, to_city


def _get_dep_ids(workers: list[str], deps: list[str]) -> list[int]:
    """Calculate depends_on IDs based on worker positions"""
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


async def intent_router_node(state: AgentState) -> AgentState:
    """分类用户意图，决定该跑哪些 Worker"""
    msg = state["messages"][-1]["content"]
    result = await classify_intent(msg)
    state["intent"] = result.intent.value
    state["active_workers"] = result.workers
    print(f"[Intent] {result.intent.value} → workers: {result.workers}")
    return state


async def guard_node(state: AgentState) -> AgentState:
    msg = state["messages"][-1]["content"]
    blocked, reason = check(msg)
    state["guard_blocked"] = blocked
    state["guard_reason"] = reason
    if blocked:
        state["final_answer"] = f"拒绝处理：{reason}"
    return state


async def planner_node(state: AgentState) -> AgentState:
    msg = state["messages"][-1]["content"]
    active_workers = state.get("active_workers")
    plan = _default_plan(msg, active_workers)

    try:
        prompt = f"""可选Worker: {WORKER_LIST}
用户: {msg}
输出JSON数组(至少3项，每项含worker字段):
[{{"id":1,"name":"...","worker":"flight","description":"..."}}]
只输出JSON:"""
        resp = await chat([{"role": "user", "content": prompt}])
        content = resp.get("content", "").strip()
        s = content.find("[")
        e = content.rfind("]")
        if s != -1 and e != -1:
            llm_plan = json.loads(content[s:e + 1])
            if isinstance(llm_plan, dict):
                llm_plan = list(llm_plan.values())
            llm_plan = [x for x in llm_plan if isinstance(x, dict) and "worker" in x and x["worker"] in WORKERS]
            if len(llm_plan) >= 3:
                plan = llm_plan
    except Exception:
        pass  # LLM 解析失败时使用兜底计划

    state["plan_steps"] = plan
    state["current_step_index"] = 0
    print(f"[Planner] {len(plan)}步计划")
    return state


async def _extract_structured(text: str, worker_type: str) -> StepOutput:
    """从 Worker 的纯文本输出中提取结构化数据 (一次轻量 LLM 调用)"""
    prompt = f"""Extract structured data from this travel assistant output. Return ONLY valid JSON, no explanation.

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
        s = content.find("{"); e = content.rfind("}")
        if s != -1 and e != -1:
            return StepOutput(**json.loads(content[s:e+1]))
    except Exception:
        pass
    return StepOutput(summary=text[:80])


async def _run_one_step(step: dict, ctx: list | None) -> None:
    """执行单个步骤，原地修改 step 的 result/status"""
    w = WORKERS.get(step.get("worker", ""))
    if not w:
        step["status"] = "failed"
        step["result"] = "无对应Worker"
        return

    print(f"  [Executor] {step['name']} 开始...")
    step["status"] = "running"
    try:
        result = await w.run_structured(
            query=step.get("description", ""),
            context=ctx if ctx else None
        )
        step["result"] = result.content
        step["status"] = "done" if result.success else "failed"
        step["tool_calls_made"] = [
            {"name": tc.name, "args": tc.arguments, "ok": tc.success}
            for tc in result.tool_calls_made
        ]
        step["iterations"] = result.iterations
        step["tokens_est"] = result.tokens_used_estimate

        # Extract structured data (locations, items, summary)
        if result.success and result.content:
            try:
                structured = await _extract_structured(
                    result.content, step.get("worker", "")
                )
                step["summary"] = structured.summary
                step["locations"] = [
                    {"lng": loc.lng, "lat": loc.lat, "name": loc.name,
                     "address": loc.address, "type": loc.type}
                    for loc in structured.locations
                ]
                step["items"] = [
                    {"name": it.name, "detail": it.detail,
                     "price": it.price, "date": it.date}
                    for it in structured.items
                ]
            except Exception:
                pass  # structured extraction is best-effort

        print(f"  [Executor] {step['name']} [OK] ({result.iterations}轮, ~{result.tokens_used_estimate}tok)")
    except Exception as e:
        step["result"] = str(e)
        step["status"] = "failed"
        print(f"  [Executor] {step['name']} [FAIL] {e}")


def _infer_depends_on(step: dict) -> list[int]:
    """推断步骤依赖：如果没显式声明，itinerary 依赖 flight+hotel+attraction"""
    if "depends_on" in step:
        return step["depends_on"]
    if step.get("worker") == "itinerary":
        return [s["id"] for s in [] if s.get("worker") in {"flight", "hotel", "attraction"}]
    return []


def _build_execution_layers(steps: list[dict]) -> list[list[dict]]:
    """将步骤按依赖关系分组为执行层"""
    layers = []
    remaining = list(steps)
    done_ids = set()

    while remaining:
        layer = []
        for s in remaining[:]:
            deps = _infer_depends_on(s)
            if all(d in done_ids for d in deps):
                layer.append(s)
                remaining.remove(s)
        if not layer:
            # 兜底：有循环依赖，剩余的全部放进最后一层
            layer = remaining[:]
            remaining = []
        layers.append(layer)
        for s in layer:
            done_ids.add(s["id"])
    return layers


def _build_context(steps: list[dict]) -> list[dict]:
    """从已完成的步骤构建 context"""
    return [
        {"step": s["name"], "result": s.get("result", "")}
        for s in steps if s.get("status") == "done"
    ]


async def executor_node(state: AgentState) -> AgentState:
    """并行执行器：无依赖步骤并发跑，有依赖的等依赖完成后再跑"""
    steps = state.get("plan_steps", [])
    if not steps:
        state["current_step_index"] = 999
        return state

    # 补充 depends_on（兼容旧 plan）
    for s in steps:
        if "depends_on" not in s:
            s["depends_on"] = _infer_depends_on(s)

    layers = _build_execution_layers(steps)

    t_start = time.time()
    all_steps = [s for layer in layers for s in layer]
    print(f"[Executor] {len(all_steps)}步, {len(layers)}层: "
          f"{' → '.join(['|'.join(s['name'] for s in layer) for layer in layers])}")

    for i, layer in enumerate(layers):
        layer_ctx = _build_context(steps)

        if len(layer) == 1:
            # 单步骤直接跑
            await _run_one_step(layer[0], layer_ctx if layer_ctx else None)
        else:
            # 多步骤并行跑
            print(f"  [Executor] 并行执行 {len(layer)} 步: {[s['name'] for s in layer]}")
            await asyncio.gather(*[
                _run_one_step(s, None)  # 同层独立，不需要前序上下文
                for s in layer
            ])

    elapsed = time.time() - t_start
    done_count = sum(1 for s in steps if s.get("status") == "done")
    print(f"[Executor] 完成: {done_count}/{len(steps)}步, 耗时 {elapsed:.1f}s")

    state["current_step_index"] = len(steps)
    return state


def _build_trip_state(steps: list[dict]) -> TripState:
    """从步骤的结构化输出中构建 TripState"""
    ts = TripState()
    for s in steps:
        items = s.get("items", [])
        locs = s.get("locations", [])
        worker = s.get("worker", "")

        if worker == "flight":
            ts.flights = [TripItem(**it) for it in items]
        elif worker == "hotel":
            ts.hotels = [TripItem(**it) for it in items]
        elif worker == "attraction":
            ts.attractions = [TripItem(**it) for it in items]
        elif worker == "itinerary":
            ts.itinerary = items  # keep raw dicts for flexible structure
        elif worker == "budget":
            ts.budget_items = items

        for loc in locs:
            ts.locations.append(Location(**loc))

    return ts


async def aggregator_node(state: AgentState) -> AgentState:
    steps = state.get("plan_steps", [])
    msg = state["messages"][-1]["content"]

    # Build structured trip state from step outputs
    trip_state = _build_trip_state(steps)

    text = "\n\n".join([f"Step{s['id']}[{s['name']}]:\n{s.get('result', '')}" for s in steps])

    # Include structured trip state for modification requests
    trip_json = ""
    if trip_state.flights or trip_state.hotels or trip_state.attractions:
        trip_json = f"\n\n【结构化行程状态 (用于精确定位修改)】\n{trip_state.model_dump_json(indent=2, ensure_ascii=False)}\n"

    p = f"""汇总旅行方案。每个板块空行分隔。多用表格。
如果用户是修改已有方案，根据结构化状态精确定位要改的部分。

用户需求：{msg}
各步骤结果：{text}{trip_json}

输出方案："""
    r = await chat([{"role": "user", "content": p}])
    state["final_answer"] = r.get("content", "")

    # Store trip state for context in future turns
    state["trip_state"] = trip_state.model_dump()

    return state


def route_guard(s):
    return "end" if s.get("guard_blocked") else "intent_router"


def route_executor(s):
    """executor 现在一次性跑完所有步骤，不再自循环"""
    return "aggregator"


_graph = None


def build_graph():
    global _graph
    if _graph:
        return _graph
    g = StateGraph(AgentState)
    g.add_node("guard", guard_node)
    g.add_node("intent_router", intent_router_node)
    g.add_node("planner", planner_node)
    g.add_node("executor", executor_node)
    g.add_node("aggregator", aggregator_node)
    g.set_entry_point("guard")
    g.add_conditional_edges("guard", route_guard, {"end": END, "intent_router": "intent_router"})
    g.add_edge("intent_router", "planner")
    g.add_edge("planner", "executor")
    g.add_conditional_edges("executor", route_executor, {"executor": "executor", "aggregator": "aggregator"})
    g.add_edge("aggregator", END)
    _graph = g.compile()
    return _graph

