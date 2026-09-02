"""
Security-sensitive helpers, kept in one place so they're easy to audit:

- session store + sliding-expiration auth dependencies (mirrors the
  original x-session-token header scheme so the frontend needs no changes)
- constant-time password checking, with a migration path to bcrypt
- login brute-force throttling (per username + per IP)
- defenses against Google Sheets / CSV formula injection
- log-injection sanitization
"""
from __future__ import annotations

import hmac
import re
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

import bcrypt
from fastapi import Header, HTTPException, Request, status

from config import get_settings

settings = get_settings()

# ── Session store (in-memory, matches original behaviour) ──────────────
# NOTE: like the original Express server, this is process-local memory.
# It's fine for a single-instance deployment; swap for Redis if you ever
# run more than one backend worker/process.


@dataclass
class Session:
    username: str
    role: str
    last_seen: float = field(default_factory=time.time)


_sessions: dict[str, Session] = {}


def create_session(username: str, role: str) -> str:
    token = secrets.token_hex(32)  # 256 bits, matches original 32-byte token
    _sessions[token] = Session(username=username, role=role)
    return token


def get_session(token: Optional[str]) -> Optional[Session]:
    if not token:
        return None
    session = _sessions.get(token)
    if session is None:
        return None
    if time.time() - session.last_seen > settings.SESSION_TTL_SECONDS:
        _sessions.pop(token, None)
        return None
    session.last_seen = time.time()
    return session


def destroy_session(token: Optional[str]) -> Optional[Session]:
    if not token:
        return None
    return _sessions.pop(token, None)


def all_sessions() -> dict[str, Session]:
    return _sessions


def get_session_token(x_session_token: Optional[str] = Header(default=None)) -> Optional[str]:
    return x_session_token


def get_google_token(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    """Legacy helper, retained only in case something still sends this
    header. No longer required - see google_auth_client.get_access_token."""
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


def require_user(x_session_token: Optional[str] = Header(default=None)) -> Session:
    session = get_session(x_session_token)
    if session is None:
        raise HTTPException(status_code=401, detail="Login required")
    return session


def require_admin(x_session_token: Optional[str] = Header(default=None)) -> Session:
    session = get_session(x_session_token)
    if session is None:
        raise HTTPException(status_code=401, detail="Login required")
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return session


def require_google_token(authorization: Optional[str] = Header(default=None)) -> str:
    """Deprecated: Sheets access is now via a server-side service account
    (see google_auth_client.get_access_token). Kept only so nothing breaks
    if any leftover code still imports this name."""
    token = get_google_token(authorization)
    if not token:
        raise HTTPException(status_code=412, detail="Google Sheets Connection Required")
    return token


# ── Password handling ───────────────────────────────────────────────────

def verify_password(plain_password: str, stored_password: str) -> bool:
    """Accepts both legacy plaintext rows and bcrypt hashes, so existing
    spreadsheets keep working while new/rotated passwords are hashed."""
    if stored_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8")[:72], stored_password.encode("utf-8"))
        except ValueError:
            return False
    # Legacy plaintext comparison - constant time to avoid timing attacks.
    return hmac.compare_digest(plain_password.encode("utf-8"), stored_password.encode("utf-8"))


def hash_password(plain_password: str) -> str:
    hashed = bcrypt.hashpw(plain_password.encode("utf-8")[:72], bcrypt.gensalt())
    return hashed.decode("utf-8")


def generate_strong_password() -> str:
    return secrets.token_urlsafe(12)


# ── Login brute-force throttling ────────────────────────────────────────

@dataclass
class _Attempt:
    count: int = 0
    locked_until: float = 0.0


_login_attempts: dict[str, _Attempt] = {}


def _throttle_key(username: str, request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{username.lower()}::{client_ip}"


def check_login_allowed(username: str, request: Request) -> None:
    key = _throttle_key(username, request)
    attempt = _login_attempts.get(key)
    if attempt and attempt.locked_until > time.time():
        retry_in = int(attempt.locked_until - time.time())
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {retry_in}s.",
        )


def record_login_failure(username: str, request: Request) -> None:
    key = _throttle_key(username, request)
    attempt = _login_attempts.setdefault(key, _Attempt())
    attempt.count += 1
    if attempt.count >= settings.LOGIN_MAX_ATTEMPTS:
        attempt.locked_until = time.time() + settings.LOGIN_LOCKOUT_SECONDS
        attempt.count = 0


def record_login_success(username: str, request: Request) -> None:
    _login_attempts.pop(_throttle_key(username, request), None)


# ── Formula-injection / log-injection defenses ──────────────────────────

_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell(value) -> str:
    """Neutralize spreadsheet formula injection (CSV/Sheets injection):
    a value starting with =, +, -, or @ can be interpreted as a formula
    by Sheets/Excel when a user later exports/opens the data. Prefixing
    with an apostrophe forces it to be treated as plain text."""
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_TRIGGERS):
        return "'" + text
    return text


_CONTROL_CHARS = re.compile(r"[\r\n\x00-\x1f]")


def sanitize_log_field(value) -> str:
    """Strip control/newline characters so a malicious username or note
    can't forge extra lines in the activity log."""
    return _CONTROL_CHARS.sub(" ", "" if value is None else str(value)).strip()[:300]
