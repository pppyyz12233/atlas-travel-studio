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
        # 长内容必须完整分页（不截断尾部），页数 > 1
        import io

        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(response.content))
        assert len(reader.pages) > 1
        tail_text = "\n".join(page.extract_text() for page in reader.pages)
        assert "超长正文行测试" in tail_text


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


class TestMarkdownPdfConsistency:
    """Markdown 与 PDF 同源一致性（同一 finalReply，PDF 仅加抬头/页脚）。"""

    REPLY = (
        "## 巴黎4天3晚行程方案（2人）\n\n"
        "### 日程\n"
        "#### Day 1 经典轴线\n"
        "| 时段 | 地点 | 交通 | 备注 |\n|---|---|---|---|\n"
        "| 上午 | 卢浮宫 | 地铁1号线 | 需预约 |\n| 下午 | 塞纳河游船 | 步行 | 黄昏最佳 |\n\n"
        "#### Day 2 博物馆日\n- 奥赛博物馆\n- 橘园美术馆\n\n"
        "### 交通\n- RER B 进城，Navigo Easy 交通卡\n\n"
        "### 住宿\n- 建议 1-7 区沿塞纳河住宿\n\n"
        "> 备注与限制：以上为估算，非实时数据。\n"
    )

    def _pdf_text(self, pdf_bytes: bytes) -> str:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() for page in reader.pages)

    def test_pdf_and_markdown_come_from_same_reply(self):
        # PDF 正文 = build_markdown 包装（封面元数据 + 正文）；剥掉封面块后必须逐字等于 finalReply
        from app.utils.pdf_export import build_markdown
        md = build_markdown(self.REPLY, "巴黎", "2026-09-04", days=4, people=2, budget=9000)
        # 封面 = 头部到第一条水平分隔线（含）为止
        marker = "---\n\n"
        stripped = md.split(marker, 1)[1] if marker in md else md
        assert stripped == self.REPLY
        # 封面含与表单同源的元数据 + 生成日期
        for fact in ("巴黎", "2026-09-04", "4 天", "2 人", "¥9,000", "生成日期"):
            assert fact in md, fact

    def test_both_formats_cover_transport_and_daily_plan_with_same_dest_and_date(self):
        from app.utils.pdf_export import build_markdown, render_plan_pdf
        md = build_markdown(self.REPLY, "巴黎", "2026-09-04")
        pdf_bytes = render_plan_pdf(md, "巴黎")
        assert pdf_bytes.startswith(b"%PDF-")
        text = self._pdf_text(pdf_bytes)
        # 同目的地 + 同日期
        assert "巴黎" in md and "巴黎" in text
        assert "2026-09-04" in md and "2026-09-04" in text
        # 都含交通与每日安排
        for needle in ("交通", "RER B", "Day 1", "Day 2", "卢浮宫"):
            assert needle in md, needle
            assert needle in text, needle

    def test_pdf_chinese_visible_and_no_isolated_dashes(self):
        import re
        from app.utils.pdf_export import build_markdown, render_plan_pdf
        md = build_markdown(self.REPLY, "巴黎", "2026-09-04")
        for name, content in (("markdown", md.encode("utf-8").decode("utf-8")),):
            assert not re.search(r"^\s*-\s*$", content, re.M)
        pdf_bytes = render_plan_pdf(md, "巴黎")
        text = self._pdf_text(pdf_bytes)
        for c in ("旅行方案", "卢浮宫", "塞纳河", "备注与限制"):
            assert c in text, c
        assert not re.search(r"^\s*-\s*$", text, re.M)

    def test_pdf_pages_not_truncated_for_long_content(self):
        from app.utils.pdf_export import build_markdown, render_plan_pdf
        long_reply = self.REPLY + ("很长的一段补充说明，用于验证多页分页不截断正文内容。\n\n" * 120)
        md = build_markdown(long_reply, "巴黎", "2026-09-04")
        pdf_bytes = render_plan_pdf(md, "巴黎")
        text = self._pdf_text(pdf_bytes)
        assert pdf_bytes.startswith(b"%PDF-")
        # 尾部内容仍在（未被页数截断）
        assert "多页分页不截断正文内容" in text
