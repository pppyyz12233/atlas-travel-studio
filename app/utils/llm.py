"""DeepSeek API 封装 —— 重试 + 超时"""

import asyncio
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
    return {"content": msg.content or "", "tool_calls": msg.tool_calls or []}


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
