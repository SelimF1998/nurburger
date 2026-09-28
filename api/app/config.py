from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    secret_key: str = "change-me"
    web_url: str = "http://localhost:5173"

    database_url: str = "postgresql+asyncpg://nurburger:nurburger@localhost:5432/nurburger"
    redis_url: str = "redis://localhost:6379/0"

    google_client_id: str = ""
    google_client_secret: str = ""

    session_cookie: str = "nb_session"
    session_ttl_days: int = 30

    # Shared read-only demo project ("Acme Tasks"), seeded on startup
    demo_enabled: bool = True
    # Keep sending a trickle of live events into the demo
    demo_live: bool = True
    # Regenerate the demo on startup once its data is this old, so charts stay current
    demo_refresh_days: int = 7

    # Custom SQL queries
    sql_timeout_ms: int = 10_000
    sql_max_rows: int = 5_000

    @property
    def is_dev(self) -> bool:
        return self.env == "dev"

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.web_url}/api/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
