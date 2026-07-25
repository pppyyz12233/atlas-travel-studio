"""MCP 工具层测试"""

import pytest
from app.mcp.registry import init_registry, ToolRegistry
from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather
from app.mcp.servers.exchange_server import get_exchange_rate

init_registry()


def test_registry_count():
    """测试：注册了 6 个工具"""
    tools = ToolRegistry.list_tools()
    assert len(tools) == 6


def test_flight_search():
    """测试：航班搜索"""
    results = search_flights("上海", "东京")
    assert len(results) >= 1
    assert results[0]["id"] in ["MU523", "CA929", "CA123"]


def test_flight_search_by_code():
    """测试：三字码搜索"""
    results = search_flights("SHA", "TYO")
    assert len(results) >= 1


def test_hotel_search():
    """测试：酒店搜索"""
    results = search_hotels("东京", "mid")
    assert len(results) >= 1
    assert all(h["city"] == "东京" for h in results)


def test_hotel_search_low():
    """测试：低档酒店"""
    results = search_hotels("曼谷", "low")
    assert len(results) >= 1


@pytest.mark.asyncio
async def test_registry_call():
    """测试：通过注册表调工具"""
    result = await ToolRegistry.call("search_flights", origin="上海", destination="东京")
    assert "MU523" in result or "CA929" in result
