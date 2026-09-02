from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
import hmac
import re
import secrets
import time

from fastapi import Response

from app.utils.config import JWT_SECRET


GUEST_COOKIE_NAME = "atlas_guest_session"
GUEST_SESSION_MAX_AGE = 30 * 24 * 60 * 60
_TOKEN_VERSION = "v1"
_CLOCK_SKEW_SECONDS = 5 * 60
_GUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32}$")


@dataclass(frozen=True, slots=True)
class GuestSession:
    guest_id: str
    cookie_value: str
    is_new: bool

    @property
    def thread_id(self) -> str:
        return f"guest_{self.guest_id}"

    @property
    def user_id(self) -> str:
        return f"guest:{self.guest_id}"

    @property
    def can_use_memory_store(self) -> bool:
        return False


def _signature(value: str, secret: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        value.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _encode(guest_id: str, issued_at: int, secret: str) -> str:
    payload = f"{_TOKEN_VERSION}.{guest_id}.{issued_at}"
    return f"{payload}.{_signature(payload, secret)}"


def _decode(
    cookie_value: str | None,
    *,
    secret: str,
    now: int,
) -> str | None:
    if not cookie_value:
        return None

    try:
        version, guest_id, issued_at_raw, supplied_signature = cookie_value.split(".")
        issued_at = int(issued_at_raw)
    except (TypeError, ValueError):
        return None

    if version != _TOKEN_VERSION or not _GUEST_ID_PATTERN.fullmatch(guest_id):
        return None

    age = now - issued_at
    if age < -_CLOCK_SKEW_SECONDS or age > GUEST_SESSION_MAX_AGE:
        return None

    payload = f"{version}.{guest_id}.{issued_at}"
    if not hmac.compare_digest(supplied_signature, _signature(payload, secret)):
        return None

    return guest_id


def resolve_guest_session(
    cookie_value: str | None,
    *,
    secret: str = JWT_SECRET,
    now: int | None = None,
) -> GuestSession:
    issued_at = int(time.time()) if now is None else now
    guest_id = _decode(cookie_value, secret=secret, now=issued_at)
    if guest_id is not None:
        return GuestSession(
            guest_id=guest_id,
            cookie_value=cookie_value or "",
            is_new=False,
        )

    guest_id = secrets.token_urlsafe(24)
    return GuestSession(
        guest_id=guest_id,
        cookie_value=_encode(guest_id, issued_at, secret),
        is_new=True,
    )


def set_guest_cookie(
    response: Response,
    session: GuestSession,
    *,
    secure: bool,
) -> None:
    response.set_cookie(
        key=GUEST_COOKIE_NAME,
        value=session.cookie_value,
        max_age=GUEST_SESSION_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
