from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Audio Stem Platform"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite:///./audio_platform.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    STORAGE_PROVIDER: str = "local"
    STORAGE_BASE_PATH: str = str(Path("storage").absolute())

    AI_PROVIDER: str = "demucs"
    DEMUCS_MODEL: str = "htdemucs"

    MAX_UPLOAD_SIZE_MB: int = 200

    class Config:
        env_file = ".env"


settings = Settings()
