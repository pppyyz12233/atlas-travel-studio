
import json
from enum import StrEnum
from dataclasses import dataclass, field

from app.utils.llm import chat, parse_tool_call


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

VALID_INTENTS = {i.value for i in Intent}


@dataclass
class IntentResult:
    intent: Intent = Intent.FULL_TRIP
    workers: list[str] = field(
        default_factory=lambda: ["flight", "hotel", "attraction", "itinerary", "budget"]
    )
    destination: str = ""
    origin: str = ""
    description: str = ""


CLASSIFY_TOOL = [{
    "type": "function",
    "function": {
        "name": "classify_intent",
        "description": "分类用户的旅行意图",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": ["full_trip", "flight_only", "hotel_only",
                             "attractions_only", "budget_only", "itinerary_modify"],
                    "description": "意图类别"
                },
                "origin": {
                    "type": "string",
                    "description": "出发城市"
                },
                "destination": {
                    "type": "string",
                    "description": "目的城市"
                },
                "date": {
                    "type": "string",
                    "description": "出行日期"
                },
                "description": {
                    "type": "string",
                    "description": "一句话任务描述"
                },
            },
            "required": ["intent", "origin", "destination"]
        }
    }
}]


async def classify_intent(message: str) -> IntentResult:
    """分类用户意图"""
    try:
        resp = await chat(
            [{"role": "user", "content": f"分析意图: {message}"}],
            tools=CLASSIFY_TOOL,
        )
        tool_calls = resp.get("tool_calls", [])

        if not tool_calls:
            return IntentResult()

        args = parse_tool_call(resp)
        if args is None:
            return IntentResult()

        intent_str = args.get("intent", "full_trip")
        if intent_str not in VALID_INTENTS:
            intent_str = "full_trip"

        intent = Intent(intent_str)
        return IntentResult(
            intent=intent,
            workers=INTENT_WORKERS.get(intent, INTENT_WORKERS[Intent.FULL_TRIP]),
            destination=args.get("destination", ""),
            origin=args.get("origin", ""),
            description=args.get("description", message),
        )
    except Exception:
        pass
    return IntentResult()
