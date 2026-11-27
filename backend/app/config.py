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
    llm_model: str = "gemini-3.5-flash-lite"  # fast enough for the counter; any Gemini model works

    # Optional Wispr Flow speech-to-text for the in-app mic. Empty = browser speech fallback.
    wispr_api_key: str = ""
    wispr_api_url: str = "https://platform-api.wisprflow.ai/api/v1/dash/api"

    # Optional Google login (Firebase web config, public values). All four empty = login off.
    firebase_api_key: str = ""
    firebase_auth_domain: str = ""
    firebase_project_id: str = ""
    firebase_app_id: str = ""

    # Load the demo shop automatically on first start. Off: a new install shows the shop setup
    # screen, which also has a one-tap "Try a demo shop" (POST /api/setup/demo).
    seed_on_start: bool = False

    timezone: str = "Asia/Kolkata"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_provider and self.llm_api_key)

    @property
    def wispr_configured(self) -> bool:
        return bool(self.wispr_api_key)

    @property
    def firebase_configured(self) -> bool:
        return bool(self.firebase_api_key and self.firebase_auth_domain and self.firebase_project_id)


settings = Settings()
