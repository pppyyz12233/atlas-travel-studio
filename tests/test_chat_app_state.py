# -*- coding: utf-8 -*-
"""app.state.agent 接线测试（模块双实例回归防护）。

背景：`python main.py` 启动时应用模块名是 __main__，路由内 `from main import
get_agent` 会执行 main.py 生成第二份模块实例（其 _agent=None）→ 断言崩溃。
修复后路由只从 request.app.state 取运行期资源，本文件锁定该行为。
Agent 各节点以 mock 替代，测试不触网、不消耗 LLM 额度。
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.routers import chat_router  # noqa: E402
from app.routers.chat_router import router as chat_api  # noqa: E402
from app.auth import dependencies as auth_deps  # noqa: E402


# ── 测试替身 ────────────────────────────────────────────────

class FakeAgent:
    """覆盖路由实际用到的 agent 接口（aget_state/aupdate_state/ainvoke）。"""

    async def aget_state(self, config):
        return SimpleNamespace(values={"messages": []})

    async def aupdate_state(self, config, state, as_node=None):
        return None

    async def ainvoke(self, state, config=None):
        return {"final_answer": "## 广州一日游方案（mock）"}


async def fake_intent_router(state):
    state["intent"] = "full_trip"
    return state


async def fake_planner(state):
    state["plan_steps"] = [{
        "id": 1, "name": "查航班", "worker": "flight", "status": "pending",
        "result": "", "items": [], "locations": [],
    }]
    return state


def fake_layers(steps):
    return [[s for s in steps]]


def make_run_step(final_reply: str):
    async def _run_step(step, ctx, on_event=None, search_params=None):
        step["status"] = "done"
        step["result"] = "mock 步骤结果"
        if on_event:
            on_event({"event": "worker_think", "round": 1})
        return step
    return _run_step


async def fake_aggregator(state):
    state["final_answer"] = "## 广州一日游方案（mock）"
    state["trip_state"] = {}
    return state


async def fake_memory(state, config=None, store=None):
    return state


@pytest.fixture()
def patched_router(monkeypatch):
    """把 chat_router 命名空间里的图节点全部换成 mock——只测路由接线，不测 LLM。"""
    monkeypatch.setattr(chat_router, "intent_router_node", fake_intent_router)
    monkeypatch.setattr(chat_router, "planner_node", fake_planner)
    monkeypatch.setattr(chat_router, "aggregator_node", fake_aggregator)
    monkeypatch.setattr(chat_router, "memory_reader_node", fake_memory)
    monkeypatch.setattr(chat_router, "memory_writer_node", fake_memory)
    monkeypatch.setattr(chat_router, "_build_execution_layers", fake_layers)
    monkeypatch.setattr(chat_router, "_run_step_with_subgraph", make_run_step("## 广州一日游方案（mock）"))
    monkeypatch.setattr(chat_router, "build_graph", lambda **kw: FakeAgent())


def build_app(with_agent: bool = True, with_user: bool = False) -> FastAPI:
    app = FastAPI()
    app.include_router(chat_api, prefix="/api")
    if with_agent:
        app.state.agent = FakeAgent()
        app.state.store = None
    if with_user:
        app.dependency_overrides[auth_deps.get_optional_user] = lambda: SimpleNamespace(id=7, username="t")
    return app


async def collect_sse(app, payload=None):
    payload = payload or {"message": "去广州一天", "conversation_id": None}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/chat/stream", json=payload)
        assert resp.status_code == 200
        events = []
        for line in resp.text.split("\n"):
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
        return events


# ── 测试 ────────────────────────────────────────────────────

class TestNoReverseImport:
    def test_chat_router_never_imports_main(self):
        """回归防线：app/ 内部模块不得反向 import 顶层 main.py（模块双实例根因）。"""
        source = (ROOT / "app" / "routers" / "chat_router.py").read_text(encoding="utf-8")
        assert "from main import" not in source
        assert "import main" not in source


class TestStreamWiring:
    async def test_guest_stream_reads_agent_from_app_state(self, patched_router):
        """游客流式：agent 来自 request.app.state，事件序列 graph_state→plan→done。"""
        events = await collect_sse(build_app(with_agent=True))
        kinds = [(e.get("event"), e.get("node")) for e in events]
        assert ("graph_state", "guard") in kinds
        assert any(e.get("event") == "plan" for e in events)
        done = [e for e in events if e.get("event") == "done"]
        assert done and done[0]["reply"].startswith("## 广州一日游方案")

    async def test_stream_without_agent_returns_structured_error(self, patched_router):
        """app.state.agent 缺失：SSE error 事件（非空消息），绝不出现 AssertionError 文本。"""
        events = await collect_sse(build_app(with_agent=False))
        errors = [e for e in events if e.get("event") == "error"]
        assert errors, "必须收到 error 事件"
        message = errors[0].get("message", "")
        assert message == "智能体服务尚未初始化，请稍后重试"
        assert "AssertionError" not in json.dumps(events, ensure_ascii=False)
        assert message != "生成失败，请重试"  # 不是兜底空话，是明确原因

    async def test_logged_in_stream_uses_app_state_and_saves_messages(self, patched_router, monkeypatch):
        """登录流式：同样走 app.state；会话创建/落库经 mock，不触真实数据库。"""
        saved = []

        class FakeConv:
            id = 42

        async def fake_create(db, user_id, title=""):
            return FakeConv()

        async def fake_verify(db, conv_id, user_id):
            return None

        async def fake_add(db, conv_id, role, content):
            saved.append((conv_id, role))

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def commit(self):
                return None

        monkeypatch.setattr(chat_router.conversation, "create_conversation", fake_create)
        monkeypatch.setattr(chat_router.conversation, "verify_owner", fake_verify)
        monkeypatch.setattr(chat_router.message, "add_message", fake_add)
        monkeypatch.setattr(chat_router, "AsyncSessionLocal", FakeSession)

        events = await collect_sse(build_app(with_agent=True, with_user=True))
        done = [e for e in events if e.get("event") == "done"]
        assert done and done[0]["conversation_id"] == 42
        assert (42, "user") in saved and (42, "assistant") in saved


class TestNonStreamWiring:
    async def test_nonstream_503_when_agent_missing(self, patched_router):
        """非流式登录路径：agent 缺失 → 503 + 明确信息，而不是 NoneType 崩溃。"""
        app = build_app(with_agent=False, with_user=True)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/chat", json={"message": "去广州一天", "conversation_id": None})
        assert resp.status_code == 503
        assert "智能体服务尚未初始化" in resp.text

    async def test_nonstream_guest_does_not_depend_on_main(self, patched_router):
        """非流式游客路径走 build_graph()（已 mock），同样不 import main。"""
        app = build_app(with_agent=False)  # 无 agent 也可用：游客路径自建图
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/chat", json={"message": "去广州一天", "conversation_id": None})
        assert resp.status_code == 200
        assert resp.json()["data"]["reply"].startswith("## 广州一日游方案")
