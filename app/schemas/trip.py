from pydantic import BaseModel, Field


class Location(BaseModel):
    """地理位置（lng/lat 可选——LLM 有时只给名称不给坐标）"""
    lng: float = Field(default=0.0, description="经度")
    lat: float = Field(default=0.0, description="纬度")
    name: str = Field(description="地点名称", default="")
    address: str = Field(description="地址", default="")
    type: str = Field(description="类型: airport/hotel/attraction/station/other", default="other")


class TripItem(BaseModel):
    """行程中的单个条目 (航班/酒店/景点等)——所有字段可选，LLM 不一定填全"""
    name: str = Field(default="", description="名称")
    detail: str = Field(default="", description="详细信息")
    price: str = Field(default="", description="价格")
    date: str = Field(default="", description="日期")


class StepOutput(BaseModel):
    """单个 Worker 步骤的结构化输出"""
    summary: str = Field(description="前 100 字摘要", default="")
    locations: list[Location] = Field(default_factory=list)
    items: list[TripItem] = Field(default_factory=list)


class TripState(BaseModel):
    """完整行程状态 —— 用于多轮对话修改"""
    destination: str = Field(default="")
    origin: str = Field(default="")
    dates: list[str] = Field(default_factory=list)
    flights: list[TripItem] = Field(default_factory=list)
    hotels: list[TripItem] = Field(default_factory=list)
    attractions: list[TripItem] = Field(default_factory=list)
    itinerary: list[dict] = Field(default_factory=list)  # [{day, morning, afternoon, evening}]
    budget_items: list[dict] = Field(default_factory=list)  # [{category, amount}]
    total_budget: str = Field(default="")
    locations: list[Location] = Field(default_factory=list)
