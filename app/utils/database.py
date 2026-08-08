
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.utils.config import DB_URL

engine = create_async_engine(DB_URL, echo=False, pool_size=10, max_overflow=10)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # async with 退出时自动 close，无需显式调用


async def init_db():
    """启动时自动建表 + 启用 WAL 模式避免锁"""
    from app.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # WAL 模式允许并发读 + 单写，避免 "database is locked"
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
