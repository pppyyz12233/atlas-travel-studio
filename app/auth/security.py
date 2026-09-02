
import bcrypt
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt

from app.utils.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

# ── 登出黑名单（jti → 过期时间戳）─────────────────────────────
# 内存版：单进程部署足够；多进程/重启后黑名单失效（已签发 token 仍在
# 有效期内可用），生产环境应换成 Redis 等共享存储。
_revoked: dict[str, int] = {}


def _prune_revoked() -> None:
    """清掉已自然过期的 jti，防止黑名单无限增长。"""
    now = int(time.time())
    expired = [jti for jti, exp in _revoked.items() if exp <= now]
    for jti in expired:
        _revoked.pop(jti, None)


def hash_password(password: str) -> str:
    """bcrypt 哈希，返回 salt+hash 字符串"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """验证密码"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "jti": secrets.token_urlsafe(16),  # 唯一 ID，登出时用于吊销
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """校验并解码 token；已登出（吊销）的 token 视为无效。"""
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    _prune_revoked()
    if payload.get("jti") and payload["jti"] in _revoked:
        raise jwt.InvalidTokenError("token 已登出吊销")
    return payload


def revoke_token(token: str) -> bool:
    """把 token 加入黑名单（登出）。返回是否成功。"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return False
    jti = payload.get("jti")
    if not jti:
        return False
    _revoked[jti] = int(payload.get("exp", 0) or 0)
    _prune_revoked()
    return True
