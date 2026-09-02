"""
Thin async wrapper around the Google Sheets REST API. Ports the logic
that used to live in server.ts's fetch() calls, with fixes baked in:

  1. Every value we WRITE to a sheet goes through sanitize_cell() to
     block formula/CSV injection (a value like "=HYPERLINK(...)" typed
     into a name field could otherwise execute when someone opens the
     sheet in Excel/Sheets).
  2. Upstream error bodies are never forwarded verbatim to the browser -
     see main.py's exception handling. This module raises SheetsError
     with the detail; the API layer decides what (if anything) to expose.
  3. A single shared, connection-pooled HTTP client is reused for every
     call instead of opening a fresh connection (TCP + TLS handshake)
     per request - this alone removes a large chunk of latency, since
     the original code opened a brand new httpx.AsyncClient() for
     every single Sheets API call.
  4. Sheet-structure verification (ensure_sheets_exist) only runs once
     per server process instead of on every request.
"""
from __future__ import annotations

from typing import Any

import httpx

from config import get_settings
from security import sanitize_cell

settings = get_settings()

SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# Verifying all 4 sheets exist + have correct headers costs 1 metadata
# fetch + up to 4 more read/write round-trips to Google's API. Doing
# that on EVERY request (as the original code did) made every click in
# the app noticeably slower. Since sheet structure doesn't change during
# normal operation, we only need to confirm it once per server process.
_sheets_verified = False

# One shared, connection-pooled client for the whole process instead of
# opening a fresh TCP+TLS connection per call. Created lazily on first
# use and reused for the lifetime of the server.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _client


class SheetsError(RuntimeError):
    pass


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _get(url: str, token: str) -> httpx.Response:
    return await _get_client().get(url, headers=_headers(token))


async def _post(url: str, token: str, body: dict) -> httpx.Response:
    return await _get_client().post(url, headers={**_headers(token), "Content-Type": "application/json"}, json=body)


async def _put(url: str, token: str, body: dict) -> httpx.Response:
    return await _get_client().put(url, headers={**_headers(token), "Content-Type": "application/json"}, json=body)


RECORDS_HEADERS = [
    "NUMBER", "NAME", "AMOUNT", "ITEM NAME", "NO OF ITEMS", "NET WEIGHT",
    "PHONE NUMBER", "PLEDGE DATE", "RELEASE DATE", "LOCKER",
]
SUBMISSIONS_HEADERS = [
    "DATE", "SUBMITTED BY", "NAME", "PHONE", "ITEM", "AMOUNT", "WEIGHT",
    "STATUS", "NO OF ITEMS", "PLEDGE DATE", "LOCKER",
]
USERS_HEADERS = ["USERNAME", "PASSWORD", "ROLE"]
DELETED_HEADERS = RECORDS_HEADERS + ["DELETED AT", "DELETED BY"]


async def ensure_sheets_exist(token: str) -> None:
    global _sheets_verified
    if _sheets_verified:
        return

    sid = settings.SPREADSHEET_ID
    meta_res = await _get(f"{SHEETS_API}/{sid}", token)
    if meta_res.status_code >= 400:
        raise SheetsError(f"Google Sheets connection error: {meta_res.text}")
    metadata = meta_res.json()
    existing_titles = {s["properties"]["title"] for s in metadata.get("sheets", [])}

    wanted = ["Records", "Submissions", "Users", "deleted sheets"]
    missing = [title for title in wanted if title not in existing_titles]
    if missing:
        requests = [{"addSheet": {"properties": {"title": title}}} for title in missing]
        update_res = await _post(f"{SHEETS_API}/{sid}:batchUpdate", token, {"requests": requests})
        if update_res.status_code >= 400:
            raise SheetsError(f"Failed to create sheets: {update_res.text}")

    await ensure_headers(token, "Records", RECORDS_HEADERS)
    await ensure_headers(token, "Submissions", SUBMISSIONS_HEADERS)
    await ensure_headers(token, "Users", USERS_HEADERS)
    await ensure_headers(token, "deleted sheets", DELETED_HEADERS)

    _sheets_verified = True


async def ensure_users_exist(token: str) -> None:
    if not settings.SEED_DEFAULT_USERS:
        return
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Users!A1:C10"
    res = await _get(url, token)
    if res.status_code >= 400:
        return
    rows = res.json().get("values", [])
    if len(rows) >= 2:
        return  # already seeded

    from security import generate_strong_password, hash_password

    admin_pw = generate_strong_password()
    values = [
        USERS_HEADERS,
        ["admin", hash_password(admin_pw), "admin"],
    ]
    put_url = f"{SHEETS_API}/{sid}/values/Users!A1?valueInputOption=USER_ENTERED"
    await _put(put_url, token, {"values": values})
    print(
        "\n[SECURITY] Seeded a first-run admin account.\n"
        f"           username: admin\n"
        f"           password: {admin_pw}\n"
        "           Log in once and rotate this immediately.\n"
    )


async def write_headers(token: str, sheet_title: str, headers: list[str]) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/{sheet_title}!A1:1?valueInputOption=USER_ENTERED"
    await _put(url, token, {"values": [headers]})


async def ensure_headers(token: str, sheet_title: str, headers: list[str]) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/{sheet_title}!A1:Z1"
    res = await _get(url, token)
    if res.status_code < 400:
        data = res.json()
        values = data.get("values")
        if not values or not values[0]:
            await write_headers(token, sheet_title, headers)
    else:
        await write_headers(token, sheet_title, headers)


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


async def read_records(token: str) -> list[dict]:
    await ensure_sheets_exist(token)
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Records!A:J"
    res = await _get(url, token)
    if res.status_code >= 400:
        raise SheetsError(f"Failed to fetch records: {res.text}")
    rows = res.json().get("values", [])
    if len(rows) < 2:
        return []

    headers = [h.strip().upper() for h in rows[0]]
    records = []
    for i, row in enumerate(rows[1:], start=1):
        if not row or all((v is None or v == "") for v in row):
            continue
        r = {headers[idx]: (row[idx] if idx < len(row) else "") for idx in range(len(headers))}
        records.append({
            "rowIndex": i + 1,
            "number": _to_int(r.get("NUMBER")),
            "name": str(r.get("NAME", "")),
            "amount": _to_float(r.get("AMOUNT")),
            "item_name": str(r.get("ITEM NAME", "")),
            "no_of_items": _to_int(r.get("NO OF ITEMS")),
            "net_weight": _to_float(r.get("NET WEIGHT")),
            "phone": str(r.get("PHONE NUMBER", "")),
            "pledge_date": str(r.get("PLEDGE DATE", "")),
            "release_date": str(r.get("RELEASE DATE", "")),
            "locker": str(r.get("LOCKER", "")),
        })
    return records


async def write_records(token: str, records: list[dict]) -> None:
    await ensure_sheets_exist(token)
    sid = settings.SPREADSHEET_ID
    await _get_client().post(
        f"{SHEETS_API}/{sid}/values/Records!A2:J:clear",
        headers=_headers(token),
    )
    if not records:
        return
    values = [
        [
            sanitize_cell(r["number"]),
            sanitize_cell(r["name"]),
            sanitize_cell(r["amount"]),
            sanitize_cell(r["item_name"]),
            sanitize_cell(r["no_of_items"]),
            sanitize_cell(r["net_weight"]),
            sanitize_cell(r["phone"]),
            sanitize_cell(r["pledge_date"]),
            sanitize_cell(r.get("release_date", "")),
            sanitize_cell(r.get("locker", "")),
        ]
        for r in records
    ]
    url = f"{SHEETS_API}/{sid}/values/Records!A2?valueInputOption=USER_ENTERED"
    res = await _put(url, token, {"values": values})
    if res.status_code >= 400:
        raise SheetsError(f"Failed to save records: {res.text}")


async def read_submissions(token: str) -> list[dict]:
    await ensure_sheets_exist(token)
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Submissions!A:K"
    res = await _get(url, token)
    if res.status_code >= 400:
        raise SheetsError(f"Failed to fetch submissions: {res.text}")
    rows = res.json().get("values", [])
    if len(rows) < 2:
        return []

    headers = [h.strip().upper() for h in rows[0]]
    submissions = []
    for i, row in enumerate(rows[1:], start=1):
        if not row or all((v is None or v == "") for v in row):
            continue
        r = {headers[idx]: (row[idx] if idx < len(row) else "") for idx in range(len(headers))}
        submissions.append({
            "id": i,
            "rowIndex": i + 1,
            "submitted_by": str(r.get("SUBMITTED BY", "")),
            "submitted_at": str(r.get("DATE", "")),
            "status": str(r.get("STATUS", "pending")).lower(),
            "record": {
                "name": str(r.get("NAME", "")),
                "phone": str(r.get("PHONE", "")),
                "item_name": str(r.get("ITEM", "")),
                "amount": _to_float(r.get("AMOUNT")),
                "net_weight": _to_float(r.get("WEIGHT")),
                "no_of_items": _to_int(r.get("NO OF ITEMS"), 1),
                "pledge_date": str(r.get("PLEDGE DATE") or r.get("DATE") or ""),
                "locker": str(r.get("LOCKER", "")),
            },
        })
    return submissions


async def append_submission_row(token: str, row: list) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Submissions!A2:append?valueInputOption=USER_ENTERED"
    safe_row = [sanitize_cell(v) for v in row]
    res = await _post(url, token, {"values": [safe_row]})
    if res.status_code >= 400:
        raise SheetsError(f"Failed to save to Google Sheets: {res.text}")


async def append_deleted_row(token: str, row: list) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/deleted sheets!A2:append?valueInputOption=USER_ENTERED"
    safe_row = [sanitize_cell(v) for v in row]
    await _post(url, token, {"values": [safe_row]})


async def update_submission_status(token: str, row_index: int, status_value: str) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Submissions!H{row_index}?valueInputOption=USER_ENTERED"
    res = await _put(url, token, {"values": [[status_value]]})
    if res.status_code >= 400:
        raise SheetsError(f"Failed to update status: {res.text}")


async def fetch_users_sheet(token: str) -> list[list[str]]:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Users!A:C"
    res = await _get(url, token)
    if res.status_code >= 400:
        raise SheetsError(f"Failed to fetch user accounts: {res.text}")
    return res.json().get("values", [])


async def close_client() -> None:
    """Called on app shutdown to release the pooled connections cleanly."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
