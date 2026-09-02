"""工具调用评分（纯函数，供评测脚本与单元测试共用）。

口径说明（与 README 一致）：
    required_tools  必须调用：缺了就无法满足用户真实需求的工具
    optional_tools  可选工具：调用可以加分，不调用不算错
    called          实际调用序列（保留顺序与重复）

    必须工具召回率   Σ|required ∩ called集合| / Σ|required|
    可选工具调用率   Σ|optional ∩ called集合| / Σ|optional|
    错误调用         called 中不属于 required∪optional 的调用（按次计）
    过量调用         属于 required∪optional 但重复的调用（第 2 次起每多次记 1）
"""

from __future__ import annotations


def score_tools(required: list[str], optional: list[str], called: list[str]) -> dict:
    required = set(required or [])
    optional = set(optional or [])
    called = list(called or [])
    allowed = required | optional

    called_set = set(called)
    required_hit = sorted(required & called_set)
    required_missed = sorted(required - called_set)
    optional_hit = sorted(optional & called_set)

    wrong_calls = [c for c in called if c not in allowed]

    excess_calls: list[str] = []
    seen: set[str] = set()
    for c in called:
        if c in allowed:
            if c in seen:
                excess_calls.append(c)
            seen.add(c)

    return {
        "required_hit": required_hit,
        "required_missed": required_missed,
        "optional_hit": optional_hit,
        "wrong_calls": wrong_calls,
        "excess_calls": excess_calls,
        # 比率（分母为 0 时为 None，表示该维度不适用，不计入聚合）
        "required_recall": (len(required_hit) / len(required)) if required else None,
        "optional_usage": (len(optional_hit) / len(optional)) if optional else None,
        "wrong_count": len(wrong_calls),
        "excess_count": len(excess_calls),
        "total_calls": len(called),
    }
