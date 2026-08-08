
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation


#创建对话
async def create_conversation(db: AsyncSession, user_id: int, title: str = "新对话"):
    conv = Conversation(user_id=user_id, title=title[:50])
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


#用户对话列表
async def list_by_user(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
    )
    return list(result.scalars().all())


#验证对话归属（纯 assertion，不返回）
async def verify_owner(db: AsyncSession, conv_id: int, user_id: int):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="无权访问该对话")


#删除对话
async def delete_conversation(db: AsyncSession, conv_id: int, user_id: int):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    await db.delete(conv)
    await db.commit()
