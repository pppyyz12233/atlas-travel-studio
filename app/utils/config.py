
import secrets
import warnings
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]

# 运行环境标识（ENV / APP_ENV）
PRODUCTION_ENV_NAMES = {"production", "prod"}

# JWT_SECRET 基本校验
JWT_SECRET_MIN_LENGTH = 32

# 完整匹配（不区分大小写）即视为占位值
_WEAK_JWT_SECRET_EXACT = frozenset({
    "secret",
    "secrets",
    "secret-key",
    "secretkey",
    "jwt-secret",
    "jwt_secret",
    "jwtsecret",
    "your-secret-key",
    "your_secret_key",
    "your-secret",
    "my-secret",
    "supersecret",
    "super-secret",
    "changeme",
    "change-me",
    "change-me-to-random",
    "change-me-please",
    "password",
    "123456",
    "12345678",
    "test",
    "test-secret",
    "key",
    "default",
})
# 包含这些子串（不区分大小写）即视为占位值
_WEAK_JWT_SECRET_SUBSTR = (
    "change-me",
    "change_me",
    "changeme",
    "your-secret",
    "your_secret",
    "please-change",
    "replace-me",
    "replace_me",
    "placeholder",
    "example-secret",
)


class ConfigError(RuntimeError):
    """配置不合法：生产环境下抛出并拒绝启动。"""


def is_weak_jwt_secret(secret: str) -> bool:
    """是否命中明显占位/默认值（secret、change-me、your-secret-key 等）。"""
    value = (secret or "").strip().lower()
    if not value:
        return True
    if value in _WEAK_JWT_SECRET_EXACT:
        return True
    return any(marker in value for marker in _WEAK_JWT_SECRET_SUBSTR)


def validate_jwt_secret(secret: str, *, env: str) -> str:
    """校验 JWT_SECRET，返回最终使用的值。

    - 生产环境（ENV/APP_ENV=production|prod）：缺失、为空、占位值或长度不足
      时抛出 ConfigError，应用拒绝启动；
    - 开发环境：同样情况只发 warning，并回退到随机临时密钥保证可启动
      （重启后临时密钥变化，已签发的令牌/游客 Cookie 会失效，属预期行为）。
    """
    value = (secret or "").strip()
    is_production = env.strip().lower() in PRODUCTION_ENV_NAMES

    problem = ""
    if not value:
        problem = "未配置"
    elif is_weak_jwt_secret(value):
        problem = "仍是默认/占位值"
    elif len(value) < JWT_SECRET_MIN_LENGTH:
        problem = f"长度不足（{len(value)}/{JWT_SECRET_MIN_LENGTH}）"

    if not problem:
        return value

    if is_production:
        raise ConfigError(
            f"JWT_SECRET {problem}，生产环境拒绝启动。"
            f"请在环境变量或项目根目录 .env 中设置至少 {JWT_SECRET_MIN_LENGTH} 位随机密钥，"
            f'生成方式：python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )

    fallback = secrets.token_urlsafe(48)
    warnings.warn(
        f"⚠️  JWT_SECRET {problem}，开发环境已回退为随机临时密钥"
        f"（重启后已签发的令牌/游客 Cookie 将失效）。"
        f"请在项目根目录 .env 中设置至少 {JWT_SECRET_MIN_LENGTH} 位随机密钥，"
        f'生成方式：python -c "import secrets; print(secrets.token_urlsafe(48))"',
        UserWarning,
        stacklevel=2,
    )
    return fallback


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 运行环境：ENV 或 APP_ENV，默认 development
    env: str = Field(default="development", validation_alias=AliasChoices("ENV", "APP_ENV"))

    # DeepSeek（可选：未配置时启动不报错，调用 LLM 时才失败）
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # JWT（代码中不携带任何真实密钥，最终值见下方启动校验）
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # DB
    db_url: str = "mysql+aiomysql://root:123456@localhost:3306/travel_planning_agent?charset=utf8mb4"
    sqlite_path: str = "sqlite+aiosqlite:///./travel.db"

    # Agent
    max_tool_iterations: int = 3

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() in PRODUCTION_ENV_NAMES

    @property
    def effective_db_url(self) -> str:
        """优先 SQLite，没有才用 MySQL"""
        return self.sqlite_path if self.sqlite_path else self.db_url


settings = Settings()

# ── 启动时安全检查：生产环境配置不合法直接拒绝启动，开发环境 warning 兜底 ──
settings.jwt_secret = validate_jwt_secret(settings.jwt_secret, env=settings.env)

# ── 向后兼容：所有旧 import 不受影响 ──
DEEPSEEK_API_KEY = settings.deepseek_api_key
DEEPSEEK_BASE_URL = settings.deepseek_base_url
DEEPSEEK_MODEL = settings.deepseek_model
JWT_SECRET = settings.jwt_secret
JWT_ALGORITHM = settings.jwt_algorithm
JWT_EXPIRE_HOURS = settings.jwt_expire_hours
DB_URL = settings.effective_db_url
MAX_TOOL_ITERATIONS = settings.max_tool_iterations
