from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def read_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value:
        return value

    file_path = os.getenv(f"{name}_FILE")
    if file_path:
        with open(file_path, "r", encoding="utf-8") as file:
            return file.read().strip()

    return default


@dataclass(frozen=True)
class Settings:
    env: str
    database_url: str
    app_encryption_key: str | None
    cors_origins: list[str]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env = read_env("ENV", "development") or "development"

    database_url = read_env("DATABASE_URL")
    if not database_url:
        postgres_user = read_env("POSTGRES_USER", "georank") or "georank"
        postgres_password = read_env("POSTGRES_PASSWORD", "georank") or "georank"
        postgres_db = read_env("POSTGRES_DB", "georank_db") or "georank_db"
        postgres_host = read_env("POSTGRES_HOST", "localhost") or "localhost"
        postgres_port = read_env("POSTGRES_PORT", "5432") or "5432"
        database_url = (
            f"postgresql+psycopg2://{postgres_user}:{postgres_password}@{postgres_host}:{postgres_port}/{postgres_db}"
        )

    cors_origins_raw = read_env("BACKEND_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000") or ""
    cors_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

    return Settings(
        env=env,
        database_url=database_url,
        app_encryption_key=read_env("APP_ENCRYPTION_KEY"),
        cors_origins=cors_origins,
    )
