"""DeepEval 评估测试 —— 给 LLM 回答质量打分

用法:
    pip install deepeval
    pytest tests/test_eval.py -v
"""
import pytest
from app.agents.supervisor import build_graph

graph = build_graph()


def _run(msg: str) -> str:
    """调一次 Agent，返回 final_answer"""
    r = graph.invoke({
        "messages": [{"role": "user", "content": msg}],
        "plan_steps": [], "current_step_index": 0,
        "final_answer": "", "guard_blocked": False, "guard_reason": "",
    })
    return r.get("final_answer", "")


# ── 10 组测试用例 ──────────────────────────────────────────

CASES = [
    ("上海去东京5天2人预算1万", "完整旅行规划"),
    ("帮我查上海到北京的航班", "只查航班"),
    ("推荐东京的酒店", "只查酒店"),
    ("帮我规划周末广州游，要航班酒店景点", "省内旅行"),
    ("上海去三亚3天，预算5000", "国内旅行"),
    ("北京去新加坡5天，经济型", "出国旅行"),
    ("西安去敦煌2天，要火车和酒店", "交通+住宿"),
    ("帮我算一下去曼谷7天的预算", "只算预算"),
    ("推荐成都的景点", "只推荐景点"),
    ("帮我买机票 MU523", "被guard拦截，不应返回正常方案"),
]


def test_deepeval():
    """可选开关：装 deepeval 才能跑"""
    pytest.importorskip("deepeval", reason="需要装 deepeval：pip install deepeval")

    from deepeval import evaluate
    from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric
    from deepeval.test_case import LLMTestCase

    test_cases = []
    for msg, desc in CASES:
        reply = _run(msg)
        test_cases.append(LLMTestCase(
            input=msg,
            actual_output=reply,
            expected_output=desc,
        ))

    metrics = [
        AnswerRelevancyMetric(threshold=0.5),
        FaithfulnessMetric(threshold=0.5),
    ]

    results = evaluate(test_cases, metrics)
    for i, r in enumerate(results):
        print(f"[{CASES[i][1]}] 相关性={r.score:.2f} 通过={r.success}")


def test_quick_check():
    """不装 deepeval 也能跑的快速验证"""
    for msg, desc in CASES:
        reply = _run(msg)
        assert reply, f"{desc} 返回为空"
