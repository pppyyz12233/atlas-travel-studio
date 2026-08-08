
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import decode_token
from app.utils.database import AsyncSessionLocal, get_db
from app.crud.user import get_by_id


async def get_current_user_from_token(token: str, db: AsyncSession):
    """从 token 解析当前用户（需要已创建的 db session）"""
    payload = decode_token(token)
    return await get_by_id(db, int(payload["sub"]))


async def get_current_user(authorization: str = Header(...)):
    """从 Authorization: Bearer <token> 解析当前用户"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Bearer Token")

    try:
        async with AsyncSessionLocal() as db:
            return await get_current_user_from_token(authorization[7:], db)
    except Exception:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Optional auth — returns user or None for guest access"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        token = auth_header.split(" ")[1]
        return await get_current_user_from_token(token, db)
    except Exception:
        return None


async def require_admin(user=Depends(get_current_user)):
    """要求管理员角色"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
