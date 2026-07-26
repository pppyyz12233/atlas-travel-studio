"""直接测试底层数据函数，不经过 ToolRegistry"""
import pytest
from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather
from app.mcp.servers.exchange_server import get_exchange_rate


def test_flight_search():
    results = search_flights("上海", "东京")
    assert len(results) >= 1
    assert results[0]["id"] in ["MU523", "CA929", "CA123"]


def test_flight_search_by_code():
    results = search_flights("SHA", "TYO")
    assert len(results) >= 1


def test_hotel_search():
    results = search_hotels("东京", "mid")
    assert len(results) >= 1
    assert all(h["city"] == "东京" for h in results)


def test_hotel_search_low():
    results = search_hotels("曼谷", "low")
    assert len(results) >= 1
