"""
Thin async wrapper around the Google Sheets REST API. Ports the logic
that used to live in server.ts's fetch() calls, with two security fixes
baked in:

  1. Every value we WRITE to a sheet goes through sanitize_cell() to
     block formula/CSV injection (a value like "=HYPERLINK(...)" typed
     into a name field could otherwise execute when someone opens the
     sheet in Excel/Sheets).
  2. Upstream error bodies are never forwarded verbatim to the browser -
     see main.py's exception handling. This module raises SheetsError
     with the detail; the API layer decides what (if anything) to expose.
"""
from __future__ import annotations

from typing import Any

import httpx

from config import get_settings
from security import sanitize_cell

settings = get_settings()

SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)


class SheetsError(RuntimeError):
    pass


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _get(client: httpx.AsyncClient, url: str, token: str) -> httpx.Response:
    return await client.get(url, headers=_headers(token), timeout=TIMEOUT)


async def _post(client: httpx.AsyncClient, url: str, token: str, body: dict) -> httpx.Response:
    return await client.post(url, headers={**_headers(token), "Content-Type": "application/json"}, json=body, timeout=TIMEOUT)


async def _put(client: httpx.AsyncClient, url: str, token: str, body: dict) -> httpx.Response:
    return await client.put(url, headers={**_headers(token), "Content-Type": "application/json"}, json=body, timeout=TIMEOUT)


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
    sid = settings.SPREADSHEET_ID
    async with httpx.AsyncClient() as client:
        meta_res = await _get(client, f"{SHEETS_API}/{sid}", token)
        if meta_res.status_code >= 400:
            raise SheetsError(f"Google Sheets connection error: {meta_res.text}")
        metadata = meta_res.json()
        existing_titles = {s["properties"]["title"] for s in metadata.get("sheets", [])}

        wanted = ["Records", "Submissions", "Users", "deleted sheets"]
        missing = [title for title in wanted if title not in existing_titles]
        if missing:
            requests = [{"addSheet": {"properties": {"title": title}}} for title in missing]
            update_res = await _post(client, f"{SHEETS_API}/{sid}:batchUpdate", token, {"requests": requests})
            if update_res.status_code >= 400:
                raise SheetsError(f"Failed to create sheets: {update_res.text}")

    await ensure_headers(token, "Records", RECORDS_HEADERS)
    await ensure_headers(token, "Submissions", SUBMISSIONS_HEADERS)
    await ensure_headers(token, "Users", USERS_HEADERS)
    await ensure_headers(token, "deleted sheets", DELETED_HEADERS)


async def ensure_users_exist(token: str) -> None:
    if not settings.SEED_DEFAULT_USERS:
        return
    sid = settings.SPREADSHEET_ID
    async with httpx.AsyncClient() as client:
        url = f"{SHEETS_API}/{sid}/values/Users!A1:C10"
        res = await _get(client, url, token)
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
        await _put(client, put_url, token, {"values": values})
        print(
            "\n[SECURITY] Seeded a first-run admin account.\n"
            f"           username: admin\n"
            f"           password: {admin_pw}\n"
            "           Log in once and rotate this immediately.\n"
        )


async def write_headers(token: str, sheet_title: str, headers: list[str]) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/{sheet_title}!A1:1?valueInputOption=USER_ENTERED"
    async with httpx.AsyncClient() as client:
        await _put(client, url, token, {"values": [headers]})


async def ensure_headers(token: str, sheet_title: str, headers: list[str]) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/{sheet_title}!A1:Z1"
    async with httpx.AsyncClient() as client:
        res = await _get(client, url, token)
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
    async with httpx.AsyncClient() as client:
        res = await _get(client, url, token)
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
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{SHEETS_API}/{sid}/values/Records!A2:J:clear",
            headers=_headers(token),
            timeout=TIMEOUT,
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
        res = await _put(client, url, token, {"values": values})
        if res.status_code >= 400:
            raise SheetsError(f"Failed to save records: {res.text}")


async def read_submissions(token: str) -> list[dict]:
    await ensure_sheets_exist(token)
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Submissions!A:K"
    async with httpx.AsyncClient() as client:
        res = await _get(client, url, token)
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
    async with httpx.AsyncClient() as client:
        res = await _post(client, url, token, {"values": [safe_row]})
    if res.status_code >= 400:
        raise SheetsError(f"Failed to save to Google Sheets: {res.text}")


async def append_deleted_row(token: str, row: list) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/deleted sheets!A2:append?valueInputOption=USER_ENTERED"
    safe_row = [sanitize_cell(v) for v in row]
    async with httpx.AsyncClient() as client:
        await _post(client, url, token, {"values": [safe_row]})


async def update_submission_status(token: str, row_index: int, status_value: str) -> None:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Submissions!H{row_index}?valueInputOption=USER_ENTERED"
    async with httpx.AsyncClient() as client:
        res = await _put(client, url, token, {"values": [[status_value]]})
    if res.status_code >= 400:
        raise SheetsError(f"Failed to update status: {res.text}")


async def fetch_users_sheet(token: str) -> list[list[str]]:
    sid = settings.SPREADSHEET_ID
    url = f"{SHEETS_API}/{sid}/values/Users!A:C"
    async with httpx.AsyncClient() as client:
        res = await _get(client, url, token)
    if res.status_code >= 400:
        raise SheetsError(f"Failed to fetch user accounts: {res.text}")
    return res.json().get("values", [])
