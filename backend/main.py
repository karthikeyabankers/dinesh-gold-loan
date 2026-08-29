"""
Dinesh Gold Loan - FastAPI backend.

Drop-in replacement for the original Express server.ts. Every route,
path, and header (`x-session-token`, `Authorization: Bearer <google
token>`) is identical, so src/App.tsx works completely unchanged.

Security hardening added on top of a straight port:
  - CORS locked to an explicit origin allowlist (was implicitly *)
  - Security response headers on every response
  - Per-IP + per-username rate limiting, with lockout on the login route
  - Constant-time password comparison, with a bcrypt upgrade path
  - Spreadsheet formula-injection sanitization on every write
  - Pydantic validation on every request body
  - Upstream/internal error details are logged, never echoed to clients
  - No hardcoded default credentials (see sheets_client.ensure_users_exist)
"""
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config import get_settings
from gemini_client import get_regional_gold_rate
import google_auth_client as google_auth
import security as sec
from models import LoginRequest, PendingSubmissionIn, RecordIn
import sheets_client as sheets
from sheets_client import SheetsError

settings = get_settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dinesh_gold_loan")

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Dinesh Gold Loan API starting (env=%s)", settings.ENV)
    yield


app = FastAPI(title="Dinesh Gold Loan API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "x-session-token"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# ── Central error handling: never leak internals to the client ─────────

@app.exception_handler(SheetsError)
async def sheets_error_handler(request: Request, exc: SheetsError):
    logger.error("Sheets error on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=502, content={"detail": "Google Sheets request failed. Please try again."})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Health check ─────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}


# ── Auth ─────────────────────────────────────────────────────────────────

@app.post("/api/login")
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest):
    google_token = await google_auth.get_access_token()

    sec.check_login_allowed(payload.username, request)

    await sheets.ensure_sheets_exist(google_token)
    await sheets.ensure_users_exist(google_token)

    rows = await sheets.fetch_users_sheet(google_token)
    if len(rows) < 2:
        raise HTTPException(status_code=500, detail="No user accounts found in Google Sheets.")

    headers = [h.strip().upper() for h in rows[0]]
    try:
        u_idx, p_idx, r_idx = headers.index("USERNAME"), headers.index("PASSWORD"), headers.index("ROLE")
    except ValueError:
        raise HTTPException(status_code=500, detail="Users sheet is missing required columns (USERNAME, PASSWORD, ROLE).")

    uname = payload.username.strip().lower()
    matched = None
    for row in rows[1:]:
        row_uname = str(row[u_idx] if len(row) > u_idx else "").strip().lower()
        row_pass = str(row[p_idx] if len(row) > p_idx else "").strip()
        row_role = str(row[r_idx] if len(row) > r_idx else "user").strip().lower()
        if row_uname == uname and sec.verify_password(payload.password, row_pass):
            matched = {"username": row_uname, "role": row_role}
            break

    if not matched:
        sec.record_login_failure(payload.username, request)
        raise HTTPException(status_code=400, detail="Invalid username or password")

    sec.record_login_success(payload.username, request)
    token = sec.create_session(matched["username"], matched["role"])
    log_activity(matched["username"], "LOGIN", f"{matched['role']} logged in via Google Sheets registry")
    return {"ok": True, "role": matched["role"], "sessionToken": token}


@app.post("/api/logout")
async def logout(x_session_token: str | None = None, session_token: str | None = Depends(sec.get_session_token)):
    session = sec.destroy_session(session_token)
    if session:
        log_activity(session.username, "LOGOUT", "logged out")
    return {"ok": True}


@app.get("/api/me")
async def me(session_token: str | None = Depends(sec.get_session_token)):
    session = sec.get_session(session_token)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found")
    return {"username": session.username, "role": session.role}


# ── Activity log (in-memory, mirrors original) ──────────────────────────

_activity_log: list[dict] = []


def log_activity(username: str, action: str, detail: str = "") -> None:
    import datetime as _dt
    from zoneinfo import ZoneInfo as _ZI

    entry = {
        "time": _dt.datetime.now(_ZI("Asia/Kolkata")).strftime("%d/%m/%Y, %I:%M:%S %p"),
        "username": sec.sanitize_log_field(username),
        "action": sec.sanitize_log_field(action),
        "detail": sec.sanitize_log_field(detail),
    }
    _activity_log.insert(0, entry)
    del _activity_log[200:]


# ── Records ──────────────────────────────────────────────────────────────

@app.get("/api/records")
async def list_records(user=Depends(sec.require_user), google_token=Depends(google_auth.get_access_token)):
    return await sheets.read_records(google_token)


@app.get("/api/records/{number}")
async def get_record(number: int, user=Depends(sec.require_user), google_token=Depends(google_auth.get_access_token)):
    records = await sheets.read_records(google_token)
    rec = next((r for r in records if r["number"] == number), None)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    return rec


@app.put("/api/records/{number}")
async def update_record(
    number: int,
    payload: RecordIn,
    user=Depends(sec.require_admin),
    google_token=Depends(google_auth.get_access_token),
):
    records = await sheets.read_records(google_token)
    index = next((i for i, r in enumerate(records) if r["number"] == number), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Record not found")

    records[index] = {
        **records[index],
        "name": payload.name,
        "phone": payload.phone,
        "item_name": payload.item_name,
        "no_of_items": payload.no_of_items,
        "net_weight": payload.net_weight,
        "amount": payload.amount,
        "pledge_date": payload.pledge_date,
        "release_date": payload.release_date or "",
        "locker": payload.locker or "",
    }
    await sheets.write_records(google_token, records)
    log_activity(user.username, "EDIT", f"Updated record #{number} ({payload.name})")
    return {"ok": True}


@app.delete("/api/records/{number}")
async def delete_record(
    number: int,
    user=Depends(sec.require_admin),
    google_token=Depends(google_auth.get_access_token),
):
    records = await sheets.read_records(google_token)
    target = next((r for r in records if r["number"] == number), None)
    if not target:
        raise HTTPException(status_code=404, detail="Record not found")

    filtered = [r for r in records if r["number"] != number]

    import datetime as _dt

    await sheets.append_deleted_row(google_token, [
        target["number"], target["name"], target["amount"], target["item_name"],
        target["no_of_items"], target["net_weight"], target["phone"],
        target["pledge_date"], target.get("release_date", ""), target.get("locker", ""),
        _dt.date.today().isoformat(), user.username,
    ])
    await sheets.write_records(google_token, filtered)
    log_activity(user.username, "DELETE", f"Deleted record #{number}")
    return {"ok": True}


@app.get("/api/search")
async def search_records(
    name: str = "",
    user=Depends(sec.require_user),
    google_token=Depends(google_auth.get_access_token),
):
    q = (name or "").strip().lower()[:150]
    if not q:
        return []
    records = await sheets.read_records(google_token)
    matched = [
        r for r in records
        if q in str(r.get("name", "")).lower()
        or q in str(r.get("number", "")).lower()
        or q in str(r.get("phone", "")).lower()
        or q in str(r.get("item_name", "")).lower()
        or q in str(r.get("locker", "")).lower()
        or q in str(r.get("pledge_date", "")).lower()
    ]
    return matched


# ── Submission queue ─────────────────────────────────────────────────────

@app.post("/api/pending")
async def submit_pending(
    payload: PendingSubmissionIn,
    user=Depends(sec.require_user),
    google_token=Depends(google_auth.get_access_token),
):
    import datetime as _dt

    today = _dt.date.today().isoformat()
    is_auto_approve = user.role == "admin"
    pledge_date = payload.pledge_date or today

    await sheets.append_submission_row(google_token, [
        today, user.username, payload.name, payload.phone, payload.item_name,
        payload.amount, payload.net_weight, "approved" if is_auto_approve else "pending",
        payload.no_of_items, pledge_date, payload.locker or "",
    ])

    if is_auto_approve:
        records = await sheets.read_records(google_token)
        existing_numbers = [r["number"] for r in records if isinstance(r["number"], int)]
        next_num = (max(existing_numbers) + 1) if existing_numbers else 1001
        records.append({
            "number": next_num, "name": payload.name, "phone": payload.phone,
            "item_name": payload.item_name, "no_of_items": payload.no_of_items,
            "net_weight": payload.net_weight, "amount": payload.amount,
            "pledge_date": pledge_date, "release_date": "", "locker": payload.locker or "",
        })
        await sheets.write_records(google_token, records)

    subs = await sheets.read_submissions(google_token)
    pid = subs[-1]["id"] if subs else 1
    log_activity(user.username, "SUBMIT", f"Submitted entry for approval: {payload.name}")
    return {"ok": True, "pending_id": pid}


@app.get("/api/pending")
async def list_pending(user=Depends(sec.require_admin), google_token=Depends(google_auth.get_access_token)):
    return await sheets.read_submissions(google_token)


@app.get("/api/my-pending")
async def my_pending(user=Depends(sec.require_user), google_token=Depends(google_auth.get_access_token)):
    subs = await sheets.read_submissions(google_token)
    return [s for s in subs if s["submitted_by"] == user.username]


@app.post("/api/pending/{pid}/approve")
async def approve_pending(pid: int, user=Depends(sec.require_admin), google_token=Depends(google_auth.get_access_token)):
    subs = await sheets.read_submissions(google_token)
    sub = next((s for s in subs if s["id"] == pid), None)
    if not sub:
        raise HTTPException(status_code=404, detail="Pending submission not found")
    if sub["status"] != "pending":
        raise HTTPException(status_code=400, detail="Submission is already processed")

    records = await sheets.read_records(google_token)
    existing_numbers = [r["number"] for r in records if isinstance(r["number"], int)]
    next_num = (max(existing_numbers) + 1) if existing_numbers else 1001

    r = sub["record"]
    records.append({
        "number": next_num, "name": r["name"], "phone": r["phone"], "item_name": r["item_name"],
        "no_of_items": r["no_of_items"], "net_weight": r["net_weight"], "amount": r["amount"],
        "pledge_date": r["pledge_date"], "release_date": "", "locker": r["locker"],
    })
    await sheets.write_records(google_token, records)
    await sheets.update_submission_status(google_token, pid + 1, "approved")
    log_activity(user.username, "APPROVE", f"Approved submission #{pid} -> Record #{next_num} ({r['name']})")
    return {"ok": True, "record_number": next_num}


@app.post("/api/pending/{pid}/reject")
async def reject_pending(pid: int, user=Depends(sec.require_admin), google_token=Depends(google_auth.get_access_token)):
    subs = await sheets.read_submissions(google_token)
    sub = next((s for s in subs if s["id"] == pid), None)
    if not sub:
        raise HTTPException(status_code=404, detail="Pending submission not found")
    if sub["status"] != "pending":
        raise HTTPException(status_code=400, detail="Submission is already processed")

    await sheets.update_submission_status(google_token, pid + 1, "rejected")
    log_activity(user.username, "REJECT", f"Rejected submission #{pid} ({sub['record']['name']})")
    return {"ok": True}


# ── Regional live gold rates ─────────────────────────────────────────────

@app.get("/api/live-rates/regional")
@limiter.limit("20/minute")
async def live_rates_regional(request: Request, region: str = "West Godavari, Andhra Pradesh, India"):
    return await get_regional_gold_rate(region)


# ── Admin dashboard ──────────────────────────────────────────────────────

@app.get("/api/admin/stats")
async def admin_stats(user=Depends(sec.require_admin), google_token=Depends(google_auth.get_access_token)):
    records = await sheets.read_records(google_token)
    subs = await sheets.read_submissions(google_token)
    pending = [s for s in subs if s["status"] == "pending"]
    now = time.time()

    online = [
        {"username": s.username, "role": s.role, "idle_seconds": int(now - s.last_seen)}
        for s in sec.all_sessions().values()
    ]

    return {
        "online_users": online,
        "total_records": len(records),
        "pending_count": len(pending),
        "total_weight": sum(r.get("net_weight", 0) for r in records),
        "total_amount": sum(r.get("amount", 0) for r in records),
        "activity_log": _activity_log[:50],
    }


# ── Serve the built frontend (single-container deployment) ─────────────
# Only kicks in if a "static" folder is present next to this file - the
# combined Dockerfile copies the Vite build there. When running the
# backend standalone for local dev (uvicorn --reload, no static folder),
# this block does nothing and the frontend is served by `npm run dev`
# instead, as documented in backend/README.md.

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(_STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(_STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Never swallow unmatched /api/* calls into the SPA fallback -
        # let them 404 properly instead of returning index.html.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(_STATIC_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_STATIC_DIR, "index.html"))
