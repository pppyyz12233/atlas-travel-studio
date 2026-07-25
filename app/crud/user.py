"""用户数据操作"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.auth.security import hash_password, verify_password


#用户注册
async def create_user(db: AsyncSession, email: str | None, phone: str | None, username: str, password: str):
    # 邮箱唯一
    if email:
        result = await db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该邮箱已注册")
    # 手机号唯一
    if phone:
        result = await db.execute(select(User).where(User.phone == phone))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该手机号已注册")

    user = User(email=email, phone=phone, username=username, password=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


#邮箱登录
async def login_by_email(db: AsyncSession, email: str, password: str):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    return user


#手机号登录
async def login_by_phone(db: AsyncSession, phone: str, password: str):
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    return user


#根据ID获取
async def get_by_id(db: AsyncSession, user_id: int):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


#用户列表
async def list_users(db: AsyncSession):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


#设为管理员
async def set_admin(db: AsyncSession, user_id: int):
    user = await get_by_id(db, user_id)
    user.role = "admin"
    await db.commit()
    return user


#删除用户
async def delete_user(db: AsyncSession, user_id: int):
    user = await get_by_id(db, user_id)
    await db.delete(user)
    await db.commit()
