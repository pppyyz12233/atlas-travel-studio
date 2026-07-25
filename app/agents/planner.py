"""动态 Planner —— 根据意图生成可变长度的步骤计划

特性:
- 确定性预过滤：出发地=目的地 → 自动去 flight; "当天回"/"不住" → 自动去 hotel
- LLM 细粒度裁剪：full_trip 下也支持动态省略不需要的 Worker
"""
import json
import re

from app.agents.state import AgentState
from app.utils.llm import chat


def _pre_filter_workers(msg: str, from_city: str, to_city: str,
                        workers: list[str]) -> tuple[list[str], list[str]]:
    """确定性预过滤：去掉明显不需要的 Worker。

    返回 (保留的 workers, 被去掉的 worker 名列表)
    """
    excluded = []

    # 同城 → 不需要航班
    if from_city == to_city and from_city not in ("出发地", "目的地", ""):
        if "flight" in workers:
            workers = [w for w in workers if w != "flight"]
            excluded.append("flight（出发地=目的地，不需要航班）")

    # "当天回" "不住" "不过夜" "一日游" → 不需要酒店
    if re.search(r"(当天回|不住宿?|不过夜|一日游|当天往返)", msg):
        if "hotel" in workers:
            workers = [w for w in workers if w != "hotel"]
            excluded.append("hotel（当天往返，不需要住宿）")

    return workers, excluded


async def generate_plan(state: AgentState, WORKERS: dict, WORKER_LIST: str,
                        _extract_cities, _default_plan) -> list[dict]:
    """根据意图 + 用户消息动态生成计划"""
    msg = state["messages"][-1]["content"]
    intent = state.get("intent", "full_trip")
    active_workers = state.get("active_workers", list(WORKERS.keys()))

    # Narrow intents use default_plan directly (no LLM needed)
    if intent != "full_trip":
        return _default_plan(msg, active_workers)

    # Full trip: 确定性预过滤 + LLM 细粒度裁剪
    from_city, to_city = _extract_cities(msg)
    active_workers, excluded = _pre_filter_workers(msg, from_city, to_city, active_workers)
    if excluded:
        print(f"[Planner] 预过滤去掉: {', '.join(excluded)}")

    # 剩余 Worker ≤ 2 → 直接用默认 plan，不调 LLM
    if len(active_workers) <= 2:
        return _default_plan(msg, active_workers)

    # 只把剩余的 Worker 喂给 LLM，让它精细判断
    available = ", ".join(
        f"{w}({WORKERS[w].name})" for w in active_workers
    )
    prompt = f"""可选 Worker: {available}
目的地: {to_city}, 出发地: {from_city}
已自动排除: {', '.join(excluded) if excluded else '无'}
用户需求: {msg}

根据需求生成执行计划 (JSON数组, 只用上面列出的 Worker)。
如果某个 Worker 不是必需的可以省略。只输出JSON:

示例: [{{"id":1,"name":"推荐景点","worker":"attraction","description":"推荐{to_city}的热门景点","depends_on":[]}}]
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
