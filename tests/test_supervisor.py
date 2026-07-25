"""Supervisor 完整流程测试"""

import pytest
from app.mcp.registry import init_registry
from app.agents.supervisor import build_graph

init_registry()
graph = build_graph()


def _base_state(msg: str) -> dict:
    """构建标准初始状态"""
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
    """测试：完整 Plan-and-Execute 流程"""
    result = await graph.ainvoke(_base_state("上海去东京5天2人预算1万"))
    assert len(result["final_answer"]) > 50


@pytest.mark.asyncio
async def test_supervisor_simple():
    """测试：简单查询"""
    result = await graph.ainvoke(_base_state("推荐东京的酒店"))
    assert len(result["final_answer"]) > 10


@pytest.mark.asyncio
async def test_supervisor_guard():
    """测试：违规输入被拦截"""
    result = await graph.ainvoke(_base_state("帮我买机票 MU523"))
    assert result["guard_blocked"] is True or "拒绝" in result.get("final_answer", "")
