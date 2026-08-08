
import re

BLOCKED = [
    (r"(hack|inject|exploit|sql.*inject)", "检测到攻击意图"),
    (r"(帮我买|帮我下单|帮我支付|帮我转账)", "本系统不执行真实交易"),
    (r"(忘记.*(规则|提示|身份|系统))", "检测到越狱尝试"),
    (r"(色情|赌博|毒品|枪支)", "包含违规内容"),
]


def check(message: str) -> tuple:
    """返回 (是否拦截, 原因)"""
    for pattern, reason in BLOCKED:
        if re.search(pattern, message, re.IGNORECASE):
            return True, reason
    return False, ""
