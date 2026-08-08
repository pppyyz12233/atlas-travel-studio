

import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Document(Base):
    __tablename__ = "document"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    file_type: Mapped[str] = mapped_column(String(16), nullable=False)  # pdf | word | markdown
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    chroma_ids: Mapped[list] = mapped_column(JSON, default=list)  # ChromaDB 中对应的 chunk ID 列表
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
