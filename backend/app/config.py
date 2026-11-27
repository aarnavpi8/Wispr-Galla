"""App settings. Every value has a default so the app starts without a .env file."""

from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite by default (local dev, zero setup). Docker Compose sets a Postgres URL.
    database_url: str = "sqlite:///./galla.db"

    # Optional LLM upgrade for extract(). Empty means the rule-based extractor is used.
    llm_provider: str = ""
    llm_api_key: str = ""

    # Load the demo shop on first start so the app never shows an empty screen.
    seed_on_start: bool = True

    timezone: str = "Asia/Kolkata"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_provider and self.llm_api_key)


settings = Settings()
