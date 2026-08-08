
from mcp.server.fastmcp import FastMCP

from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather, get_forecast
from app.mcp.servers.exchange_server import get_exchange_rate

#创建 MCP 服务器实例
mcp = FastMCP("旅行规划助手")

#直接注册底层函数
mcp.add_tool(search_flights)
mcp.add_tool(get_flight_price)
mcp.add_tool(search_hotels)
mcp.add_tool(get_weather)
mcp.add_tool(get_forecast)
mcp.add_tool(get_exchange_rate)

# 启动入口
if __name__ == "__main__":
    mcp.run()
