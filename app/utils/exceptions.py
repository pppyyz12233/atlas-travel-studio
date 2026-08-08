
class NotFoundError(Exception):
    """资源不存在  →  HTTP 404"""
    pass


class ForbiddenError(Exception):
    """权限不足  →  HTTP 403"""
    pass


class BadRequestError(Exception):
    """请求参数错误  →  HTTP 400"""
    pass


class UnauthorizedError(Exception):
    """未登录  →  HTTP 401"""
    pass


class AgentRefuseError(Exception):
    """Guard/Workflow 拦截，Agent 拒绝处理  →  HTTP 422"""
    pass
