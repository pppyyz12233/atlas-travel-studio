
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import user
from app.utils.database import get_db
from app.schemas.auth import RegisterRequest
from app.auth.security import create_token, revoke_token
from app.auth.dependencies import get_current_user
from app.utils.rate_limiter import RateLimiter

router = APIRouter(prefix="/auth", tags=["认证"])

# 登录限流：按 IP+账号 维度防暴力破解（密码错误提示已做统一，不泄露账号是否存在）
login_limiter = RateLimiter(max_per_minute=5)


class EmailLoginRequest(BaseModel):
    email: str = Field(examples=["traveler@example.com"])
    password: str = Field(examples=["myPass123"])


class PhoneLoginRequest(BaseModel):
    phone: str = Field(examples=["13800138000"])
    password: str = Field(examples=["myPass123"])


def _token_response(u):
    return {
        "code": 200,
        "message": "登录成功",
        "data": {
            "user_id": u.id,
            "username": u.username,
            "email": u.email,
            "phone": u.phone,
            "role": u.role,
            "access_token": create_token(u.id, u.role),
            "token_type": "bearer",
        }
    }


@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        new_user = await user.create_user(db, req.email, req.phone, req.username, req.password)
        return _token_response(new_user)
    except HTTPException:
        raise
    except Exception as e:
        # 详细异常只进服务端日志，不回传客户端（避免泄漏内部信息）
        import traceback
        print(f"[REGISTER ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="注册失败，请稍后重试")


@router.post("/login/email")
async def login_email(req: EmailLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    await login_limiter.check(f"email:{ip}:{req.email}")
    try:
        return _token_response(await user.login_by_email(db, req.email, req.password))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


@router.post("/login/phone")
async def login_phone(req: PhoneLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    await login_limiter.check(f"phone:{ip}:{req.phone}")
    try:
        return _token_response(await user.login_by_phone(db, req.phone, req.password))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


@router.post("/logout")
async def logout(authorization: str = Header(...)):
    """登出：吊销当前 token（加入黑名单，立即失效）。"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少 Bearer Token")
    ok = revoke_token(authorization[7:])
    return {"code": 200, "message": "已登出" if ok else "token 无效", "data": None}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        "code": 200,
        "message": "",
        "data": {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
        }
    }
