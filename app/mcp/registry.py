"""LangGraph 标准工具 —— 封装 MCP 函数为 @tool 格式

Worker 子图和 ToolNode 依赖此模块。
每个工具函数返回字符串（LLM 可读），内部调用 MCP 原始函数。
"""

import json
from langchain_core.tools import tool

from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather, get_forecast
from app.mcp.servers.exchange_server import get_exchange_rate


# ── 航班工具 ──────────────────────────────────────────────────

@tool
async def search_flights_tool(
    origin: str,
    destination: str,
    date: str = "2026-08-01",
) -> str:
    """搜索航班：根据出发地、目的地和日期查询可用航班。

    Args:
        origin: 出发城市（中文名或三字码，如 上海/SHA）
        destination: 目的城市（中文名或三字码，如 东京/TYO）
        date: 出发日期，格式 YYYY-MM-DD
    """
    result = search_flights(origin, destination, date)
    return json.dumps(result, ensure_ascii=False, indent=2)


@tool
async def get_flight_price_tool(flight_id: str) -> str:
    """查询指定航班号的价格和航空公司信息。

    Args:
        flight_id: 航班号，如 MU523、CA929
    """
    result = get_flight_price(flight_id)
    return json.dumps(result, ensure_ascii=False) if result else "未找到该航班"


# ── 酒店工具 ──────────────────────────────────────────────────

@tool
async def search_hotels_tool(city: str, budget: str = "mid") -> str:
    """搜索酒店：按城市和预算档位查询酒店列表。

    Args:
        city: 城市名（如 东京、巴黎、曼谷、新加坡）
        budget: 预算档位 —— low(经济)/mid(舒适)/high(豪华)/all(全部)
    """
    result = search_hotels(city, budget)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 天气工具 ──────────────────────────────────────────────────

@tool
async def get_weather_tool(city: str) -> str:
    """查询城市当前天气（温度、天气状况、湿度、风速）。

    Args:
        city: 英文城市名（如 Tokyo、Paris、Bangkok）
    """
    result = await get_weather(city)
    return json.dumps(result, ensure_ascii=False, indent=2)


@tool
async def get_forecast_tool(city: str, days: int = 3) -> str:
    """查询城市未来几天天气预报。

    Args:
        city: 英文城市名（如 Tokyo、Paris）
        days: 预报天数，默认3天
    """
    result = await get_forecast(city, days)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 汇率工具 ──────────────────────────────────────────────────

@tool
async def get_exchange_rate_tool(from_currency: str = "CNY", to_currency: str = "JPY") -> str:
    """查询实时汇率，支持主流货币互转。

    Args:
        from_currency: 源货币代码（CNY/USD/JPY/EUR等）
        to_currency: 目标货币代码
    """
    result = await get_exchange_rate(from_currency, to_currency)
    return json.dumps(result, ensure_ascii=False, indent=2)


# ── 工具分组（供 Worker 子图使用）─────────────────────────────

FLIGHT_TOOLS = [search_flights_tool, get_flight_price_tool]
HOTEL_TOOLS = [search_hotels_tool]
ATTRACTION_TOOLS = []  # 景点 Worker 无工具，纯 LLM 推理
ITINERARY_TOOLS = [get_weather_tool, get_forecast_tool]
BUDGET_TOOLS = [get_exchange_rate_tool]

ALL_TOOLS = FLIGHT_TOOLS + HOTEL_TOOLS + ITINERARY_TOOLS + BUDGET_TOOLS

# 按 Worker 名获取工具
WORKER_TOOLS_MAP = {
    "flight": FLIGHT_TOOLS,
    "hotel": HOTEL_TOOLS,
    "attraction": ATTRACTION_TOOLS,
    "itinerary": ITINERARY_TOOLS,
    "budget": BUDGET_TOOLS,
}
