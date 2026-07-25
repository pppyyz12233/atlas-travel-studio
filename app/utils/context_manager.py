"""上下文管理 —— 对话太长时自动裁剪

注意：使用 cl100k_base tokenizer (GPT-4 编码)。DeepSeek 的 tokenizer 与此有 ~10-20% 偏差，
但 Compress 的保守上限 (4000 token) 留有足够余量，不会导致功能问题。
"""
import tiktoken


class ContextManager:
    def __init__(self, max_tokens=4000):
        self.max_tokens = max_tokens
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def count(self, messages: list[dict]) -> int:
        """算总 token 数"""
        text = "\n".join(m.get("content", "") or "" for m in messages)
        return len(self.encoder.encode(text))

    def compress(self, messages: list[dict]) -> list[dict]:
        """超过上限时，保留 system prompt + 最近的对话"""
        if self.count(messages) <= self.max_tokens:
            return messages

        system_msg = messages[0] if messages[0]["role"] == "system" else None

        kept = []
        for m in reversed(messages):
            candidate = kept + [m]
            if self.count(candidate) > self.max_tokens:
                if not kept:
                    content = (m.get("content") or "")[:self.max_tokens // 2]
                    m = {**m, "content": content + "\n...(内容过长已截断)"}
                    kept.insert(0, m)
                break
            kept.insert(0, m)

        if system_msg and system_msg not in kept:
            if self.count([system_msg] + kept) <= self.max_tokens:
                kept.insert(0, system_msg)

        return kept
