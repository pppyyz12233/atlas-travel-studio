
import warnings
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # DeepSeek
    deepseek_api_key: str
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-v4-pro"

    # JWT
    jwt_secret: str = "change-me-please-this-is-not-secure-enough-32chars!"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # DB
    db_url: str = "mysql+aiomysql://root:123456@localhost:3306/travel_planning_agent?charset=utf8mb4"
    sqlite_path: str = "sqlite+aiosqlite:///./travel.db"

    # Agent
    max_tool_iterations: int = 3

    @property
    def effective_db_url(self) -> str:
        """优先 SQLite，没有才用 MySQL"""
        return self.sqlite_path if self.sqlite_path else self.db_url


settings = Settings()

# ── 启动时安全检查 ──
if "change-me" in settings.jwt_secret.lower():
    warnings.warn(
        "⚠️  JWT_SECRET 仍为默认值！生产环境请立即修改 .env 中的 JWT_SECRET。",
        UserWarning, stacklevel=2,
    )

# ── 向后兼容：所有旧 import 不受影响 ──
DEEPSEEK_API_KEY = settings.deepseek_api_key
DEEPSEEK_BASE_URL = settings.deepseek_base_url
DEEPSEEK_MODEL = settings.deepseek_model
JWT_SECRET = settings.jwt_secret
JWT_ALGORITHM = settings.jwt_algorithm
JWT_EXPIRE_HOURS = settings.jwt_expire_hours
DB_URL = settings.effective_db_url
MAX_TOOL_ITERATIONS = settings.max_tool_iterations
