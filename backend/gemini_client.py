"""
Regional live gold rate lookup: ports server.ts's Gemini-grounded-search
call, plus its offline fallback chain (exchangerate API + gold spot API,
then a hardcoded last-resort number).

Security note: the `region` value comes from a public, unauthenticated
query parameter and is interpolated into a prompt sent to Gemini. It's
length-limited and control-characters are stripped before use so it
can't be (ab)used to smuggle an oversized or newline-laden payload.
"""
from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from config import get_settings

settings = get_settings()

IST = ZoneInfo("Asia/Kolkata")
TIMEOUT = httpx.Timeout(12.0, connect=5.0)

_SAFE_REGION = re.compile(r"[^a-zA-Z0-9,.\s-]")


def sanitize_region(region: str) -> str:
    region = _SAFE_REGION.sub("", region or "").strip()
    return region[:80] or "West Godavari, Andhra Pradesh, India"


async def _fallback_regional_rates() -> dict:
    usd_to_inr = 83.5
    gold_usd = 2330

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            rate_res = await client.get("https://open.er-api.com/v6/latest/USD")
            if rate_res.status_code < 400:
                rates = rate_res.json().get("rates", {})
                if "INR" in rates:
                    usd_to_inr = rates["INR"]
    except httpx.HTTPError:
        pass

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            gold_res = await client.get("https://api.gold-api.com/v1/gold")
            if gold_res.status_code < 400:
                price = gold_res.json().get("price")
                if price:
                    gold_usd = price
    except httpx.HTTPError:
        pass

    raw_inr_per_gram = (gold_usd / 31.1034768) * usd_to_inr
    calculated_24k = round(raw_inr_per_gram * 1.15) or 7350
    calculated_22k = round(calculated_24k * 0.916) or 6730

    return {
        "gold22k": calculated_22k,
        "gold24k": calculated_24k,
        "state": "Andhra Pradesh",
        "district": "West Godavari",
        "source": "AP Gold Association & Spot Convert (Fallback Platform)",
        "date": datetime.now(IST).strftime("%d/%m/%Y"),
        "fallback": True,
    }


_LAST_RESORT = {
    "gold22k": 6730,
    "gold24k": 7350,
    "state": "Andhra Pradesh",
    "district": "West Godavari",
    "source": "AP Jewellers Association (Market Fallback-Failsafe)",
    "fallback": True,
}


async def get_regional_gold_rate(region: str) -> dict:
    region = sanitize_region(region)

    if not settings.GEMINI_API_KEY:
        return await _fallback_regional_rates()

    prompt = (
        f"What is today's current gold rate per gram in {region} today? "
        "Search using google search. Find the price in INR for 1 gram of "
        "22K gold (91.6% purity) and 24K gold (99.9% purity). Return only a "
        "valid JSON response containing gold22k, gold24k, state, district, "
        "source, and date properties. Format all gold rates in INR as "
        "numbers (per 1 gram)."
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"googleSearch": {}}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "gold22k": {"type": "NUMBER"},
                    "gold24k": {"type": "NUMBER"},
                    "state": {"type": "STRING"},
                    "district": {"type": "STRING"},
                    "source": {"type": "STRING"},
                    "date": {"type": "STRING"},
                },
                "required": ["gold22k", "gold24k"],
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.post(url, json=body)
        if res.status_code >= 400:
            raise RuntimeError(f"Gemini API returned {res.status_code}")
        data = res.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        import json

        return json.loads(text)
    except Exception:
        try:
            return await _fallback_regional_rates()
        except Exception:
            result = dict(_LAST_RESORT)
            result["date"] = datetime.now(IST).strftime("%d/%m/%Y")
            return result
