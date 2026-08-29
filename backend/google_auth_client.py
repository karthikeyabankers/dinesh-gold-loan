"""
Server-side Google authentication using a service account.

Replaces the old per-user OAuth flow: instead of every browser session
signing in with Google and forwarding its own access token, this backend
holds one set of credentials and talks to the Sheets API itself. The
spreadsheet must be shared with the service account's email address
(see backend/README.md).

Access tokens are cached in memory and refreshed automatically shortly
before they expire (Google access tokens are short-lived, ~1 hour).
"""
from __future__ import annotations

import json
import threading

from fastapi import HTTPException
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

from config import get_settings

settings = get_settings()

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

_lock = threading.Lock()
_credentials: service_account.Credentials | None = None


def _load_credentials() -> service_account.Credentials:
    if settings.GOOGLE_SERVICE_ACCOUNT_JSON:
        info = json.loads(settings.GOOGLE_SERVICE_ACCOUNT_JSON)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    if settings.GOOGLE_SERVICE_ACCOUNT_FILE:
        return service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
    raise HTTPException(
        status_code=500,
        detail=(
            "Google service account not configured. Set GOOGLE_SERVICE_ACCOUNT_FILE "
            "or GOOGLE_SERVICE_ACCOUNT_JSON in backend/.env - see backend/README.md."
        ),
    )


async def get_access_token() -> str:
    """FastAPI dependency: returns a valid, auto-refreshed access token for
    the Sheets API. Used in place of the old header-based Google token."""
    global _credentials
    with _lock:
        if _credentials is None:
            _credentials = _load_credentials()
        if not _credentials.valid:
            try:
                _credentials.refresh(GoogleAuthRequest())
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=502,
                    detail="Could not authenticate to Google Sheets. Check the service account credentials.",
                ) from exc
        return _credentials.token
