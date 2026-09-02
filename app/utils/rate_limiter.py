
import asyncio
import time
from fastapi import HTTPException


class RateLimiter:
    """滑动窗口限流"""

    def __init__(self, max_per_minute: int = 10):
        self.max = max_per_minute
        self.window = 60.0
        self.hits: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str):
        async with self._lock:
            now = time.time()
            # key 数量过多时清掉已过期的，防止长期运行内存无限增长
            if len(self.hits) > 4096:
                cutoff = now - self.window
                self.hits = {
                    k: v for k, v in self.hits.items() if v and v[-1] > cutoff
                }
            self.hits.setdefault(key, [])
            self.hits[key] = [t for t in self.hits[key] if now - t < self.window]
            if len(self.hits[key]) >= self.max:
                raise HTTPException(429, f"请求太频繁，每分钟最多 {self.max} 次")
            self.hits[key].append(now)
