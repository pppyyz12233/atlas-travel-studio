
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import user
from app.utils.database import get_db
from app.schemas.auth import RegisterRequest
from app.auth.security import create_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["认证"])


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
        import traceback
        print(f"[REGISTER ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"注册失败: {e}")


@router.post("/login/email")
async def login_email(req: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        return _token_response(await user.login_by_email(db, req.email, req.password))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


@router.post("/login/phone")
async def login_phone(req: PhoneLoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        return _token_response(await user.login_by_phone(db, req.phone, req.password))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


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
