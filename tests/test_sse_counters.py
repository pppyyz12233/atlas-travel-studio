"""SSE 计数器与事件格式回归测试（不调真实 DeepSeek API，不访问外网）。

覆盖两个历史 Bug：
1. tool_call_count 在 astream 分片中丢失——tools 节点的 chunk 携带计数，
   但最后一个 chunk 永远来自 llm 节点（不含该字段），取"最后 chunk"会统计为 0；
2. worker_think / worker_tools 进度事件缺 event 字段——前端按 event 解析，收不到。
"""

import asyncio
import json

import app.agents.supervisor as supervisor


class FakeSubgraph:
    """按给定 chunk 序列回放的假 Worker 子图（模拟 llm/tools 节点交替产出）。"""

    def __init__(self, chunks):
        self._chunks = chunks

    async def astream(self, _input):
        for chunk in self._chunks:
            yield chunk


def _assistant_msg(tool_calls=None, content="ok"):
    m = {"role": "assistant", "content": content}
    if tool_calls:
        m["tool_calls"] = tool_calls
    return m


def _tc(name, tid):
    return {"id": tid, "type": "function", "function": {"name": name, "arguments": "{}"}}


def _tool_result(name, tid):
    return {"role": "tool", "tool_call_id": tid, "name": name, "content": "..."}


def _build_chunks():
    """3 轮 LLM / 2 批工具（1 次 + 3 次），中间夹一个重复计数的 llm chunk。"""
    msgs_1 = [{"role": "user", "content": "q"}, _assistant_msg([_tc("search_flights_tool", "t1")], "")]
    msgs_2 = msgs_1 + [_tool_result("search_flights_tool", "t1"),
                       _assistant_msg([_tc("get_flight_price_tool", "t2a"),
                                       _tc("get_flight_price_tool", "t2b"),
                                       _tc("get_flight_price_tool", "t2c")], "")]
    price_results = [
        {"role": "tool", "tool_call_id": "t2a", "name": "get_flight_price_tool", "content": "..."},
        {"role": "tool", "tool_call_id": "t2b", "name": "get_flight_price_tool", "content": "..."},
        {"role": "tool", "tool_call_id": "t2c", "name": "get_flight_price_tool", "content": "..."},
    ]
    msgs_3_tools = msgs_2 + price_results          # tools 节点执行完第二批后的消息
    msgs_3 = msgs_3_tools + [_assistant_msg(content="最终答案" * 30)]
    return [
        {"llm": {"messages": msgs_1, "iteration_count": 1}},
        {"tools": {"messages": msgs_1 + [_tool_result("search_flights_tool", "t1")], "tool_call_count": 1}},
        # 关键场景：llm chunk 不带 tool_call_count（历史 Bug 的触发点）
        {"llm": {"messages": msgs_2, "iteration_count": 2}},
        # 重复计数的 chunk：不应造成重复累计/重复事件
        {"llm": {"messages": msgs_2, "iteration_count": 2}},
        {"tools": {"messages": msgs_3_tools, "tool_call_count": 4}},
        {"llm": {"messages": msgs_3, "iteration_count": 3}},
    ]


async def _run(monkeypatch):
    events = []

    async def fake_extract(text, worker_type):
        from app.schemas.trip import StepOutput
        return StepOutput(summary=text[:80])

    monkeypatch.setitem(supervisor.WORKER_SUBGRAPHS, "flight", FakeSubgraph(_build_chunks()))
    monkeypatch.setattr(supervisor, "_extract_structured", fake_extract)

    step = {"id": 1, "name": "查航班", "worker": "flight", "description": "d", "status": "pending"}
    await supervisor._run_step_with_subgraph(step, None, on_event=events.append)
    return step, events


def test_tool_call_count_not_lost_across_chunks(monkeypatch):
    """Bug1 回归：4 次工具调用不得因 chunk 合并归零或重复累计。"""
    step, _ = asyncio.run(_run(monkeypatch))
    assert step["status"] == "done"
    assert step["tool_calls"] == 4, f"应统计 4 次工具调用，实际 {step['tool_calls']}"
    assert step["iterations"] == 3, f"应统计 3 轮推理，实际 {step['iterations']}"


def test_worker_events_have_event_field(monkeypatch):
    """Bug2 回归：进度事件必须带 event 字段，且事件类型可区分、工具名保留。"""
    _, events = asyncio.run(_run(monkeypatch))
    assert events, "应产生进度事件"
    for e in events:
        assert "event" in e, f"事件缺 event 字段: {e}"

    thinks = [e for e in events if e["event"] == "worker_think"]
    tools = [e for e in events if e["event"] == "worker_tools"]
    # 重复 iteration_count 的 chunk 不产生重复 think 事件
    assert [t["round"] for t in thinks] == [1, 2, 3]
    # 两批工具调用：第 1 批 1 个、第 2 批 3 个（增量推送，工具名保留）
    assert tools[0]["tools"] == ["search_flights_tool"]
    assert tools[1]["tools"] == ["get_flight_price_tool"] * 3
    assert all(e["name"] == "查航班" for e in events)


def test_event_lines_parseable_as_sse(monkeypatch):
    """事件序列化为 SSE data 行后仍可解析，前端可依据 event 字段分发。"""
    _, events = asyncio.run(_run(monkeypatch))
    kinds = set()
    for e in events:
        line = f"data: {json.dumps(e, ensure_ascii=False)}"
        assert line.startswith("data: ")
        parsed = json.loads(line[6:])
        kinds.add(parsed["event"])
    assert kinds == {"worker_think", "worker_tools"}


def test_canonical_sse_event_names_preserved():
    """step_start / step_done / done / error 事件名不得被破坏（chat_router 源码契约）。"""
    from pathlib import Path
    src = Path(supervisor.__file__).resolve().parents[2] / "app" / "routers" / "chat_router.py"
    text = src.read_text(encoding="utf-8")
    for name in ("step_start", "step_done", "'done'", "'error'"):
        assert name in text, f"chat_router 中缺少事件名 {name}"
