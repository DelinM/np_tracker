"""Senate eFD periodic transaction reports.

The public search sits behind a browser check. When that blocks a plain HTTP
client, filings already saved in data/cache/senate/reports.json are used.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "data" / "cache" / "senate" / "reports.json"
SENATE_ROOT = "https://efdsearch.senate.gov"
SEARCH_HOME = f"{SENATE_ROOT}/search/home/"
SEARCH_PAGE = f"{SENATE_ROOT}/search/"
REPORTS_URL = f"{SENATE_ROOT}/search/report/data/"

OWNERS = {
    "self": "self",
    "spouse": "spouse",
    "joint": "joint",
    "child": "dependent",
}
SYMBOL_RE = re.compile(r"^[A-Z]{1,5}$")
OPTION_RE = re.compile(r"^([A-Z]{1,5})\s+(CALL|PUT)$", re.I)


def _client():
    try:
        from curl_cffi import requests as cffi_requests

        return cffi_requests.Session(impersonate="chrome")
    except Exception:
        import requests

        session = requests.Session()
        session.headers["User-Agent"] = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        return session


def load_cache() -> dict:
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text())


def save_cache(payload: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload) + "\n")


def _csrf(html: str) -> str | None:
    match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
    return match.group(1) if match else None


def fetch_live(member: dict) -> list[dict] | None:
    client = _client()
    try:
        home = client.get(SEARCH_HOME, timeout=40)
    except Exception as exc:
        print(f"[senate] {member['slug']}: {exc}")
        return None
    if home.status_code != 200:
        print(f"[senate] {member['slug']}: search home returned {home.status_code}")
        return None
    token = _csrf(home.text)
    if not token:
        print(f"[senate] {member['slug']}: no agreement token")
        return None
    agreed = client.post(
        SEARCH_HOME,
        data={"prohibition_agreement": "1", "csrfmiddlewaretoken": token},
        headers={"Referer": SEARCH_HOME},
        timeout=40,
    )
    token = _csrf(agreed.text) or token
    response = client.post(
        REPORTS_URL,
        data={
            "start": "0",
            "length": "100",
            "report_types": "[11]",
            "filer_types": "[1]",
            "submitted_start_date": "01/01/2012 00:00:00",
            "submitted_end_date": "",
            "candidate_state": "",
            "senator_state": "",
            "office_id": "",
            "first_name": member["first"],
            "last_name": member["last"],
            "csrfmiddlewaretoken": token,
        },
        headers={"Referer": SEARCH_PAGE, "X-CSRFToken": token},
        timeout=60,
    )
    if response.status_code != 200:
        print(f"[senate] {member['slug']}: report search returned {response.status_code}")
        return None
    try:
        payload = response.json()
    except ValueError as exc:
        print(f"[senate] {member['slug']}: report search was not JSON ({exc})")
        return None
    reports = []
    for row in payload.get("data") or []:
        link = re.search(r'href="([^"]+)"', row[3] or "")
        href = link.group(1) if link else ""
        if not href or "/view/ptr/" not in href:
            reports.append({"first": row[0], "last": row[1], "filed": row[4], "href": href, "rows": []})
            continue
        page = client.get(SENATE_ROOT + href, timeout=40)
        reports.append(
            {
                "first": row[0],
                "last": row[1],
                "filed": row[4],
                "href": href,
                "rows": _rows_from_html(page.text),
            }
        )
    print(f"[senate] {member['slug']}: {len(reports)} live PTR filings")
    return reports


def _rows_from_html(html: str) -> list[list[str]]:
    body = re.search(r"<tbody>(.*?)</tbody>", html, re.S | re.I)
    if not body:
        return []
    parsed = []
    for raw in re.findall(r"<tr>(.*?)</tr>", body.group(1), re.S | re.I):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", raw, re.S | re.I)
        cleaned = []
        for cell in cells:
            text = re.sub(r"<[^>]+>", " ", cell)
            text = re.sub(r"\s+", " ", text).strip()
            cleaned.append(text)
        if len(cleaned) >= 8:
            parsed.append(cleaned)
    return parsed


def reports_for(member: dict) -> list[dict]:
    live = fetch_live(member)
    cache = load_cache()
    key = member["last"]
    if live is not None:
        cache[key] = live
        save_cache(cache)
        return live
    cached = cache.get(key) or cache.get(key.upper()) or []
    if cached:
        print(f"[senate] {member['slug']}: using {len(cached)} cached filings")
    else:
        print(f"[senate] {member['slug']}: no filings available")
    return cached


def _ticker(cell: str, name: str, asset_type: str) -> tuple[str | None, str | None]:
    symbol = (cell or "").strip().upper()
    if symbol and symbol != "--":
        return symbol.replace("/", "-"), None
    if asset_type.lower() != "stock":
        return None, None
    option = OPTION_RE.match(name.strip())
    if option:
        return option.group(1).upper(), option.group(2).lower()
    if SYMBOL_RE.match(name.strip()):
        return name.strip().upper(), None
    return None, None


def senate_ticker(cell: str, name: str, asset_type: str) -> tuple[str | None, str | None]:
    return _ticker(cell, name, asset_type)
