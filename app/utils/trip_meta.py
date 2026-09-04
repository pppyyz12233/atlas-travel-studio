# -*- coding: utf-8 -*-
"""从会话消息派生行程元数据（目的地/天数/出发地/出发日期）。

用于 GET /chat/conversations 的列表增强——云端行程卡片不再只有首条消息
50 字截断标题，而是显示"目的地 · N 天行程"；派生失败时字段为 None，
前端显示"未命名行程/天数待定"，绝不编造。

规则与前端 model.ts 的 inferDestinationFromBrief / inferDaysFromBrief 同源，
但这里优先从最后一次 assistant 回复（最终方案标题）取值，回落到首条用户消息。
"""
import re

_CN_DIGITS = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}

_TRIP_WORD = re.compile(r"行程|方案|之旅|旅游|旅行|自由行")

# 用户消息里的目的地：去/到/前往 + 城市 + 时长/常见停顿词
_DEST_FROM_USER = re.compile(
    r"(?:想去|要去|去|到|前往|目的地(?:是|为)?)\s*([一-鿿A-Za-z][一-鿿A-Za-z·\-]{1,19}?)"
    r"(?=[0-9０-９一二两三四五六七八九十半]+\s*[天日]|旅游|旅行|玩|看看|看|，|,|。|！|!|\s|$)"
)

# 用户消息里的出发地：从/由 + 城市
_ORIGIN_FROM_USER = re.compile(
    r"(?:从|由)\s*([一-鿿A-Za-z][一-鿿A-Za-z·\-]{1,11}?)(?=出发|去|到|飞|坐|乘|，|,|。|\s|$)"
)

# 天数：排除日期（9月18日/十月一日）、"第/当/每/明/后/次/改"前缀与相对措辞
_DAYS = re.compile(r"(?<![0-9月第当每明后次改])([0-9０-９]+|[一二两三四五六七八九十]+半?)\s*[天日]")
_RELATIVE_DAYS = re.compile(r"多加|再加|增加|减少|延长|缩短|多一天|少一天")

_DATE = re.compile(r"(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})")
_PREFIX_WORDS = re.compile(r"^(?:最终|最新|完整|详细|新版|旧版|定制|专属|我的|一份|这份|超值|精品|第[一二三四五六七八九十\d]+版?)+")
_SUFFIX_WORDS = re.compile(r"(?:天|日|晚|人|往返|游|美食|深度|休闲|亲子|蜜月|度假)+$")


def _cn_to_int(text: str) -> int | None:
    if text.isdigit():
        return int(text)
    m = re.fullmatch(r"(十)|([一二两三四五六七八九]?)十([一二两三四五六七八九]?)|([一二两三四五六七八九])半?", text)
    if not m:
        return None
    if m.group(1):
        return 10
    if m.group(2) or m.group(3):
        tens = _CN_DIGITS.get(m.group(2), 1) if m.group(2) else 1
        ones = _CN_DIGITS.get(m.group(3), 0) if m.group(3) else 0
        return tens * 10 + ones
    if m.group(4):
        return _CN_DIGITS[m.group(4)]
    return None


def _norm_days(text: str) -> int | None:
    if _RELATIVE_DAYS.search(text):
        return None
    m = _DAYS.search(text)
    if not m:
        return None
    raw = m.group(1).translate(str.maketrans("０１２３４５６７８９", "0123456789")).rstrip("半")
    value = _cn_to_int(raw)
    if value is None or not (1 <= value <= 30):
        return None
    return value


def _destination_from_reply(reply: str) -> str | None:
    """从最终方案 Markdown 标题派生目的地（与前端 deriveDestinationFromReply 同源算法）。"""
    for line in reply.split("\n"):
        clean = line.strip().lstrip("#").strip().strip("*").strip()
        if not clean:
            continue
        match = _TRIP_WORD.search(clean)
        if not match:
            continue
        before = clean[: match.start()]
        before = re.sub(r"(?:[0-9０-９]+|[一二两三四五六七八九十]+)\s*[天日]\S*", "", before)
        before = _SUFFIX_WORDS.sub("", before)
        before = re.sub(r"[\s·•，,、()（）\-—:：/]+", "", before)
        cut = max(before.rfind("从"), before.rfind("由"), before.rfind("去"), before.rfind("到"))
        if cut >= 0:
            before = before[cut + 1:]
        before = _PREFIX_WORDS.sub("", before)
        if 2 <= len(before) <= 10:
            return before
        break  # 只看第一个含行程词的标题行
    return None


def _destination_from_user(user_text: str) -> str | None:
    m = _DEST_FROM_USER.search(user_text or "")
    if m:
        name = m.group(1).strip()
        if 2 <= len(name) <= 10:
            return name
    return None


def _origin_from_user(user_text: str) -> str | None:
    m = _ORIGIN_FROM_USER.search(user_text or "")
    if m:
        name = m.group(1).strip()
        if 2 <= len(name) <= 10 and not re.search(r"出发|如何|这里", name):
            return name
    return None


def _date_from_user(user_text: str) -> str | None:
    m = _DATE.search(user_text or "")
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def derive_trip_meta(first_user: str, last_assistant: str) -> dict:
    """返回 {destination, origin, days, start_date}；未知为 None。"""
    destination = _destination_from_reply(last_assistant or "") or _destination_from_user(first_user or "")
    days = None
    for text in (last_assistant or "", first_user or ""):
        days = _norm_days(text[:200])
        if days:
            break
    return {
        "destination": destination,
        "origin": _origin_from_user(first_user or ""),
        "days": days,
        "start_date": _date_from_user(first_user or ""),
    }
