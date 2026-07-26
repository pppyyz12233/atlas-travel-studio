import aiohttp


async def get_exchange_rate(from_currency: str = "CNY", to_currency: str = "JPY") -> dict:
    """查询实时汇率，支持主流货币互转。

    参数:
        from_currency: 源货币代码，如 "CNY"（人民币）、"USD"（美元）
        to_currency:   目标货币代码，如 "JPY"（日元）、"EUR"（欧元）

    返回:
        {"from": ..., "to": ..., "rate": ..., "updated": ..., "description": ...}
        在线查询失败时自动降级为内置离线汇率表
    """
    try:
        url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                data = await resp.json()

        rate = data["rates"].get(to_currency)
        if rate is None:
            return {"error": f"不支持的货币: {to_currency}"}

        return {
            "from": from_currency, "to": to_currency,
            "rate": round(rate, 4), "updated": data.get("date", "unknown"),
            "description": f"1 {from_currency} = {round(rate, 4)} {to_currency}",
        }
    except Exception:
        # 离线降级 —— 内置常用货币对估算汇率
        fallback = {
            ("CNY", "JPY"): 20.5, ("CNY", "EUR"): 0.128,
            ("CNY", "USD"): 0.138, ("CNY", "THB"): 4.95,
            ("CNY", "SGD"): 0.186,
        }
        rate = fallback.get((from_currency, to_currency))
        if rate is None:
            return {"error": f"不支持: {from_currency} -> {to_currency}"}
        return {
            "from": from_currency, "to": to_currency,
            "rate": rate, "updated": "fallback",
            "description": f"1 {from_currency} = {rate} {to_currency}（离线估算）",
        }
