"""对话接口 —— SSE 流式 + 非流式

依赖 LangGraph Checkpointer 自动存档/恢复历史。
调用方只需传 thread_id，不用手工加载/保存消息。
"""

import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import get_current_user, get_optional_user
from app.schemas.chat import ChatRequest
from app.agents.workflow.guard import check
from app.agents.supervisor import (
    build_graph, intent_router_node, planner_node, aggregator_node,
    _build_execution_layers, _build_context, _infer_depends_on,
    _run_step_with_subgraph,
)
from app.agents.state import AgentState
from app.crud import conversation, message
from app.utils.rate_limiter import RateLimiter

router = APIRouter(prefix="/chat", tags=["对话"])
limiter = RateLimiter(max_per_minute=20)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _thread_id(user_id: int | str, conv_id: int) -> str:
    """生成 LangGraph thread_id，用于 Checkpointer"""
    return f"user_{user_id}_conv_{conv_id}"


# ══════════════════════════════════════════════════════════════
# 非流式端点
# ══════════════════════════════════════════════════════════════

@router.post("")
async def chat(
    req: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """非流式对话：完整执行后一次性返回"""
    await limiter.check(_client_key(request))

    # 安全门卫
    blocked, reason = check(req.message)
    if blocked:
        return {"code": 403, "message": reason, "data": None}

    # 未登录 → 无状态调用
    if user is None:
        state = {
            "messages": [{"role": "user", "content": req.message}],
            "plan_steps": [], "current_step_index": 0,
            "final_answer": "", "guard_blocked": False, "guard_reason": "",
            "intent": "full_trip", "active_workers": [], "trip_state": {},
        }
        result = await build_graph().ainvoke(state)
        return {
            "code": 200, "message": "",
            "data": {"conversation_id": None, "reply": result["final_answer"]},
        }

    # 已登录 → 带 Checkpointer + Store 的图
    conv_id = req.conversation_id
    if conv_id:
        await conversation.verify_owner(db, conv_id, user.id)
    else:
        conv = await conversation.create_conversation(db, user.id, req.message[:30])
        conv_id = conv.id

    # 获取全局 agent（带 checkpointer/store）
    from main import get_agent
    agent = get_agent()

    config = {
        "configurable": {
            "thread_id": _thread_id(user.id, conv_id),
            "user_id": str(user.id),
        }
    }

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": req.message}]},
        config,
    )

    # 保存消息到业务表（供前端 history 接口查询）
    await message.add_message(db, conv_id, "user", req.message)
    await message.add_message(db, conv_id, "assistant", result["final_answer"])

    return {
        "code": 200, "message": "",
        "data": {
            "conversation_id": conv_id,
            "reply": result["final_answer"],
        },
    }


# ══════════════════════════════════════════════════════════════
# 流式端点
# ══════════════════════════════════════════════════════════════

@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """SSE 流式对话：每个步骤完成时推送进度"""
    await limiter.check(_client_key(request))

    async def event_stream():
        msg = req.message

        # 1. Guard
        blocked, reason = check(msg)
        if blocked:
            yield f"data: {json.dumps({'event': 'guard', 'blocked': True, 'reason': reason}, ensure_ascii=False)}\n\n"
            return
        yield f"data: {json.dumps({'event': 'guard', 'ok': True}, ensure_ascii=False)}\n\n"

        # 2. 解析用户身份
        uid = str(user.id) if user else "anonymous"
        conv_id = req.conversation_id
        if user and conv_id:
            await conversation.verify_owner(db, conv_id, user.id)

        # 3. 获取 agent
        from main import get_agent
        agent = get_agent()
        config = {
            "configurable": {
                "thread_id": _thread_id(uid, conv_id or 0),
                "user_id": uid,
            }
        }

        # 4. 手动走图节点（为了流式推送中间进度）
        state: AgentState = {
            "messages": [{"role": "user", "content": msg}],
            "plan_steps": [], "current_step_index": 0,
            "final_answer": "", "guard_blocked": False, "guard_reason": "",
            "intent": "full_trip", "active_workers": [], "trip_state": {},
        }

        state = await intent_router_node(state)
        state = await planner_node(state)
        steps = state["plan_steps"]
        yield f"data: {json.dumps({'event': 'plan', 'steps': [s['name'] for s in steps], 'count': len(steps)}, ensure_ascii=False)}\n\n"

        # 5. Executor（手动分层执行，推送每步进度）
        for s in steps:
            if "depends_on" not in s or not s["depends_on"]:
                s["depends_on"] = _infer_depends_on(s, steps)
        layers = _build_execution_layers(steps)

        for layer in layers:
            for s in layer:
                s["status"] = "running"
                yield f"data: {json.dumps({'event': 'step_start', 'name': s['name'], 'worker': s.get('worker', ''), 'layer': len(layers), 'parallel': len(layer) > 1}, ensure_ascii=False)}\n\n"

            if len(layer) == 1:
                await _run_step_with_subgraph(layer[0], _build_context(steps))
            else:
                await asyncio.gather(*[
                    _run_step_with_subgraph(s, _build_context(steps))
                    for s in layer
                ])

            for s in layer:
                result_text = s.get("result", "") or ""
                result_snippet = result_text[:150] if len(result_text) > 150 else result_text
                yield f"data: {json.dumps({'event': 'step_done', 'name': s['name'], 'worker': s.get('worker', ''), 'status': s.get('status', 'failed'), 'result_snippet': result_snippet, 'summary': s.get('summary', ''), 'locations': s.get('locations', [])}, ensure_ascii=False)}\n\n"

        # 6. Aggregator
        yield f"data: {json.dumps({'event': 'aggregating'}, ensure_ascii=False)}\n\n"
        state = await aggregator_node(state)

        # 7. 保存消息
        if user is not None:
            if not conv_id:
                conv = await conversation.create_conversation(db, user.id, msg[:30])
                conv_id = conv.id
            await message.add_message(db, conv_id, "user", msg)
            await message.add_message(db, conv_id, "assistant", state["final_answer"])

        yield f"data: {json.dumps({'event': 'done', 'reply': state['final_answer'], 'conversation_id': conv_id}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(), media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ══════════════════════════════════════════════════════════════
# 历史 & 对话列表（不变）
# ══════════════════════════════════════════════════════════════

@router.get("/history")
async def history(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    msgs = await message.get_history(db, conversation_id, user_id=user.id)
    return {
        "code": 200, "message": "",
        "data": [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": str(m.created_at)}
            for m in msgs
        ],
    }


@router.get("/conversations")
async def conversations(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    convs = await conversation.list_by_user(db, user.id)
    return {
        "code": 200, "message": "",
        "data": [
            {"id": c.id, "title": c.title, "created_at": str(c.created_at)}
            for c in convs
        ],
    }
