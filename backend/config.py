"""
Centralized configuration for the Dinesh Gold Loan FastAPI backend.

All secrets/config come from environment variables (.env) - nothing
sensitive is hardcoded in source, unlike the original Express server
where the spreadsheet id was baked into server.ts.
"""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


class Settings:
    # Google Sheets spreadsheet that backs the app's data.
    SPREADSHEET_ID: str = os.getenv(
        "SPREADSHEET_ID", "1M0bCZXdaCwt_0aeV9WSssxv0OiHd3HX04O0pIhrQE8k"
    )

    # Server-side Google service account credentials, used to talk to the
    # Sheets API directly - no per-user Google sign-in required. Provide
    # EITHER a path to the downloaded JSON key file OR the JSON itself
    # (handy for platforms where you can only set env vars, not files).
    GOOGLE_SERVICE_ACCOUNT_FILE: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
    GOOGLE_SERVICE_ACCOUNT_JSON: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")

    # Gemini API key used only for the "regional live gold rate" lookup.
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # Comma separated list of origins allowed to call this API.
    # Defaults to the local Vite dev server only - set explicitly in prod.
    ALLOWED_ORIGINS: list[str] = _split_csv(
        os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )

    # Session lifetime, in seconds (sliding expiration on activity).
    SESSION_TTL_SECONDS: int = int(os.getenv("SESSION_TTL_SECONDS", str(3600)))

    # Login brute-force protection.
    LOGIN_MAX_ATTEMPTS: int = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_SECONDS: int = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "300"))

    # Whether to auto-seed the Users sheet the very first time it's empty.
    # Off by default: seeding well-known credentials automatically is the
    # kind of thing that ends up on a "found on Shodan" list. If enabled,
    # random passwords are generated and printed to the server log once.
    SEED_DEFAULT_USERS: bool = os.getenv("SEED_DEFAULT_USERS", "false").lower() == "true"

    ENV: str = os.getenv("ENV", "development")

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
