import aiohttp


async def _fetch(city: str):
    """调用 wttr.in API，获取原始 JSON 天气数据。

    参数:
        city: 英文城市名（如 "Tokyo", "Paris"）

    返回:
        wttr.in 的完整 JSON 响应
    """
    url = f"https://wttr.in/{city}?format=j1"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            resp.raise_for_status()
            return await resp.json()


async def get_weather(city: str):
    """查询城市当前天气。

    参数:
        city: 英文城市名（如 "Tokyo", "Paris", "Bangkok"）

    返回:
        {"city": ..., "temp_c": ..., "weather": ..., "humidity": ..., "wind_kmh": ..., "feels_like": ...}
        查询失败时返回各字段为 "N/A" 的降级结果
    """
    try:
        data = await _fetch(city)
        cur = data["current_condition"][0]
        return {
            "city": city,
            "temp_c": cur["temp_C"],
            "weather": cur["weatherDesc"][0]["value"],
            "humidity": cur["humidity"],
            "wind_kmh": cur["windspeedKmph"],
            "feels_like": cur["FeelsLikeC"],
        }
    except Exception:
        return {
            "city": city, "temp_c": "N/A", "weather": "获取失败",
            "humidity": "N/A", "wind_kmh": "N/A", "feels_like": "N/A",
        }


async def get_forecast(city: str, days: int = 3):
    """查询城市未来几天天气预报。

    参数:
        city: 英文城市名（如 "Tokyo", "Paris"）
        days: 预报天数，默认3天

    返回:
        [{"date": ..., "max_c": ..., "min_c": ..., "avg_c": ..., "sun_hours": ...}, ...]
        查询失败时返回空列表
    """
    try:
        data = await _fetch(city)
        forecasts = []
        for day in data["weather"][:days]:
            forecasts.append({
                "date": day["date"], "max_c": day["maxtempC"],
                "min_c": day["mintempC"], "avg_c": day["avgtempC"],
                "sun_hours": day["sunHour"],
            })
        return forecasts
    except Exception:
        return []
