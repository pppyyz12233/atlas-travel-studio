
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document


#记录上传
async def add_document(db: AsyncSession, user_id: int, filename: str, file_type: str, chunk_count: int, chroma_ids: list):
    doc = Document(
        uploaded_by=user_id, filename=filename, file_type=file_type,
        chunk_count=chunk_count, chroma_ids=chroma_ids
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


#文档列表
async def list_documents(db: AsyncSession):
    result = await db.execute(select(Document).order_by(Document.created_at.desc()))
    return list(result.scalars().all())
