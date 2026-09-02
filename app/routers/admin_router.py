
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import require_admin
from app.crud import user, document

router = APIRouter(prefix="/admin", tags=["管理"])

UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


def _safe_path(filename: str) -> str:
    """防路径穿越 + 防同名覆盖（加 uuid 前缀）"""
    safe_name = os.path.basename(filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    return os.path.join(UPLOAD_DIR, unique_name)


#用户列表
@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    users = await user.list_users(db)
    return {
        "code": 200,
        "message": "",
        "data": [
            {"id": u.id, "username": u.username, "role": u.role, "created_at": str(u.created_at)}
            for u in users
        ]
    }


#设为管理员
@router.put("/users/{user_id}/promote")
async def promote(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    u = await user.set_admin(db, user_id)
    return {"code": 200, "message": "已设为管理员", "data": {"id": u.id, "username": u.username}}


#删除用户
@router.delete("/users/{user_id}")
async def delete(user_id: int, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    await user.delete_user(db, user_id)
    return {"code": 200, "message": "删除成功", "data": None}


#上传文档
@router.post("/upload")
async def upload(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    # 检查文件扩展名
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}，仅支持 {', '.join(ALLOWED_EXTENSIONS)}")

    # 安全路径
    file_path = _safe_path(file.filename)
    # 分块读取边读边计数：超限立即中止，避免先整文件读进内存才检查（内存 DoS）
    written = 0
    with open(file_path, "wb") as f:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                f.close()
                os.remove(file_path)
                raise HTTPException(status_code=400, detail="文件大小不能超过 50MB")
            f.write(chunk)

    # 记录入库（文档解析功能待后续接入 RAG 管线实现）
    file_type = ext.lstrip(".")
    doc = await document.add_document(
        db, admin.id, file.filename, file_type, chunk_count=0, chroma_ids=[]
    )

    return {
        "code": 200,
        "message": f"文件 {file.filename} 上传成功",
        "data": {"document_id": doc.id, "filename": file.filename, "file_type": file_type},
    }


#文档列表
@router.get("/documents")
async def list_docs(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    docs = await document.list_documents(db)
    return {
        "code": 200,
        "message": "",
        "data": [
            {"id": d.id, "filename": d.filename, "file_type": d.file_type,
             "chunk_count": d.chunk_count, "created_at": str(d.created_at)}
            for d in docs
        ]
    }
