"""启动入口"""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from app.utils.database import init_db, engine
from app.routers import router as api_router

# LangGraph 持久化
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.store.memory import InMemoryStore
from app.agents.supervisor import build_graph

# 全局 agent 实例（带 checkpointer + store）
_agent = None


class LogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = time.time() - start
        print(f"[{response.status_code}] {request.method} {request.url.path} {elapsed:.2f}s")
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _agent
    await init_db()

    # 初始化 LangGraph Agent（带 Checkpointer + Memory Store）
    checkpointer = SqliteSaver.from_conn_string("travel.db")
    store = InMemoryStore()
    _agent = build_graph(checkpointer=checkpointer, store=store)
    print(f"[Agent] 已初始化 (checkpointer=SqliteSaver, store=InMemoryStore)")

    yield

    await engine.dispose()


def get_agent():
    """获取全局 agent 实例（供 router 使用）"""
    return _agent


app = FastAPI(title="智能旅行规划师", version="2.0.0", lifespan=lifespan)

app.add_middleware(LogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health():
    try:
        from app.utils.database import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return JSONResponse({"status": "degraded", "error": str(e)}, status_code=503)


@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    status = getattr(exc, "status_code", 500) if isinstance(exc, HTTPException) else 500
    detail = str(exc.detail) if isinstance(exc, HTTPException) and hasattr(exc, "detail") else "服务器内部错误"
    print(f"[ERROR {status}] {request.method} {request.url.path}: {exc}")
    return JSONResponse({"code": status, "message": detail}, status_code=status)


@app.get("/favicon.ico")
async def favicon():
    import os
    if os.path.exists("static/favicon.ico"):
        return FileResponse("static/favicon.ico")


@app.get("/")
async def root():
    return FileResponse("index.html")


app.include_router(api_router.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
