"""对话接口"""

import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import get_current_user, get_optional_user
from app.schemas.chat import ChatRequest
from app.agents.workflow.guard import check
from app.agents.supervisor import build_graph, WORKERS, planner_node, aggregator_node, _build_execution_layers, _run_one_step, _build_context, _infer_depends_on
from app.agents.state import AgentState
from app.crud import conversation, message

router = APIRouter(prefix="/chat", tags=["对话"])


@router.post("")
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    # Guard
    blocked, reason = check(req.message)
    if blocked:
        return {"code": 403, "message": reason, "data": None}

    # Guest mode — run agent without DB persistence
    if user is None:
        state = {
            "messages": [{"role": "user", "content": req.message}],
            "plan_steps": [],
            "current_step_index": 0,
            "final_answer": "",
            "guard_blocked": False,
            "guard_reason": "",
            "trip_state": {},
        }
        result = await build_graph().ainvoke(state)
        return {
            "code": 200,
            "message": "",
            "data": {
                "conversation_id": None,
                "reply": result["final_answer"],
            }
        }

    # 获取或创建对话
    conv_id = req.conversation_id
    if not conv_id:
        conv = await conversation.create_conversation(db, user.id, req.message[:30])
        conv_id = conv.id

    # 加载历史消息作为上下文（长期记忆）
    history_messages = []
    if req.conversation_id:
        msgs = await message.get_history(db, conv_id)
        for m in msgs[-20:]:  # 最多20条历史
            history_messages.append({"role": m.role, "content": m.content})

    # 构建 Agent 输入
    state = {
        "messages": history_messages + [{"role": "user", "content": req.message}],
        "plan_steps": [],
        "current_step_index": 0,
        "final_answer": "",
        "guard_blocked": False,
        "guard_reason": "",
        "trip_state": {},

    }

    result = await build_graph().ainvoke(state)

    # 保存本轮对话
    await message.add_message(db, conv_id, "user", req.message)
    await message.add_message(db, conv_id, "assistant", result["final_answer"])

    return {
        "code": 200,
        "message": "",
        "data": {
            "conversation_id": conv_id,
            "reply": result["final_answer"],
        }
    }



@router.post("/stream")
async def chat_stream(req: ChatRequest, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    """SSE 流式对话：每个步骤完成时推送进度"""

    async def event_stream():
        msg = req.message

        # 1. Guard
        blocked, reason = check(msg)
        if blocked:
            yield f"data: {json.dumps({'event':'guard','blocked':True,'reason':reason},ensure_ascii=False)}\n\n"
            return
        yield f"data: {json.dumps({'event':'guard','ok':True},ensure_ascii=False)}\n\n"

        # 2. Planner
        state: AgentState = {
            "messages": [{"role":"user","content":msg}],
            "plan_steps":[], "current_step_index":0,
            "final_answer":"","guard_blocked":False,"guard_reason":""
        }
        state = await planner_node(state)
        steps = state["plan_steps"]
        yield f"data: {json.dumps({'event':'plan','steps':[s['name'] for s in steps],'count':len(steps)},ensure_ascii=False)}\n\n"

        # 3. Executor - 逐层执行，每完成一步推送
        for s in steps:
            if "depends_on" not in s:
                s["depends_on"] = _infer_depends_on(s)
        layers = _build_execution_layers(steps)

        for layer in layers:
            layer_names = [s["name"] for s in layer]
            for s in layer:
                s["status"] = "running"
                yield f"data: {json.dumps({'event':'step_start','name':s['name'],'worker':s.get('worker',''),'layer':len(layers),'parallel':len(layer)>1},ensure_ascii=False)}\n\n"

            if len(layer) == 1:
                await _run_one_step(layer[0], _build_context(steps))
            else:
                await asyncio.gather(*[_run_one_step(s, None) for s in layer])

            for s in layer:
                result_text = s.get("result", "") or ""
                result_snippet = result_text[:150] if len(result_text) > 150 else result_text
                yield f"data: {json.dumps({'event':'step_done','name':s['name'],'worker':s.get('worker',''),'status':s.get('status','failed'),'tool_calls':len(s.get('tool_calls_made',[])),'iterations':s.get('iterations',0),'result_snippet':result_snippet,'summary':s.get('summary',''),'locations':s.get('locations',[])},ensure_ascii=False)}\n\n"

        # 4. Aggregator
        yield f"data: {json.dumps({'event':'aggregating'},ensure_ascii=False)}\n\n"
        state = await aggregator_node(state)

        # Save to DB (authenticated users only)
        conv_id = None
        if user is not None:
            conv_id = req.conversation_id
            if not conv_id:
                conv = await conversation.create_conversation(db, user.id, msg[:30])
                conv_id = conv.id
            await message.add_message(db, conv_id, "user", msg)
            await message.add_message(db, conv_id, "assistant", state["final_answer"])

        yield f"data: {json.dumps({'event':'done','reply':state['final_answer'],'conversation_id':conv_id},ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                            headers={"X-Accel-Buffering":"no","Cache-Control":"no-cache"})


@router.get("/history")
async def history(conversation_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    msgs = await message.get_history(db, conversation_id)
    return {
        "code": 200,
        "message": "",
        "data": [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": str(m.created_at)}
            for m in msgs
        ]
    }


@router.get("/conversations")
async def conversations(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    convs = await conversation.list_by_user(db, user.id)
    return {
        "code": 200,
        "message": "",
        "data": [
            {"id": c.id, "title": c.title, "created_at": str(c.created_at)}
            for c in convs
        ]
    }
