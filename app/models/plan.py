"""旅行计划表（Plan-and-Execute 模式产物）"""

import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Plan(Base):
    __tablename__ = "plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # PlanStep 列表的 JSON
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)  # pending | running | done
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
