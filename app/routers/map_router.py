
import asyncio
import hashlib
import logging
from pathlib import Path

import aiohttp
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

from app.utils.config import PROJECT_ROOT, settings
from app.utils.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/map", tags=["地图"])

AMAP_STATIC_URL = "https://restapi.amap.com/v3/staticmap"
CACHE_DIR = PROJECT_ROOT / "data" / "map_cache"
CACHE_MAX_AGE = "public, max-age=86400"

_session: aiohttp.ClientSession | None = None
_map_limiter = RateLimiter(max_per_minute=30)


async def _get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
    return _session


async def _fetch_amap_static(params: dict) -> tuple[int, str, bytes]:
    """拉取高德静态地图，返回 (status, content_type, body)。独立成函数便于测试打桩。"""
    session = await _get_session()
    async with session.get(AMAP_STATIC_URL, params=params) as response:
        return response.status, response.content_type, await response.read()


def _cache_paths(key_seed: str) -> tuple[Path, Path]:
    digest = hashlib.sha256(key_seed.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{digest}.img", CACHE_DIR / f"{digest}.meta"


@router.get("/static")
async def static_map(
    request: Request,
    lng: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    zoom: int = Query(..., ge=3, le=17),
    w: int = Query(..., ge=64, le=1024),
    h: int = Query(..., ge=64, le=1024),
    scale: int = Query(..., ge=1, le=2),
) -> Response:
    """静态底图代理：Web 服务 Key 只留服务端，前端经此取图（磁盘缓存 + 浏览器缓存）。"""
    await _map_limiter.check(request.client.host if request.client else "unknown")

    key = settings.amap_webservice_key
    if not key:
        raise HTTPException(503, "未配置 AMAP_WEBSERVICE_KEY（高德 Web 服务 Key），静态底图不可用")

    seed = f"{lng:.6f},{lat:.6f},{zoom},{w},{h},{scale}"
    img_path, meta_path = _cache_paths(seed)
    if img_path.exists() and meta_path.exists():
        media_type = meta_path.read_text(encoding="utf-8").strip() or "image/png"
        return FileResponse(img_path, media_type=media_type, headers={"Cache-Control": CACHE_MAX_AGE})

    params = {
        "location": f"{lng:.6f},{lat:.6f}",
        "zoom": zoom,
        "size": f"{w}*{h}",
        "scale": scale,
        "key": key,
    }
    try:
        status, content_type, body = await _fetch_amap_static(params)
    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        logger.warning("静态底图上游请求失败: %s", exc)
        raise HTTPException(502, "静态底图服务暂不可用") from exc

    if not content_type.startswith("image/"):
        # 高德出错时返回 JSON（{"status":"0","info":"INVALID_USER_KEY"}）
        info = body[:200].decode("utf-8", errors="replace")
        logger.warning("高德静态地图返回错误 status=%s type=%s body=%s", status, content_type, info)
        raise HTTPException(502, "高德静态地图服务返回错误，请稍后再试")

    # 落盘缓存：写入失败不影响本次返回
    try:
        await asyncio.to_thread(_write_cache, img_path, meta_path, content_type, body)
    except OSError as exc:
        logger.warning("静态底图缓存写入失败（不影响返回）: %s", exc)

    return Response(content=body, media_type=content_type, headers={"Cache-Control": CACHE_MAX_AGE})


def _write_cache(img_path: Path, meta_path: Path, media_type: str, body: bytes) -> None:
    img_path.parent.mkdir(parents=True, exist_ok=True)
    img_path.write_bytes(body)
    meta_path.write_text(media_type, encoding="utf-8")
