
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import get_current_user
from app.crud import message
from app.utils.pdf_export import build_markdown, markdown_to_html, html_to_pdf

router = APIRouter(prefix="/export", tags=["导出"])


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
    html = markdown_to_html(md)
    try:
        pdf_bytes = html_to_pdf(html)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=trip_plan_{conversation_id}.pdf"},
        )
    except ImportError:
        raise HTTPException(500, "PDF 导出需要安装 weasyprint: pip install weasyprint")
