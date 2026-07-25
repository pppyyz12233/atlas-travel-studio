"""工具注册表 —— Worker 通过它发现和调用工具

提供 OpenAI Function Calling 格式的工具列表，供 LLM Agent 使用。
内部 Worker 通过 ToolRegistry.call() 执行工具调用。

与标准 MCP 的关系:
  - registry.py: 内部工具注册表，供 Worker ReAct 循环使用
  - server.py:   标准 MCP stdio 服务器，供外部 MCP 客户端（Claude Desktop 等）使用
  - 两者共享 servers/ 下的同一套工具函数
"""

from app.mcp.servers.flight_server import search_flights, get_flight_price
from app.mcp.servers.hotel_server import search_hotels
from app.mcp.servers.weather_server import get_weather, get_forecast
from app.mcp.servers.exchange_server import get_exchange_rate
import asyncio
import inspect


class ToolRegistry:
    """工具注册表 —— 统一管理所有可用工具

    使用方式:
        # 注册阶段（启动时调用一次）
        init_registry()

        # Worker 获取工具列表（OpenAI Function Calling 格式）
        tools = ToolRegistry.list_tools()

        # Worker 执行工具调用
        result = await ToolRegistry.call("search_flights", origin="上海", destination="东京")
    """

    _tools: dict = {}  # {工具名: (函数, 描述, 参数定义)}

    @classmethod
    def register(cls, name: str, func, description: str, parameters: dict = None):
        """注册一个工具到注册表

        参数:
            name: 工具名称（英文，LLM 通过此名称调用）
            func: 工具函数（同步或异步均可）
            description: 工具描述（中文，写入 LLM prompt）
            parameters: JSON Schema 格式的参数定义
        """
        cls._tools[name] = (func, description, parameters or {})

    @classmethod
    def list_tools(cls) -> list[dict]:
        """返回 OpenAI Function Calling 格式的工具列表

        LLM 通过此列表知道有哪些工具可用，以及每个工具的参数签名。
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": desc,
                    "parameters": params,
                },
            }
            for name, (_, desc, params) in cls._tools.items()
        ]

    @classmethod
    async def call(cls, name: str, **kwargs) -> str:
        """异步调用工具

        自动检测函数是否为 async，统一返回字符串结果。

        参数:
            name: 工具名称
            **kwargs: 工具参数（如 origin="上海", destination="东京"）

        返回:
            字符串格式的工具执行结果
        """
        func, _, _ = cls._tools[name]
        if inspect.iscoroutinefunction(func):
            result = await func(**kwargs)
        else:
            result = func(**kwargs)
        # 统一转为字符串，方便 LLM 阅读
        if isinstance(result, (list, dict)):
            return str(result)
        return str(result)

    @classmethod
    def call_sync(cls, name: str, **kwargs) -> str:
        """同步调用工具（供非 async 上下文使用）

        内部通过 asyncio 事件循环执行 async 函数。
        """
        func, _, _ = cls._tools[name]
        if inspect.iscoroutinefunction(func):
            result = asyncio.get_event_loop().run_until_complete(func(**kwargs))
        else:
            result = func(**kwargs)
        if isinstance(result, (list, dict)):
            return str(result)
        return str(result)


def init_registry():
    """初始化工具注册表 —— 启动时调用一次

    注册全部 6 个 MCP 工具。工具的 JSON Schema 参数定义
    与 server.py 中 FastMCP 的参数类型声明保持一致。
    """
    ToolRegistry.register(
        "search_flights", search_flights,
        "搜索航班",
        {
            "type": "object",
            "properties": {
                "origin": {"type": "string", "description": "出发城市（中文名或三字码，如 上海/SHA）"},
                "destination": {"type": "string", "description": "目的城市（中文名或三字码，如 东京/TYO）"},
                "date": {"type": "string", "description": "日期，格式 YYYY-MM-DD"},
            },
            "required": ["origin", "destination"],
        },
    )
    ToolRegistry.register(
        "get_flight_price", get_flight_price,
        "查询航班价格",
        {
            "type": "object",
            "properties": {
                "flight_id": {"type": "string", "description": "航班号，如 MU523"},
            },
            "required": ["flight_id"],
        },
    )
    ToolRegistry.register(
        "search_hotels", search_hotels,
        "搜索酒店",
        {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名"},
                "budget": {"type": "string", "enum": ["low", "mid", "high", "all"],
                           "description": "预算档位：low(经济)/mid(舒适)/high(豪华)/all(全部)"},
            },
            "required": ["city"],
        },
    )
    ToolRegistry.register(
        "get_weather", get_weather,
        "查询城市当前天气",
        {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名称（英文，如 Tokyo、Paris）"},
            },
            "required": ["city"],
        },
    )
    ToolRegistry.register(
        "get_forecast", get_forecast,
        "查询城市未来几天天气预报",
        {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名称（英文）"},
                "days": {"type": "integer", "description": "预报天数，默认3天"},
            },
            "required": ["city"],
        },
    )
    ToolRegistry.register(
        "get_exchange_rate", get_exchange_rate,
        "查询汇率",
        {
            "type": "object",
            "properties": {
                "from_currency": {"type": "string", "description": "源货币代码（CNY/USD/JPY/EUR等）"},
                "to_currency": {"type": "string", "description": "目标货币代码"},
            },
        },
    )
