
import asyncio

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import get_current_user
from app.crud import message
from app.utils.pdf_export import attachment_header, build_markdown, render_plan_pdf

router = APIRouter(prefix="/export", tags=["导出"])

class GuestExportRequest(BaseModel):
    destination: str = Field(default="旅行方案", max_length=80)
    dates: str = Field(default="", max_length=80)
    content: str = Field(min_length=1, max_length=120_000)

@router.post("/guest")
async def export_guest_trip(payload: GuestExportRequest):
    """游客 PDF 导出：只在内存中处理，不认证、不落库。"""
    md = build_markdown(payload.content, payload.destination, payload.dates)
    # 渲染丢线程池：xhtml2pdf/weasyprint 都是同步 CPU 操作，不能阻塞事件循环（SSE 会被卡住）
    pdf_bytes = await asyncio.to_thread(render_plan_pdf, md, payload.destination)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": attachment_header(payload.destination, payload.dates)},
    )


@router.get("/{conversation_id}")
async def export_trip(
    conversation_id: int,
    format: str = Query("md", pattern="^(md|pdf)$"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """导出旅行方案为 Markdown 或 PDF（需登录）"""
    msgs = await message.get_history(db, conversation_id, user_id=user.id)
    assistant_msgs = [m for m in msgs if m.role == "assistant"]
    if not assistant_msgs:
        raise HTTPException(404, "未找到方案内容")

    reply = assistant_msgs[-1].content

    if format == "md":
        md = build_markdown(reply)
        return Response(
            content=md.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=trip_plan_{conversation_id}.md"},
        )

    md = build_markdown(reply)
    # PDF 渲染丢线程池：同步 CPU 密集操作不能阻塞事件循环（SSE 推流会被一起卡住）
    pdf_bytes = await asyncio.to_thread(render_plan_pdf, md, f"trip-{conversation_id}")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": attachment_header(f"trip-{conversation_id}")},
    )
