"""评测口径单元测试（eval/scoring.py）——不调真实 API，不访问外网。"""

from scoring import score_tools


def test_only_required_called_passes():
    """只调用必须工具：必须工具召回率 1.0，判定通过。"""
    s = score_tools(
        required=["search_flights_tool"],
        optional=["get_flight_price_tool"],
        called=["search_flights_tool"],
    )
    assert s["required_recall"] == 1.0
    assert s["required_missed"] == []
    assert s["wrong_calls"] == []
    assert s["excess_calls"] == []


def test_missing_required_fails():
    """缺少必须工具：召回率 < 1，判定失败。"""
    s = score_tools(
        required=["search_flights_tool", "search_hotels_tool"],
        optional=[],
        called=["search_hotels_tool"],
    )
    assert s["required_recall"] == 0.5
    assert s["required_missed"] == ["search_flights_tool"]


def test_no_optional_called_is_not_failure():
    """没调用可选工具：不算错，调用率为 0 但 required 仍满分。"""
    s = score_tools(
        required=["search_flights_tool"],
        optional=["get_weather_tool", "get_forecast_tool"],
        called=["search_flights_tool"],
    )
    assert s["required_recall"] == 1.0
    assert s["optional_usage"] == 0.0
    assert s["wrong_calls"] == []  # 未调可选工具不计为错误


def test_irrelevant_tool_counts_as_wrong_call():
    """调用不相关工具：计入错误调用（如国内行程查汇率）。"""
    s = score_tools(
        required=["search_flights_tool"],
        optional=[],
        called=["search_flights_tool", "get_exchange_rate_tool"],
    )
    assert s["required_recall"] == 1.0
    assert s["wrong_calls"] == ["get_exchange_rate_tool"]
    assert s["wrong_count"] == 1


def test_duplicate_calls_counted_as_excess():
    """工具重复调用可被识别：第 2 次起计入过量调用。"""
    s = score_tools(
        required=["search_flights_tool"],
        optional=["get_flight_price_tool"],
        called=["search_flights_tool", "get_flight_price_tool",
                "get_flight_price_tool", "get_flight_price_tool"],
    )
    assert s["required_recall"] == 1.0
    assert s["excess_calls"] == ["get_flight_price_tool", "get_flight_price_tool"]
    assert s["excess_count"] == 2
    assert s["total_calls"] == 4


def test_no_required_tools_is_not_failure():
    """required 为空（如纯景点类）：召回率为 None（不适用），不判失败。"""
    s = score_tools(
        required=[],
        optional=["get_weather_tool"],
        called=[],
    )
    assert s["required_recall"] is None
    assert s["optional_usage"] == 0.0
    assert s["wrong_calls"] == []
