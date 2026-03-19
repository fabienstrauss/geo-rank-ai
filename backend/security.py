from __future__ import annotations

import os
from functools import lru_cache

from cryptography.fernet import Fernet

from config import get_settings


DEFAULT_DEV_ENCRYPTION_KEY = "5mD5Ne8kTuKxvQ8mqA2x4zvJ9P4Qx0A2K4JYd2xM8Fg="


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    settings = get_settings()
    key = settings.app_encryption_key
    env = settings.env

    if not key:
        if env == "development":
            key = DEFAULT_DEV_ENCRYPTION_KEY
        else:
            raise RuntimeError("APP_ENCRYPTION_KEY must be set outside development")

    return Fernet(key.encode())


def encrypt_secret(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return get_fernet().decrypt(value.encode()).decode()


def mask_secret(last4: str | None) -> str | None:
    if not last4:
        return None
    return f"••••••••••{last4}"
