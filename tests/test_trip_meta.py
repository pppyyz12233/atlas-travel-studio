# -*- coding: utf-8 -*-
"""云端行程列表元数据派生（/chat/conversations 增强字段）。"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.utils.trip_meta import derive_trip_meta  # noqa: E402


class TestDeriveTripMeta:
    def test_guangzhou_one_day(self):
        meta = derive_trip_meta("去广州一天", "## 广州一日游方案\n\n### 航班\n…")
        assert meta["destination"] == "广州"
        assert meta["days"] == 1

    def test_shanghai_tokyo_four_days_with_origin(self):
        meta = derive_trip_meta("从上海去东京 4 天", "## 东京4天行程方案")
        assert meta["destination"] == "东京"
        assert meta["origin"] == "上海"
        assert meta["days"] == 4

    def test_unrecognizable_message_yields_nulls_not_fabrication(self):
        meta = derive_trip_meta("继续", "")
        assert meta["destination"] is None
        assert meta["days"] is None
        assert meta["origin"] is None

    def test_explicit_start_date_is_extracted(self):
        meta = derive_trip_meta("2026-10-01 从北京去西安 3 天", "")
        assert meta["start_date"] == "2026-10-01"
        assert meta["origin"] == "北京"
        assert meta["days"] == 3

    def test_chinese_numeral_day_blocks_are_stripped_from_titles(self):
        for heading, expected in (("## 广州一日游方案", "广州"), ("## 东京四日游行程", "东京")):
            meta = derive_trip_meta("随便聊聊", heading)
            assert meta["destination"] == expected, heading
