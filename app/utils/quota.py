# -*- coding: utf-8 -*-
"""聊天管线配额与并发保护（进程内存版，单实例部署）。

三层防线，全部在进入 LLM 管线之前生效（guard 拦下的请求不计数）：

1. 全局日配额——全站每日聊天管线总数，保护 API key 账单的熔断线；
2. 身份日配额——访客（游客 Cookie / IP）与登录用户各自的每日次数；
3. 并发闸门——同时在跑的管线数上限（每条管线 = 多次 LLM 调用）。

计数在内存中：重启清零、跨天惰性重置。限值 <= 0 表示该层不启用。
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import date
from typing import Callable

from app.utils.config import settings

logger = logging.getLogger(__name__)


class QuotaExceeded(Exception):
    """超过日配额。message 面向最终用户，可直接展示。"""

    def __init__(self, message: str, *, scope: str, limit: int, used: int):
        super().__init__(message)
        self.message = message
        self.scope = scope
        self.limit = limit
        self.used = used


class ChatBusyError(Exception):
    """并发槽位已满。"""


class DailyQuota:
    """按日计数器：每个身份 key（guest:xx / ip:x.x.x.x / user:7）一个桶，
    外加一个全站 ``global`` 桶。consume() 在任一层超限时抛 QuotaExceeded 且不增量。
    """

    GLOBAL_KEY = "global"

    def __init__(
        self,
        *,
        global_limit: int,
        guest_limit: int,
        user_limit: int,
        today: Callable[[], date] = date.today,  # 可注入，测试用
    ):
        self.global_limit = global_limit
        self.guest_limit = guest_limit
        self.user_limit = user_limit
        self._today = today
        self._day = today().isoformat()
        self._counts: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def _rollover(self) -> None:
        """跨天清零（惰性，无需后台任务）。"""
        day = self._today().isoformat()
        if day != self._day:
            self._counts.clear()
            self._day = day

    def _over(self, limit: int, used: int) -> bool:
        # limit <= 0 → 该层不启用（永不超限）
        return 0 < limit <= used

    async def consume(self, user_key: str | None, guest_key: str | None) -> None:
        """计数 +1（身份层与全站层同时加）。

        - user_key / guest_key 二选一：登录用户传 user_key，访客传 guest_key；
        - 任一层超限抛 QuotaExceeded（此时两层都不增量，未跑管线就不扣次数）。
        """
        async with self._lock:
            await self._rollover()

            identity = user_key or guest_key or "ip:unknown"
            identity_limit = self.user_limit if user_key else self.guest_limit
            used = self._counts.get(identity, 0)
            if self._over(identity_limit, used):
                if user_key:
                    message = (
                        f"今日使用次数已用完（每天 {identity_limit} 次），"
                        "明天再来，或先看看已有的行程方案"
                    )
                else:
                    message = (
                        f"今日体验次数已用完（游客每天 {identity_limit} 次），"
                        "注册登录可获得更多次数"
                    )
                logger.warning("[quota] 身份配额拒绝 %s: %d/%d", identity, used, identity_limit)
                raise QuotaExceeded(message, scope=identity, limit=identity_limit, used=used)

            g_used = self._counts.get(self.GLOBAL_KEY, 0)
            if self._over(self.global_limit, g_used):
                message = "今日全站使用量已达上限，明天再来吧"
                logger.warning("[quota] 全局配额熔断: %d/%d", g_used, self.global_limit)
                raise QuotaExceeded(
                    message, scope=self.GLOBAL_KEY, limit=self.global_limit, used=g_used,
                )

            self._counts[identity] = used + 1
            self._counts[self.GLOBAL_KEY] = g_used + 1
            logger.info(
                "[quota] 放行 %s: %d/%d（全站 %d/%d）",
                identity, used + 1, identity_limit, g_used + 1, self.global_limit,
            )

    async def usage(self, key: str) -> int:
        """读某桶当日已用次数（诊断用）。"""
        async with self._lock:
            await self._rollover()
            return self._counts.get(key, 0)


class ConcurrencyGate:
    """聊天管线并发闸门。

    asyncio 单线程模型下纯计数器即可（acquire 无 await 点，天然原子）；
    槽位满立即失败（ChatBusyError），不排队——前端 SSE error 已有可重试恢复态。
    """

    def __init__(self, limit: int):
        self.limit = max(1, limit)
        self.in_flight = 0

    @property
    def full(self) -> bool:
        return self.in_flight >= self.limit

    def acquire(self) -> None:
        if self.full:
            raise ChatBusyError("当前使用人数较多，请稍后再试")
        self.in_flight += 1

    def release(self) -> None:
        if self.in_flight > 0:
            self.in_flight -= 1

    @contextlib.contextmanager
    def slot(self):
        """with gate.slot(): ... —— 异常/取消路径也保证释放。"""
        self.acquire()
        try:
            yield
        finally:
            self.release()


daily_quota = DailyQuota(
    global_limit=settings.chat_daily_global_limit,
    guest_limit=settings.chat_daily_guest_limit,
    user_limit=settings.chat_daily_user_limit,
)
gate = ConcurrencyGate(settings.chat_max_concurrency)
