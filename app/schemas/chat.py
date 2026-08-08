from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4096, examples=["帮我规划从上海去东京5天行程"])
    conversation_id: int | None = Field(default=None, examples=[1])


class ChatResponse(BaseModel):
    reply: str
    conversation_id: int


class MessageItem(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


class HistoryResponse(BaseModel):
    conversation_id: int
    messages: list[MessageItem]
