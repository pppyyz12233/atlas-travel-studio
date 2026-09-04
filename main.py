import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from app.utils.database import init_db, engine
from app.routers import router as api_router

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.store.sqlite import AsyncSqliteStore
from app.agents.supervisor import build_graph

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

# 全局 agent 实例（带 checkpointer + store）
_agent = None
_store = None


class LogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = time.time() - start
        print(f"[{response.status_code}] {request.method} {request.url.path} {elapsed:.2f}s")
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _agent, _store
    await init_db()

    # 初始化 LangGraph Agent（带 Checkpointer + Memory Store）
    conn = await aiosqlite.connect(str(BASE_DIR / "checkpoint.db"))
    try:
        await conn.execute("PRAGMA journal_mode=WAL")
        checkpointer = AsyncSqliteSaver(conn)
        _store = AsyncSqliteStore(conn)
        await _store.setup()
        store = _store
        _agent = build_graph(checkpointer=checkpointer, store=store)
        print("[Agent] 已初始化 (checkpointer=AsyncSqliteSaver, store=AsyncSqliteStore)")

        yield
    finally:
        # 无论启动成功还是中途出错，都确保释放数据库连接，避免进程挂住锁死 checkpoint.db
        await conn.close()
        await engine.dispose()


def get_agent():
    """获取全局 agent 实例（供 router 使用）"""
    return _agent


def get_store():
    """获取全局 store 实例（供 router 手动调用 memory 节点）"""
    return _store


app = FastAPI(title="智能旅行规划师", version="2.0.0", lifespan=lifespan)

app.add_middleware(LogMiddleware)
app.add_middleware(
    CORSMiddleware,
    # 前端由本服务同源托管，CORS 只为 vite dev server（5173）跨端口调试开放
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8000", "http://127.0.0.1:8000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS)), name="frontend-assets")


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
    detail = str(getattr(exc, "detail", "")) if isinstance(exc, HTTPException) else "服务器内部错误"
    print(f"[ERROR {status}] {request.method} {request.url.path}: {exc}")
    return JSONResponse({"code": status, "message": detail}, status_code=status)


@app.get("/favicon.ico")
async def favicon():
    favicon_path = STATIC_DIR / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path)


app.include_router(api_router.router)


def frontend_build_missing_response() -> HTMLResponse:
    return HTMLResponse(
        status_code=503,
        content="""<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>前端尚未构建</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:12vh auto;padding:24px;line-height:1.7">
  <h1>Atlas 前端尚未构建</h1>
  <p>请先在项目目录执行：</p>
  <pre style="padding:16px;background:#f3f4f6;border-radius:12px;overflow:auto">cd frontend
npm install
npm run build</pre>
  <p>构建完成后重新启动 Python 服务。</p>
</body>
</html>""",
    )


@app.get("/")
async def root():
    built_index = FRONTEND_DIST / "index.html"
    if built_index.exists():
        return FileResponse(built_index)
    return frontend_build_missing_response()


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """托管 React 生产构建，并为前端路由回退到 index.html。"""
    built_index = FRONTEND_DIST / "index.html"
    if built_index.exists():
        candidate = (FRONTEND_DIST / full_path).resolve()
        if FRONTEND_DIST.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(built_index)
    return frontend_build_missing_response()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
