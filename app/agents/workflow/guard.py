
import re

# 输入安全门卫（第一道防线，轻量正则；深度防护依赖各 Worker 的 system prompt 约束）
BLOCKED = [
    # 英文攻击词用 \b 词边界，避免误伤 hacker news / injection molding 这类正常词
    (r"\b(hack|exploit|malware|ransomware)\b|sql[ \-]?inject", "检测到攻击意图"),
    # 只拦"真实交易"意图；"帮我买机票"这类规划讨论属于正常需求，不拦
    (r"帮我(下单|支付|转账|代付|退款|代抢|抢票)", "本系统不执行真实交易"),
    (r"(忘记|忽略|无视).{0,8}(规则|提示|身份|系统|指令|设定)", "检测到越狱尝试"),
    (r"(色情|赌博|毒品|枪支|爆炸物)", "包含违规内容"),
]


def check(message: str) -> tuple:
    """返回 (是否拦截, 原因)"""
    for pattern, reason in BLOCKED:
        if re.search(pattern, message, re.IGNORECASE):
            return True, reason
    return False, ""
