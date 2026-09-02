"""在线汇总统计回归测试（run_benchmark.summarize_online）——不调真实 API，不访问外网。

覆盖历史 Bug（2026-08-29 在线评测发现）：
1. guard 用例被计入意图准确率分母——30 条里 2 条 guard 不存在意图识别，
   却把 26/28=92.9% 算成了 26/30=86.7%；
2. LLM/工具调用均值的分子只累计非 guard 用例，分母却用全部用例数，均值被稀释。

口径：意图准确率分母=非 guard 用例数；guard 拦截单独统计；
计划成功率保留含 guard 版本，并额外输出非 guard 版本。
"""

from run_benchmark import summarize_online


def _ev(workers=(), tools=(), blocked=False, iterations=1, tool_calls=None, latency=None):
    steps = [] if blocked else [f"step_{w}" for w in workers]
    return {
        "blocked": blocked,
        "steps": steps,
        "workers": set() if blocked else set(workers),
        "tools_called": [] if blocked else list(tools),
        "iterations": 0 if blocked else iterations,
        "tool_calls": 0 if blocked else (len(tools) if tool_calls is None else tool_calls),
        "failed_steps": 0,
        "reply": "" if blocked else "这是一段足够长的最终回答。" * 10,
        "error": "",
        "plan_steps": 0,
        "done": not blocked,
        "latency": 1.0 if blocked else (latency if latency is not None else 20.0),
    }


def _case(cid, **kw):
    base = {
        "id": cid, "category": "flight_only", "message": "m",
        "guard_blocked": False, "intent": "flight_only",
        "workers": ["flight"], "cities": [None, None],
        "required_tools": ["search_flights_tool"], "optional_tools": [],
    }
    base.update(kw)
    return base


_GUARD_CASE = dict(
    category="guard_blocked", guard_blocked=True, intent=None,
    workers=[], required_tools=[], optional_tools=[],
)


def test_guard_excluded_from_intent_denominator():
    """Bug1 回归：意图准确率应为 1/2（非 guard），而不是 1/3（含 guard）。"""
    cases = [
        _case(1),
        _case(2),                       # 意图不匹配（hotel ≠ flight）
        _case(3, **_GUARD_CASE),
    ]
    events = [
        _ev(workers=["flight"], tools=["search_flights_tool"]),
        _ev(workers=["hotel"], tools=["search_hotels_tool"]),
        _ev(blocked=True),
    ]
    r = summarize_online(cases, events)

    assert r["cases"] == 3 and r["details_count"] == 3
    assert r["guard_cases"] == 1 and r["non_guard_cases"] == 2
    assert r["intent_accuracy"] == 0.5          # 1/2，不是 1/3
    assert r["guard_accuracy"] == 1.0           # 单独统计
    assert r["plan_success_rate"] == 1.0        # guard 正确拦截计入含 guard 口径
    assert r["non_guard_plan_success_rate"] == 1.0
    # guard 分类下意图准确率不适用
    assert r["per_category"]["guard_blocked"]["intent_accuracy"] is None


def test_guard_failure_only_affects_guard_metrics():
    """guard 拦截失败：guard_accuracy=0、含 guard 成功率降，非 guard 指标不受影响。"""
    cases = [_case(1), _case(2, **_GUARD_CASE)]
    events = [
        _ev(workers=["flight"], tools=["search_flights_tool"]),
        _ev(blocked=False),  # 该拦未拦
    ]
    r = summarize_online(cases, events)
    assert r["guard_accuracy"] == 0.0
    assert r["plan_success_rate"] == 0.5           # 1/2
    assert r["non_guard_plan_success_rate"] == 1.0
    assert r["intent_accuracy"] == 1.0


def test_avg_llm_and_tool_calls_use_non_guard_denominator():
    """Bug2 回归：LLM/工具均值分母为非 guard 用例数（分子只累计非 guard）。

    每条非 guard 用例 llm_est = 1(意图)+1(迭代)+1(成功步骤)+1(汇总) = 4；
    2 条共 8 次，均 4.0（旧算法 8/3=2.7）。工具每条 3 次，均 3.0（旧算法 2.0）。
    """
    cases = [_case(1), _case(2), _case(3, **_GUARD_CASE)]
    events = [
        _ev(workers=["flight"], tools=["search_flights_tool"], tool_calls=3),
        _ev(workers=["flight"], tools=["search_flights_tool"], tool_calls=3),
        _ev(blocked=True),
    ]
    r = summarize_online(cases, events)
    assert r["llm_calls_total_est"] == 8
    assert r["llm_calls_avg_est"] == 4.0
    assert r["tool_calls_total"] == 6
    assert r["tool_calls_avg"] == 3.0


def test_details_count_matches_cases():
    """每条用例（含 guard）都必须落一条 detail，报告完整性可校验。"""
    cases = [_case(1), _case(2, **_GUARD_CASE)]
    events = [_ev(workers=["flight"], tools=["search_flights_tool"]), _ev(blocked=True)]
    r = summarize_online(cases, events)
    assert len(r["details"]) == r["cases"] == r["details_count"] == 2
    assert {d["id"] for d in r["details"]} == {1, 2}
