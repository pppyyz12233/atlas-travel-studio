"""Supervisor 完整流程测试"""
import pytest
from app.agents.supervisor import build_graph

graph = build_graph()


def _base_state(msg: str) -> dict:
    return {
        "messages": [{"role": "user", "content": msg}],
        "plan_steps": [],
        "current_step_index": 0,
        "final_answer": "",
        "guard_blocked": False,
        "guard_reason": "",
    }


@pytest.mark.asyncio
async def test_supervisor_full_flow():
    result = await graph.ainvoke(_base_state("上海去东京5天2人预算1万"))
    assert len(result["final_answer"]) > 50


@pytest.mark.asyncio
async def test_supervisor_simple():
    result = await graph.ainvoke(_base_state("推荐东京的酒店"))
    assert len(result["final_answer"]) > 10


@pytest.mark.asyncio
async def test_supervisor_guard():
    result = await graph.ainvoke(_base_state("帮我买机票 MU523"))
    assert result["guard_blocked"] or "拒绝" in result.get("final_answer", "")
