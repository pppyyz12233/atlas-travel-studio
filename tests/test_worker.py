"""Worker 子图测试"""
import pytest
from app.agents.workers.flight_worker import flight_worker
from app.agents.workers.hotel_worker import hotel_worker
from app.agents.workers.attraction_worker import attraction_worker


@pytest.mark.asyncio
async def test_flight_worker():
    result = await flight_worker.ainvoke({
        "messages": [{"role": "user", "content": "查上海到东京的航班"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 5


@pytest.mark.asyncio
async def test_hotel_worker():
    result = await hotel_worker.ainvoke({
        "messages": [{"role": "user", "content": "找东京的中档酒店"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 10


@pytest.mark.asyncio
async def test_attraction_worker():
    result = await attraction_worker.ainvoke({
        "messages": [{"role": "user", "content": "推荐东京的景点"}]
    })
    msgs = result.get("messages", [])
    content = msgs[-1].get("content", "") if msgs else ""
    assert len(content) > 10
