"""动态 Planner —— 根据意图生成可变长度的步骤计划"""
import json

from app.agents.state import AgentState
from app.utils.llm import chat


async def generate_plan(state: AgentState, WORKERS: dict, WORKER_LIST: str,
                        _extract_cities, _default_plan) -> list[dict]:
    """根据意图 + 用户消息动态生成计划"""
    msg = state["messages"][-1]["content"]
    intent = state.get("intent", "full_trip")
    active_workers = state.get("active_workers", list(WORKERS.keys()))

    # Narrow intents use default_plan directly (no LLM needed)
    if intent != "full_trip":
        return _default_plan(msg, active_workers)

    # Full trip: let LLM customize the plan
    from_city, to_city = _extract_cities(msg)
    prompt = f"""可选 Worker: {WORKER_LIST}
目的地: {to_city}, 出发地: {from_city}
用户需求: {msg}

根据需求生成执行计划 (JSON数组, 每项含 worker 字段)。
不需要的步骤可以省略。只输出JSON:

示例: [{{"id":1,"name":"查航班","worker":"flight","description":"查{from_city}到{to_city}的航班","depends_on":[]}}]
"""
    try:
        resp = await chat([{"role": "user", "content": prompt}])
        content = resp.get("content", "").strip()
        s = content.find("[")
        e = content.rfind("]")
        if s != -1 and e != -1:
            plan = json.loads(content[s:e + 1])
            plan = [
                x for x in plan
                if isinstance(x, dict) and "worker" in x and x["worker"] in WORKERS
            ]
            if plan:
                for i, step in enumerate(plan):
                    step.setdefault("id", i + 1)
                    step.setdefault("depends_on", [])
                    step.setdefault("status", "pending")
                return plan
    except Exception:
        pass
    return _default_plan(msg, active_workers)
