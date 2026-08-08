"""搜索路由 —— 分页列表，供前端选航班/酒店/景点"""

from fastapi import APIRouter, HTTPException, Query
from app.mcp.servers.flight_server import FLIGHT_DATA
from app.mcp.servers.hotel_server import HOTEL_DATA

router = APIRouter(prefix="/api/search", tags=["搜索"])


# ══════════════════════════════════════════════════════════════
# 航班搜索
# ══════════════════════════════════════════════════════════════

@router.get("/flights")
async def search_flights(
    origin: str = Query(..., min_length=1, description="出发城市"),
    destination: str = Query(..., min_length=1, description="目的城市"),
    date: str = Query("", description="出发日期"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    sort_by: str = Query("price", description="price / departure_time"),
):
    results = [
        f for f in FLIGHT_DATA
        if origin in f.get("origin", "") and destination in f.get("destination", "")
    ]
    if date:
        results = [f for f in results if f.get("date", "").startswith(date)]
    if sort_by == "departure_time":
        results.sort(key=lambda x: x.get("departure", ""))
    else:
        results.sort(key=lambda x: x.get("price", 0))
    total = len(results)
    start = (page - 1) * size
    items = results[start:start + size]
    return {"code": 200, "data": {"total": total, "items": items, "page": page, "size": size}}


# ══════════════════════════════════════════════════════════════
# 酒店搜索
# ══════════════════════════════════════════════════════════════

@router.get("/hotels")
async def search_hotels(
    destination: str = Query(..., min_length=1, description="目的城市"),
    check_in: str = Query("", description="入住日期"),
    check_out: str = Query("", description="离店日期"),
    min_price: float = Query(None, ge=0),
    max_price: float = Query(None, ge=0),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    sort_by: str = Query("price", description="price / rating"),
):
    results = [h for h in HOTEL_DATA if destination in h.get("city", "")]
    if min_price is not None:
        results = [h for h in results if h.get("price", 0) >= min_price]
    if max_price is not None and max_price > 0:
        results = [h for h in results if h.get("price", 0) <= max_price]
    if sort_by == "rating":
        results.sort(key=lambda x: x.get("rating", 0), reverse=True)
    else:
        results.sort(key=lambda x: x.get("price", 0))
    total = len(results)
    start = (page - 1) * size
    items = results[start:start + size]
    return {"code": 200, "data": {"total": total, "items": items, "page": page, "size": size}}


# ══════════════════════════════════════════════════════════════
# 景点搜索
# ══════════════════════════════════════════════════════════════

ATTRACTIONS_MOCK = [
    {"name": "东京迪士尼乐园", "city": "东京", "price": 430, "rating": 4.8, "category": "乐园",
     "address": "千叶县浦安市", "lng": 139.88, "lat": 35.63, "duration": "全天"},
    {"name": "浅草寺", "city": "东京", "price": 0, "rating": 4.5, "category": "寺庙",
     "address": "东京都台东区浅草", "lng": 139.79, "lat": 35.71, "duration": "1.5h"},
    {"name": "东京塔", "city": "东京", "price": 100, "rating": 4.4, "category": "观景",
     "address": "东京都港区芝公园", "lng": 139.75, "lat": 35.66, "duration": "2h"},
    {"name": "秋叶原", "city": "东京", "price": 0, "rating": 4.3, "category": "购物",
     "address": "东京都千代田区", "lng": 139.77, "lat": 35.70, "duration": "3h"},
    {"name": "明治神宫", "city": "东京", "price": 0, "rating": 4.6, "category": "寺庙",
     "address": "东京都涩谷区", "lng": 139.70, "lat": 35.68, "duration": "2h"},
    {"name": "银座", "city": "东京", "price": 0, "rating": 4.2, "category": "购物",
     "address": "东京都中央区", "lng": 139.76, "lat": 35.67, "duration": "2.5h"},
    {"name": "涩谷交叉路口", "city": "东京", "price": 0, "rating": 4.3, "category": "地标",
     "address": "东京都涩谷区", "lng": 139.70, "lat": 35.66, "duration": "0.5h"},
    {"name": "故宫", "city": "北京", "price": 60, "rating": 4.9, "category": "历史",
     "address": "北京市东城区", "lng": 116.40, "lat": 39.92, "duration": "3h"},
    {"name": "长城", "city": "北京", "price": 45, "rating": 4.8, "category": "历史",
     "address": "北京市延庆区", "lng": 116.02, "lat": 40.36, "duration": "半天"},
    {"name": "外滩", "city": "上海", "price": 0, "rating": 4.7, "category": "地标",
     "address": "上海市黄浦区", "lng": 121.49, "lat": 31.24, "duration": "1.5h"},
    {"name": "广州塔", "city": "广州", "price": 150, "rating": 4.5, "category": "观景",
     "address": "广州市海珠区", "lng": 113.32, "lat": 23.11, "duration": "2h"},
    {"name": "白云山", "city": "广州", "price": 5, "rating": 4.3, "category": "自然",
     "address": "广州市白云区", "lng": 113.30, "lat": 23.19, "duration": "3h"},
]


@router.get("/attractions")
async def search_attractions(
    destination: str = Query(..., min_length=1, description="目的城市"),
    category: str = Query("", description="类别筛选"),
    min_price: float = Query(None, ge=0),
    max_price: float = Query(None, ge=0),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    sort_by: str = Query("rating", description="price / rating"),
):
    results = [a for a in ATTRACTIONS_MOCK if destination in a.get("city", "")]
    if category:
        results = [a for a in results if category in a.get("category", "")]
    if min_price is not None:
        results = [a for a in results if a.get("price", 0) >= min_price]
    if max_price is not None and max_price > 0:
        results = [a for a in results if a.get("price", 0) <= max_price]
    if sort_by == "price":
        results.sort(key=lambda x: x.get("price", 0))
    else:
        results.sort(key=lambda x: x.get("rating", 0), reverse=True)
    total = len(results)
    start = (page - 1) * size
    items = results[start:start + size]
    return {"code": 200, "data": {"total": total, "items": items, "page": page, "size": size}}
