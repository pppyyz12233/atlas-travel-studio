# -*- coding: utf-8 -*-
"""静态底图代理测试：只挂载 map 路由（不碰 checkpoint.db，可与开发服务并存）。"""
import sys
from pathlib import Path

import aiohttp
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.routers import map_router  # noqa: E402


def make_client() -> TestClient:
    app = FastAPI()
    app.include_router(map_router.router, prefix="/api")
    return TestClient(app)


BASE = "/api/map/static"
QUERY = f"{BASE}?lng=113.280000&lat=23.130000&zoom=12&w=960&h=600&scale=2"
FAKE_PNG = b"\x89PNG-fake-bytes"


async def fake_image(params):
    return 200, "image/png", FAKE_PNG


class TestStaticMap:
    def test_image_passthrough_with_cache_headers(self, monkeypatch, tmp_path):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "test-webservice-key")
        monkeypatch.setattr(map_router, "_fetch_amap_static", fake_image)
        monkeypatch.setattr(map_router, "CACHE_DIR", tmp_path)
        with make_client() as client:
            response = client.get(QUERY)
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("image/png")
        assert response.content == FAKE_PNG
        assert response.headers["cache-control"] == "public, max-age=86400"

    def test_amap_json_error_maps_to_502(self, monkeypatch, tmp_path):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "test-webservice-key")

        async def json_error(params):
            return 200, "application/json", b'{"status":"0","info":"INVALID_USER_KEY"}'

        monkeypatch.setattr(map_router, "_fetch_amap_static", json_error)
        monkeypatch.setattr(map_router, "CACHE_DIR", tmp_path)
        with make_client() as client:
            response = client.get(QUERY)
        assert response.status_code == 502
        assert "高德静态地图" in response.json()["detail"]

    def test_validation_rejections(self, monkeypatch):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "test-webservice-key")
        cases = [
            f"{BASE}?lng=113.28&lat=23.13&zoom=18&w=960&h=600&scale=2",
            f"{BASE}?lng=113.28&lat=23.13&zoom=12&w=2000&h=600&scale=2",
            f"{BASE}?lng=200&lat=23.13&zoom=12&w=960&h=600&scale=2",
            f"{BASE}?lng=113.28&lat=23.13&zoom=12&w=960&h=600&scale=3",
        ]
        with make_client() as client:
            for url in cases:
                assert client.get(url).status_code == 422, url

    def test_second_request_hits_disk_cache(self, monkeypatch, tmp_path):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "test-webservice-key")
        calls = {"count": 0}

        async def counting_fetch(params):
            calls["count"] += 1
            return 200, "image/png", FAKE_PNG

        monkeypatch.setattr(map_router, "_fetch_amap_static", counting_fetch)
        monkeypatch.setattr(map_router, "CACHE_DIR", tmp_path)
        with make_client() as client:
            first = client.get(QUERY)
            second = client.get(QUERY)
        assert calls["count"] == 1
        assert first.status_code == second.status_code == 200
        assert first.content == second.content == FAKE_PNG
        assert list(tmp_path.glob("*.img")) and list(tmp_path.glob("*.meta"))

    def test_missing_key_returns_503_without_fetch(self, monkeypatch, tmp_path):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "")
        calls = {"count": 0}

        async def counting_fetch(params):
            calls["count"] += 1
            return 200, "image/png", FAKE_PNG

        monkeypatch.setattr(map_router, "_fetch_amap_static", counting_fetch)
        monkeypatch.setattr(map_router, "CACHE_DIR", tmp_path)
        with make_client() as client:
            response = client.get(QUERY)
        assert response.status_code == 503
        assert "AMAP_WEBSERVICE_KEY" in response.json()["detail"]
        assert calls["count"] == 0

    def test_upstream_error_maps_to_502(self, monkeypatch, tmp_path):
        monkeypatch.setattr(map_router.settings, "amap_webservice_key", "test-webservice-key")

        async def broken_fetch(params):
            raise aiohttp.ClientError("boom")

        monkeypatch.setattr(map_router, "_fetch_amap_static", broken_fetch)
        monkeypatch.setattr(map_router, "CACHE_DIR", tmp_path)
        with make_client() as client:
            response = client.get(QUERY)
        assert response.status_code == 502
