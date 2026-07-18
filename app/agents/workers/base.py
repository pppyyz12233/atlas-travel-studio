"""Worker 基类 —— 标准 ReAct Agent

特性:
- 并行 tool_calls：一次 LLM 调用返回多个 tool_call，全部并行执行
- ContextManager 接入：每轮循环前自动裁剪超长对话
- 结构化输出：WorkerResult(success, content, tool_calls_made, iterations)
- 错误恢复：JSON 解析失败 → 把错误反馈给 LLM 让它修正
- 工具结果截断：超长结果自动截断 + 摘要，防止撑爆上下文
"""

import json
import os
from dataclasses import dataclass, field

from app.utils.llm import chat
from app.utils.config import MAX_TOOL_ITERATIONS
from app.utils.context_manager import ContextManager
from app.mcp.registry import ToolRegistry


# ── 结构化输出 ──
@dataclass
class ToolCallRecord:
    """单次工具调用记录"""
    name: str
    arguments: dict
    result_summary: str       # 前 200 字符摘要
    success: bool


@dataclass
class WorkerResult:
    """Worker.run() 的结构化返回"""
    content: str                              # 最终回答
    success: bool = True                      # 是否成功完成
    tool_calls_made: list[ToolCallRecord] = field(default_factory=list)
    iterations: int = 0                       # 实际迭代轮数
    tokens_used_estimate: int = 0             # 估计 token 消耗


# ── 工具结果截断 ──
MAX_TOOL_RESULT_CHARS = 2000

def _truncate_result(raw: str, max_chars: int = MAX_TOOL_RESULT_CHARS) -> str:
    """截断过长工具结果，保留头尾各一半"""
    if len(raw) <= max_chars:
        return raw
    half = max_chars // 2 - 30
    return raw[:half] + f"\n\n... [中间省略 {len(raw) - max_chars} 字符] ...\n\n" + raw[-half:]


# ── 基类 ──
class BaseWorker:
    """标准 ReAct Agent 基类。5 个 Worker 继承它，只需指定 name。"""

    def __init__(self, name: str):
        self.name = name
        self._skill_path = f"app/agents/skills/{name}.md"
        self._system_prompt = None  # lazy loaded — not read at init
        self.max_iterations = MAX_TOOL_ITERATIONS
        self.ctx_manager = ContextManager(max_tokens=6000)  # 接入 ContextManager

    @property
    def system_prompt(self) -> str:
        """Lazy load SKILL.md from disk on first access"""
        if self._system_prompt is None:
            if os.path.exists(self._skill_path):
                with open(self._skill_path, "r", encoding="utf-8") as f:
                    self._system_prompt = f.read()
            else:
                self._system_prompt = f"你是{self.name}专家。"
        return self._system_prompt

    # ── 子类可重写的方法 ──

    def _get_tools(self) -> list[dict]:
        """子类可重写，限定可用工具。默认返回全部。"""
        return ToolRegistry.list_tools()

    def _max_tool_result_chars(self) -> int:
        """子类可重写工具结果截断长度"""
        return MAX_TOOL_RESULT_CHARS

    # ── ReAct 循环 ──

    async def run(self, query: str, context: list | None = None) -> str:
        """兼容旧接口：返回纯文本"""
        result = await self.run_structured(query, context)
        return result.content

    async def run_structured(
        self, query: str, context: list | None = None
    ) -> WorkerResult:
        """
        标准 ReAct 循环：Thought → Action(s) → Observation(s)

        参数:
            query:   当前任务描述
            context: 前序步骤结果 [{"step":"查航班","result":"..."}, ...]

        返回:
            WorkerResult(content, success, tool_calls_made, iterations)
        """
        tool_records: list[ToolCallRecord] = []

        # ── 构建初始消息 ──
        messages = [{"role": "system", "content": self.system_prompt}]

        if context:
            ctx_parts = ["前序步骤的结果："]
            for item in context:
                ctx_parts.append(
                    f"\n--- {item.get('step', '')} ---\n{item.get('result', '')}"
                )
            messages.append({"role": "user", "content": "".join(ctx_parts)})

        messages.append({"role": "user", "content": query})

        # ── ReAct 循环 ──
        for i in range(self.max_iterations):
            # 【新增】每轮前裁剪超长消息
            messages = self.ctx_manager.compress(messages)

            print(f"  [{self.name}] 第{i+1}/{self.max_iterations}轮思考... "
                  f"(tokens≈{self.ctx_manager.count(messages)})")

            tools = self._get_tools() or None
            resp = await chat(messages, tools=tools)

            # AI 要调工具 ── 【改进】处理所有 tool_calls，不只 [0]
            if resp.get("tool_calls"):
                tool_calls = resp["tool_calls"]

                # 构建 assistant 消息（可能包含多个 tool_call）
                assistant_msg = {
                    "role": "assistant",
                    "content": resp.get("content") or None,
                    "tool_calls": tool_calls,
                }
                messages.append(assistant_msg)

                # 【改进】依次执行所有工具调用
                for tc in tool_calls:
                    tool_name = tc.function.name
                    tool_args = self._parse_tool_args(tc, messages)
                    if tool_args is None:
                        # JSON 解析失败 → 已把错误注入 messages，让 LLM 修正
                        continue

                    print(f"  [{self.name}] 调用工具: {tool_name}({tool_args})")

                    try:
                        observation = await ToolRegistry.call(tool_name, **tool_args)
                        success = True
                    except Exception as e:
                        observation = f"工具执行出错: {e}"
                        success = False

                    result_str = str(observation)
                    summary = result_str[:200]
                    result_str = _truncate_result(
                        result_str, self._max_tool_result_chars()
                    )
                    print(f"  [{self.name}] 工具返回: {summary}...")

                    tool_records.append(ToolCallRecord(
                        name=tool_name,
                        arguments=tool_args,
                        result_summary=summary,
                        success=success,
                    ))

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_str,
                    })
            else:
                # AI 给最终答案
                content = resp.get("content", "抱歉，无法回答。")
                print(f"  [{self.name}] ReAct 完成 ({i+1}轮)")
                return WorkerResult(
                    content=content,
                    success=True,
                    tool_calls_made=tool_records,
                    iterations=i + 1,
                    tokens_used_estimate=self.ctx_manager.count(messages),
                )

        # 兜底
        return WorkerResult(
            content="处理超时，请重试。",
            success=False,
            tool_calls_made=tool_records,
            iterations=self.max_iterations,
            tokens_used_estimate=self.ctx_manager.count(messages),
        )

    # ── 工具参数解析（带错误恢复）──

    def _parse_tool_args(self, tool_call, messages: list[dict]) -> dict | None:
        """
        解析 tool_call 的 JSON 参数。
        如果失败，把错误消息注入对话让 LLM 修正，返回 None。
        """
        tool_name = tool_call.function.name
        try:
            return json.loads(tool_call.function.arguments)
        except json.JSONDecodeError as e:
            error_msg = (
                f"工具 {tool_name} 的参数 JSON 格式错误: {e}。"
                f"原始参数: {tool_call.function.arguments[:200]}。请修正后重试。"
            )
            print(f"  [{self.name}] {error_msg}")
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": error_msg,
            })
            return None
