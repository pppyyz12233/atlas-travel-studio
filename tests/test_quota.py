# -*- coding: utf-8 -*-
"""聊天配额与并发闸门测试。

单元层直接测 DailyQuota / ConcurrencyGate；接口层沿用 test_chat_app_state 的
mock 手法（图节点全替身、不触网、不消耗 LLM 额度），触发 429 与 SSE error 路径。
"""
import json
import sys
from datetime import date
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
from app.auth.guest_session import GuestSession  # noqa: E402
from app.utils.quota import (  # noqa: E402
    ChatBusyError, ConcurrencyGate, DailyQuota, QuotaExceeded,
)

# ── 测试替身（与 test_chat_app_state 同款） ─────────────────────────


class FakeAgent:
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


async def fake_run_step(step, ctx, on_event=None, search_params=None):
    step["status"] = "done"
    step["result"] = "mock 步骤结果"
    return step


async def fake_aggregator(state):
    state["final_answer"] = "## 广州一日游方案（mock）"
    state["trip_state"] = {}
    return state


async def fake_memory(state, config=None, store=None):
    return state


@pytest.fixture()
def patched_router(monkeypatch):
    monkeypatch.setattr(chat_router, "intent_router_node", fake_intent_router)
    monkeypatch.setattr(chat_router, "planner_node", fake_planner)
    monkeypatch.setattr(chat_router, "aggregator_node", fake_aggregator)
    monkeypatch.setattr(chat_router, "memory_reader_node", fake_memory)
    monkeypatch.setattr(chat_router, "memory_writer_node", fake_memory)
    monkeypatch.setattr(chat_router, "_build_execution_layers", fake_layers)
    monkeypatch.setattr(chat_router, "_run_step_with_subgraph", fake_run_step)
    monkeypatch.setattr(chat_router, "build_graph", lambda **kw: FakeAgent())


@pytest.fixture()
def reset_quota():
    """隔离共享单例的计数（限值用 monkeypatch 改，自动还原）。"""
    dq, g = chat_router.daily_quota, chat_router.gate
    saved = dict(dq._counts)
    dq._counts.clear()
    yield dq, g
    dq._counts.clear()
    dq._counts.update(saved)
    g.in_flight = 0


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


def error_events(events):
    return [e.get("message", "") for e in events if e.get("event") == "error"]


# ── 单元：DailyQuota ────────────────────────────────────────────────


class TestDailyQuota:
    async def test_guest_limit_exhausted(self):
        dq = DailyQuota(global_limit=100, guest_limit=2, user_limit=100)
        await dq.consume(None, "guest:g1")
        await dq.consume(None, "guest:g1")
        with pytest.raises(QuotaExceeded) as ei:
            await dq.consume(None, "guest:g1")
        assert ei.value.scope == "guest:g1"
        assert ei.value.limit == 2 and ei.value.used == 2
        assert "游客" in ei.value.message and "注册登录" in ei.value.message

    async def test_guest_buckets_independent_and_global_counts_all(self):
        dq = DailyQuota(global_limit=100, guest_limit=1, user_limit=100)
        await dq.consume(None, "guest:g1")
        await dq.consume(None, "guest:g2")  # 不同游客各自一桶，互不影响
        assert await dq.usage("guest:g1") == 1
        assert await dq.usage("guest:g2") == 1
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 2

    async def test_user_limit_message_differs_from_guest(self):
        dq = DailyQuota(global_limit=100, guest_limit=100, user_limit=1)
        await dq.consume("user:7", None)
        with pytest.raises(QuotaExceeded) as ei:
            await dq.consume("user:7", None)
        assert ei.value.scope == "user:7"
        assert "注册登录" not in ei.value.message

    async def test_global_cap_trips_regardless_of_identity(self):
        dq = DailyQuota(global_limit=2, guest_limit=100, user_limit=100)
        await dq.consume(None, "guest:g1")
        await dq.consume(None, "guest:g2")
        with pytest.raises(QuotaExceeded) as ei:
            await dq.consume(None, "guest:g3")  # 身份层未超，但全站熔断
        assert ei.value.scope == DailyQuota.GLOBAL_KEY
        assert "全站" in ei.value.message

    async def test_rejection_does_not_increment(self):
        dq = DailyQuota(global_limit=100, guest_limit=1, user_limit=100)
        await dq.consume(None, "guest:g1")
        with pytest.raises(QuotaExceeded):
            await dq.consume(None, "guest:g1")
        assert await dq.usage("guest:g1") == 1  # 被拒后不再涨
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 1

    async def test_rollover_resets_at_day_change(self):
        class FakeClock:
            def __init__(self):
                self.d = date(2026, 9, 14)

            def __call__(self):
                return self.d

        clock = FakeClock()
        dq = DailyQuota(global_limit=100, guest_limit=1, user_limit=100, today=clock)
        await dq.consume(None, "guest:g1")
        with pytest.raises(QuotaExceeded):
            await dq.consume(None, "guest:g1")
        clock.d = date(2026, 9, 15)  # 跨天：惰性清零
        await dq.consume(None, "guest:g1")
        assert await dq.usage("guest:g1") == 1

    async def test_zero_limit_disables_layer(self):
        dq = DailyQuota(global_limit=0, guest_limit=0, user_limit=0)
        for _ in range(50):
            await dq.consume(None, "guest:g1")
        assert await dq.usage("guest:g1") == 50  # 只计数，不拦截


# ── 单元：ConcurrencyGate ───────────────────────────────────────────


class TestConcurrencyGate:
    def test_acquire_release_cycle(self):
        g = ConcurrencyGate(2)
        g.acquire()
        g.acquire()
        assert g.full
        with pytest.raises(ChatBusyError):
            g.acquire()
        g.release()
        assert not g.full
        g.acquire()

    def test_slot_releases_on_exception(self):
        g = ConcurrencyGate(1)
        with pytest.raises(RuntimeError):
            with g.slot():
                raise RuntimeError("boom")
        assert g.in_flight == 0 and not g.full

    def test_release_never_goes_negative(self):
        g = ConcurrencyGate(1)
        g.release()
        assert g.in_flight == 0

    def test_limit_clamped_to_one(self):
        assert ConcurrencyGate(0).limit == 1


# ── 接口层：非流式 429 ──────────────────────────────────────────────


class TestNonStreamQuota:
    async def test_guest_second_request_429(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(dq, "guest_limit", 1)
        transport = ASGITransport(app=build_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r1 = await client.post("/api/chat", json={"message": "去广州一天"})
            assert r1.status_code == 200
            r2 = await client.post("/api/chat", json={"message": "去广州一天"})
            assert r2.status_code == 429
            assert "游客" in r2.json()["detail"]

    async def test_busy_returns_429_without_consuming_quota(self, patched_router, reset_quota, monkeypatch):
        dq, gate = reset_quota
        monkeypatch.setattr(gate, "in_flight", gate.limit)
        transport = ASGITransport(app=build_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/chat", json={"message": "去广州一天"})
        assert resp.status_code == 429
        assert "使用人数较多" in resp.json()["detail"]
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 0  # 并发拒绝不扣次数

    async def test_guard_blocked_does_not_consume(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(chat_router, "check", lambda m: (True, "测试拦截"))
        transport = ASGITransport(app=build_app())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/chat", json={"message": "去广州一天"})
        assert resp.status_code == 200
        assert resp.json()["code"] == 403
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 0


# ── 接口层：SSE error 事件 ──────────────────────────────────────────


class TestStreamQuota:
    async def test_guest_quota_error_event(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        # 固定游客身份，两次请求命中同一配额桶
        monkeypatch.setattr(
            chat_router, "resolve_guest_session",
            lambda cookie: GuestSession(guest_id="testguest", cookie_value="x", is_new=False),
        )
        monkeypatch.setattr(dq, "guest_limit", 1)
        events1 = await collect_sse(build_app())
        assert [e for e in events1 if e.get("event") == "done"]  # 第一次正常
        events2 = await collect_sse(build_app())
        msgs = error_events(events2)
        assert msgs and "游客" in msgs[0] and "注册登录" in msgs[0]
        assert not [e for e in events2 if e.get("event") == "done"]

    async def test_guest_run_counts_both_scopes(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(
            chat_router, "resolve_guest_session",
            lambda cookie: GuestSession(guest_id="testguest", cookie_value="x", is_new=False),
        )
        await collect_sse(build_app())
        assert await dq.usage("guest:testguest") == 1
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 1

    async def test_global_cap_error_event(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(
            chat_router, "resolve_guest_session",
            lambda cookie: GuestSession(guest_id="testguest", cookie_value="x", is_new=False),
        )
        monkeypatch.setattr(dq, "guest_limit", 100)
        monkeypatch.setattr(dq, "global_limit", 1)
        await collect_sse(build_app())
        msgs = error_events(await collect_sse(build_app()))
        assert msgs and "全站" in msgs[0]

    async def test_busy_error_event_releases_gate(self, patched_router, reset_quota, monkeypatch):
        _, gate = reset_quota
        monkeypatch.setattr(gate, "in_flight", gate.limit)
        msgs = error_events(await collect_sse(build_app()))
        assert msgs and "使用人数较多" in msgs[0]
        assert gate.in_flight == gate.limit  # 拒绝路径不得偷放/偷占别人的槽位

    async def test_guard_blocked_sse_does_not_consume(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(chat_router, "check", lambda m: (True, "测试拦截"))
        events = await collect_sse(build_app())
        assert any(e.get("event") == "guard" and e.get("blocked") for e in events)
        assert await dq.usage(DailyQuota.GLOBAL_KEY) == 0

    async def test_logged_in_user_quota(self, patched_router, reset_quota, monkeypatch):
        dq, _ = reset_quota
        monkeypatch.setattr(dq, "user_limit", 1)

        class FakeConv:
            id = 42

        async def fake_create(db, user_id, title=""):
            return FakeConv()

        async def fake_verify(db, conv_id, user_id):
            return None

        async def fake_add(db, conv_id, role, content):
            return None

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

        events1 = await collect_sse(build_app(with_user=True))
        assert [e for e in events1 if e.get("event") == "done"]
        events2 = await collect_sse(build_app(with_user=True))
        msgs = error_events(events2)
        assert msgs and "user" not in msgs[0].lower() and "次数已用完" in msgs[0]
        assert await dq.usage("user:7") == 1
