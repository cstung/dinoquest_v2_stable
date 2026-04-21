import sys
from pydantic_settings import BaseSettings

WEAK_SECRETS = {"changeme", "secret", "password", "12345678", "1234567890123456"}


class Settings(BaseSettings):
    SECRET_KEY: str
    REGISTRATION_ENABLED: bool = False
    DATABASE_URL: str = "sqlite+aiosqlite:////app/data/chores_os.db"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    COOKIE_SECURE: bool = False
    LOGIN_RATE_LIMIT_MAX: int = 10
    PIN_RATE_LIMIT_MAX: int = 5
    REGISTER_RATE_LIMIT_MAX: int = 5
    CORS_ORIGINS: str = ""
    MAX_UPLOAD_SIZE_MB: int = 5
    DAILY_RESET_HOUR: int = 0
    TZ: str = "Europe/London"
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIM_EMAIL: str = "mailto:admin@example.com"

    # AI YouTube Question Generator
    OPENAI_API_KEY: str = "sk-placeholder"
    OPENAI_MODEL: str = "gpt-4o"
    YT_DLP_CACHE_DIR: str = "/tmp/yt-dlp-cache"
    YOUTUBE_GENERATE_DAILY_LIMIT: int = 10
    YOUTUBE_OEMBED_TIMEOUT_SECONDS: float = 10.0
    YOUTUBE_TRANSCRIPT_TIMEOUT_SECONDS: float = 20.0
    YOUTUBE_TRANSCRIPT_MAX_CONCURRENCY: int = 4

    model_config = {"env_file": ".env", "extra": "ignore"}


def get_settings() -> Settings:
    settings = Settings()
    if len(settings.SECRET_KEY) < 16:
        print("ERROR: SECRET_KEY must be at least 16 characters")
        sys.exit(1)
    if settings.SECRET_KEY.lower() in WEAK_SECRETS:
        print("ERROR: SECRET_KEY is a known weak value. Choose a strong secret.")
        sys.exit(1)
    return settings


settings = get_settings()
