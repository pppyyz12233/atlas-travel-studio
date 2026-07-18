"""意图分类 —— 决定该跑哪些 Worker"""
import json
from enum import StrEnum
from dataclasses import dataclass, field

from app.utils.llm import chat


class Intent(StrEnum):
    FULL_TRIP = "full_trip"
    FLIGHT_ONLY = "flight_only"
    HOTEL_ONLY = "hotel_only"
    ATTRACTIONS_ONLY = "attractions_only"
    BUDGET_ONLY = "budget_only"
    ITINERARY_MODIFY = "itinerary_modify"


INTENT_WORKERS = {
    Intent.FULL_TRIP: ["flight", "hotel", "attraction", "itinerary", "budget"],
    Intent.FLIGHT_ONLY: ["flight"],
    Intent.HOTEL_ONLY: ["hotel"],
    Intent.ATTRACTIONS_ONLY: ["attraction", "itinerary"],
    Intent.BUDGET_ONLY: ["budget", "flight"],
    Intent.ITINERARY_MODIFY: ["itinerary"],
}


@dataclass
class IntentResult:
    intent: Intent = Intent.FULL_TRIP
    workers: list[str] = field(
        default_factory=lambda: ["flight", "hotel", "attraction", "itinerary", "budget"]
    )
    destination: str = ""
    origin: str = ""
    description: str = ""


INTENT_PROMPT = """分析用户的旅行请求，输出 JSON。

类别:
- full_trip: 完整旅行规划 (含目的地+天数)
- flight_only: 只查航班
- hotel_only: 只找酒店
- attractions_only: 只推荐景点
- budget_only: 只算预算
- itinerary_modify: 修改已有行程

提取: destination(目的地), origin(出发地), description(一句话任务描述)

用户: {message}

只输出 JSON:"""


async def classify_intent(message: str) -> IntentResult:
    """分类用户意图"""
    try:
        resp = await chat([
            {"role": "user", "content": INTENT_PROMPT.format(message=message)}
        ])
        content = resp.get("content", "{}").strip()
        s = content.find("{")
        e = content.rfind("}")
        if s != -1 and e != -1:
            data = json.loads(content[s:e + 1])
            intent_str = data.get("intent", "full_trip")
            intent = Intent(intent_str) if intent_str in Intent.__members__ else Intent.FULL_TRIP
            return IntentResult(
                intent=intent,
                workers=INTENT_WORKERS.get(intent, INTENT_WORKERS[Intent.FULL_TRIP]),
                destination=data.get("destination", ""),
                origin=data.get("origin", ""),
                description=data.get("description", message),
            )
    except Exception:
        pass
    return IntentResult()
