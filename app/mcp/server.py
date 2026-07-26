
from mcp.server.fastmcp import FastMCP

from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather, get_forecast
from app.mcp.servers.exchange_server import get_exchange_rate

# ── 创建 MCP 服务器实例 ──────────────────────────────────────
mcp = FastMCP("旅行规划助手")


# ── 航班工具 ──────────────────────────────────────────────────

@mcp.tool()
async def search_flights_tool(
    origin: str,
    destination: str,
    date: str = "2026-08-01",
) -> list[dict]:
    """搜索航班：根据出发地、目的地和日期查询可用航班。

    出发地和目的地可使用中文城市名（如"上海"、"东京"）或三字码（如"SHA"、"TYO"）。
    返回按价格从低到高排序的航班列表。
    """
    return search_flights(origin, destination, date)


@mcp.tool()
async def get_flight_price_tool(flight_id: str) -> dict | None:
    """查询指定航班号的价格和航空公司信息。

    flight_id 示例: "MU523", "CA929"
    """
    return get_flight_price(flight_id)


# ── 酒店工具 ──────────────────────────────────────────────────

@mcp.tool()
async def search_hotels_tool(
    city: str,
    budget: str = "mid",
) -> list[dict]:
    """搜索酒店：按城市和预算档位查询酒店列表。

    budget 可选值:
    - "low": 经济型（300-500元/晚）
    - "mid": 舒适型（500-1000元/晚）
    - "high": 豪华型（1000+元/晚）
    - "all": 全部档位

    返回按评分从高到低排序的酒店列表。
    """
    return search_hotels(city, budget)


# ── 天气工具 ──────────────────────────────────────────────────

@mcp.tool()
async def get_weather_tool(city: str) -> dict:
    """查询城市当前天气（温度、天气状况、湿度、风速）。

    city 使用英文城市名，如 "Tokyo", "Paris", "Bangkok"。
    数据来源: wttr.in
    """
    return await get_weather(city)


@mcp.tool()
async def get_forecast_tool(city: str, days: int = 3) -> list[dict]:
    """查询城市未来几天天气预报。

    city 使用英文城市名。
    days 预报天数，默认3天。
    数据来源: wttr.in
    """
    return await get_forecast(city, days)


# ── 汇率工具 ──────────────────────────────────────────────────

@mcp.tool()
async def get_exchange_rate_tool(
    from_currency: str = "CNY",
    to_currency: str = "JPY",
) -> dict:
    """查询实时汇率，支持主流货币互转。

    货币代码示例: CNY(人民币), USD(美元), JPY(日元), EUR(欧元), THB(泰铢), SGD(新加坡元)
    数据来源: exchangerate-api.com，离线时自动降级为内置汇率表。
    """
    return await get_exchange_rate(from_currency, to_currency)


# ── 启动入口 ──────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
