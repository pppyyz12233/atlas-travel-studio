
import asyncio
import json
from openai import AsyncOpenAI, APIError, APITimeoutError
from app.utils.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


async def _create(params: dict):
    return await client.chat.completions.create(**params)


async def chat(messages: list[dict], tools: list[dict] | None = None,
               max_retries: int = 1, timeout: float = 60.0) -> dict:
    """
    DeepSeek 调用，带指数退避重试。

    重试策略：
    - 超时           → 重试（指数退避：2s → 4s）
    - 5xx 服务器错误  → 重试
    - 4xx 客户端错误  → 不重试，直接抛
    """
    params = {"model": DEEPSEEK_MODEL, "messages": messages, "temperature": 0.3, "timeout": timeout}
    if tools:
        params["tools"] = tools

    for attempt in range(max_retries + 1):
        try:
            response = await _create(params)
            break
        except APITimeoutError:
            if attempt == max_retries:
                raise
            print(f"[LLM] 超时，{attempt+2}/{max_retries+1}次尝试...")
            await asyncio.sleep(2 ** attempt)
        except APIError as e:
            status = getattr(e, "status_code", None)
            if status is not None and status >= 500 and attempt < max_retries:
                print(f"[LLM] 服务器错误 {status}，重试...")
                await asyncio.sleep(1)
            else:
                raise

    msg = response.choices[0].message
    # 转 dict 避免调用方踩坑（新版 SDK tool_calls 是 Pydantic 对象，不可下标访问）
    tc_list = []
    if msg.tool_calls:
        for tc in msg.tool_calls:
            tc_list.append({
                "id": tc.id,
                "type": tc.type,
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            })
    return {"content": msg.content or "", "tool_calls": tc_list, "raw_message": msg}


def parse_tool_call(resp: dict, index: int = 0) -> dict | None:
    """从 chat() 返回的响应中提取第 index 个 tool_call 的参数 dict。

    封装了 '列表取元素 -> 取 arguments 字符串 -> json.loads' 三步。
    tool_calls 为空或 index 越界时返回 None。
    """
    tc_list = resp.get("tool_calls", [])
    if not tc_list or index >= len(tc_list):
        return None
    tc = tc_list[index]
    args_str = tc["function"]["arguments"]
    return json.loads(args_str)


async def chat_stream(messages: list[dict]) -> str:
    """流式输出"""
    stream = await client.chat.completions.create(
        model=DEEPSEEK_MODEL, messages=messages, temperature=0.3, stream=True
    )
    result = ""
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            result += chunk.choices[0].delta.content
    return result
