"""Worker 子图测试 —— 每个 Worker 是独立的 StateGraph"""

import pytest
from app.mcp.registry import init_registry
from app.agents.workers.flight_worker import flight_worker
from app.agents.workers.hotel_worker import hotel_worker
from app.agents.workers.attraction_worker import attraction_worker

init_registry()


@pytest.mark.asyncio
async def test_flight_worker():
    """测试：航班 Worker 子图"""
    result = await flight_worker.ainvoke({
        "messages": [{"role": "user", "content": "查上海到东京的航班"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 5


@pytest.mark.asyncio
async def test_hotel_worker():
    """测试：酒店 Worker 子图"""
    result = await hotel_worker.ainvoke({
        "messages": [{"role": "user", "content": "找东京的中档酒店"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 10


@pytest.mark.asyncio
async def test_attraction_worker():
    """测试：景点 Worker 子图"""
    result = await attraction_worker.ainvoke({
        "messages": [{"role": "user", "content": "推荐东京的景点"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 10


@pytest.mark.asyncio
async def test_worker_with_context():
    """测试：带上下文的 Worker"""
    result = await flight_worker.ainvoke({
        "messages": [
            {"role": "user", "content": "前序结果: MU523 2800元\n\n有没有更便宜的"}
        ]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 5
