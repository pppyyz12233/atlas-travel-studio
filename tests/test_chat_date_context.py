# -*- coding: utf-8 -*-
"""LLM 日期上下文注入：只进 state、可剥除、Asia/Shanghai 取日。"""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.routers.chat_router import (  # noqa: E402
    _strip_date_context,
    _today_cn,
    _with_date_context,
)


class TestDateContext:
    def test_today_cn_is_shanghai_date(self):
        now_cn = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
        assert _today_cn() == now_cn
        # 格式固定 YYYY-MM-DD
        assert len(_today_cn()) == 10 and _today_cn()[4] == "-" and _today_cn()[7] == "-"

    def test_with_date_context_appends_the_required_block(self):
        msg = _with_date_context("去上海")
        assert msg.startswith("去上海")
        assert "【系统上下文】今天是 " in msg
        assert "用户未指定出发日期时，默认从今天开始安排。" in msg
        assert "不要使用示例日期。" in msg
        assert _today_cn() in msg

    def test_strip_removes_injected_block_roundtrip(self):
        original = "去上海，两个人"
        injected = _with_date_context(original)
        assert _strip_date_context(injected) == original

    def test_strip_only_removes_the_dated_block_not_user_text(self):
        user_text = "今天是假日，想去上海"
        assert _strip_date_context(user_text) == user_text

    def test_strip_removes_stale_block_from_history(self):
        # 上一轮注入的旧日期（模拟 checkpointer 里的历史）应被剥掉，避免两个"今天"
        stale = "上次的问题\n\n【系统上下文】今天是 2020-01-01。用户未指定出发日期时，默认从今天开始安排。不要使用示例日期。"
        assert _strip_date_context(stale) == "上次的问题"
        assert "2020-01-01" not in _strip_date_context(stale)
