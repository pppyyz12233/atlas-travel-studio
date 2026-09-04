# -*- coding: utf-8 -*-
"""导出接口测试：游客 /guest PDF 与登录 GET PDF。

只挂载 export 路由 + 依赖覆盖，不起完整 app（避免占用 checkpoint.db 的
aiosqlite 连接，与正在运行的开发服务互锁）。
"""
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.routers.export_router import router as export_router  # noqa: E402
from app.utils.pdf_export import build_markdown  # noqa: E402


def make_client() -> TestClient:
    app = FastAPI()
    app.include_router(export_router, prefix="/api")
    return TestClient(app)


CHINESE_PLAN = (
    "# 旅行方案 — 广州\n\n**日期:** 2026-09-18\n\n---\n\n"
    "## 广州4天3晚旅行方案（2人）\n\n"
    "### 日程\n| 时段 | 地点 | 交通 | 备注 |\n|------|------|------|------|\n"
    "| 下午 | 陈家祠 | 地铁1号线 | 岭南建筑 |\n| 晚上 | 珠江夜游 | 轮渡 | 提前购票 |\n\n"
    "### 交通\n- 白云机场进城：地铁3号线直达\n\n### 住宿\n- 推荐住珠江新城或老城区荔湾\n"
)


class TestGuestExport:
    def test_guest_pdf_with_chinese_content(self):
        with make_client() as client:
            response = client.post(
                "/api/export/guest",
                json={"destination": "广州", "dates": "2026-09-18", "content": CHINESE_PLAN},
            )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content.startswith(b"%PDF-")
        # HTTP 头只允许 latin-1：中文名必须走 RFC 5987 filename*=UTF-8''，
        # 同时提供 ASCII 回落名（此前中文 filename 直接 500 的根因）
        disposition = response.headers["content-disposition"]
        assert "attachment" in disposition
        assert "filename*=UTF-8''" in disposition
        assert "%E5%B9%BF%E5%B7%9E" in disposition  # URL 编码后的"广州"

    def test_ascii_destination_still_works(self):
        with make_client() as client:
            response = client.post(
                "/api/export/guest",
                json={"destination": "Tokyo", "dates": "2026-10-01", "content": "# Tokyo plan"},
            )
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF-")
        assert 'filename="Tokyo-2026-10-01.pdf"' in response.headers["content-disposition"]

    def test_missing_content_returns_4xx_not_500(self):
        with make_client() as client:
            response = client.post("/api/export/guest", json={"destination": "广州"})
        assert 400 <= response.status_code < 500
        assert response.status_code != 500

    def test_empty_content_returns_4xx(self):
        with make_client() as client:
            response = client.post(
                "/api/export/guest",
                json={"destination": "广州", "dates": "", "content": ""},
            )
        assert 400 <= response.status_code < 500

    def test_oversized_content_returns_4xx(self):
        with make_client() as client:
            response = client.post(
                "/api/export/guest",
                json={"destination": "广州", "dates": "", "content": "行" * 200_001},
            )
        assert 400 <= response.status_code < 500

    def test_long_but_valid_content_renders(self):
        long_plan = CHINESE_PLAN + ("超长正文行测试" * 2000 + "\n") * 3
        with make_client() as client:
            response = client.post(
                "/api/export/guest",
                json={"destination": "广州", "dates": "2026-09-18", "content": long_plan},
            )
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF-")
        assert len(response.content) > 10_000


class TestLogged_inExport:
    def test_pdf_export_for_authenticated_user(self, monkeypatch):
        from app.routers import export_router

        class FakeUser:
            id = 1

        async def fake_get_history(db, conversation_id, user_id=None):
            class Msg:
                def __init__(self, role, content):
                    self.role = role
                    self.content = content

            return [Msg("user", "想去广州"), Msg("assistant", CHINESE_PLAN)]

        app = FastAPI()
        app.include_router(export_router.router, prefix="/api")
        app.dependency_overrides[export_router.get_current_user] = lambda: FakeUser()
        monkeypatch.setattr(export_router.message, "get_history", fake_get_history)

        with TestClient(app) as client:
            response = client.get("/api/export/21?format=pdf")

        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content.startswith(b"%PDF-")

    def test_markdown_export_for_authenticated_user(self, monkeypatch):
        from app.routers import export_router

        class FakeUser:
            id = 1

        async def fake_get_history(db, conversation_id, user_id=None):
            class Msg:
                def __init__(self, role, content):
                    self.role = role
                    self.content = content

            return [Msg("assistant", CHINESE_PLAN)]

        app = FastAPI()
        app.include_router(export_router.router, prefix="/api")
        app.dependency_overrides[export_router.get_current_user] = lambda: FakeUser()
        monkeypatch.setattr(export_router.message, "get_history", fake_get_history)

        with TestClient(app) as client:
            response = client.get("/api/export/21?format=md")

        assert response.status_code == 200
        assert "text/markdown" in response.headers["content-type"]
        assert "广州" in response.text


class TestPdfHelpers:
    def test_render_plan_pdf_always_returns_pdf_bytes(self):
        from app.utils.pdf_export import render_plan_pdf

        pdf = render_plan_pdf(build_markdown(CHINESE_PLAN, "广州", "2026-09-18"))
        assert pdf.startswith(b"%PDF-")

    def test_attachment_header_latin1_safe(self):
        from app.utils.pdf_export import attachment_header

        header = attachment_header("广州", "2026-09-18")
        header.encode("latin-1")  # 不抛 UnicodeEncodeError 即通过
        assert "UTF-8''" in header
