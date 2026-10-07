#!/usr/bin/env python3
"""Pull Nancy Pelosi's House Clerk PTRs and rebuild a priced portfolio.

Source of filings:
  https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip
  https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{docId}.pdf

Share counts come from the filing description when it states them. Otherwise
the script estimates shares from the midpoint of the disclosed dollar range
and the closing price on the trade date. That estimate is labeled as such.
"""

from __future__ import annotations

import argparse
import bisect
import json
import re
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo

import pdfplumber
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / "cache"
PDF_CACHE = CACHE / "pdfs"
PRICE_CACHE = CACHE / "prices"
TRADES_PATH = DATA / "trades.json"
SNAPSHOT_PATH = DATA / "snapshot.json"

PARSER_VERSION = 3
MEMBER_LAST = "pelosi"
MEMBER_FIRST = "nancy"
FIRST_YEAR = 2012
CLERK_INDEX = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
CLERK_PDF = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf"
NY = ZoneInfo("America/New_York")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

# Fallbacks when the printed ticker no longer resolves.
TICKER_ALIASES = {
    "FB": "META",
    "SQ": "XYZ",
}

NOT_TICKERS = {
    "INC", "LLC", "LP", "CO", "THE", "ET", "AL", "PLC", "SA", "AG", "NV",
    "LTD", "CORP", "NEW", "CLASS", "FUND",
}

TXN_RE = re.compile(
    r"^(?:(?P<owner>SP|JT|DC)\s+)?"
    r"(?P<asset>.+?)\s+"
    r"(?P<type>P|S(?:\s*\((?:partial|full)\))?|E|PURCHASE|SALE(?:\s*\((?:partial|full)\))?|EXCHANGE)\s+"
    r"(?P<tdate>\d{1,2}/\d{1,2}/\d{4})\s+"
    r"(?P<ndate>\d{1,2}/\d{1,2}/\d{4})\s+"
    r"(?P<amount>.+)$",
    re.IGNORECASE,
)
DESC_RE = re.compile(r"^(?:DESCRIPTION|D)\s*:\s*(.*)$", re.IGNORECASE)
STATUS_RE = re.compile(r"^(?:FILING\s+STATUS|F\s*S)\s*:", re.IGNORECASE)
EXERCISE_RE = re.compile(
    r"exercised\s+([\d,]+)\s+(call|put)\s+options"
    r".{0,160}?\(([\d,]+)\s+shares\)"
    r".{0,120}?strike price of \$?([\d,]+(?:\.\d+)?)",
    re.IGNORECASE | re.DOTALL,
)
OPTION_RE = re.compile(
    r"(purchase|purchased|sale|sold)(?:\s+of)?\s+([\d,]+)\s+(call|put)\s+options?"
    r"(?:.{0,160}?strike price of \$?([\d,]+(?:\.\d+)?))?",
    re.IGNORECASE | re.DOTALL,
)
SHARES_RE = re.compile(
    r"(purchased|sold|contribution of|sale of|purchase of)\s+([\d,]+)\s+(?:shares|units)\b",
    re.IGNORECASE,
)
LEADING_SHARES_RE = re.compile(r"([\d,]+)\s+shares", re.IGNORECASE)
EXPIRY_RE = re.compile(
    r"(?:expiration date of|expiring)\s+(\d{1,2}/\d{1,2}/\d{2,4})",
    re.IGNORECASE,
)
TICKER_RE = re.compile(r"\(([A-Za-z][A-Za-z0-9./\-]{0,8})\)")
CODE_RE = re.compile(r"\[([A-Za-z]{2,4})\]")
MONEY_RE = re.compile(r"[\d,]+(?:\.\d+)?")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def to_iso(value: str) -> str:
    value = value.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return value


def parse_number(value: str) -> float:
    return float(value.replace(",", "").replace("$", ""))


def normalize_line(line: str) -> str:
    line = line.replace("\x00", "").replace("\u00a0", " ")
    line = re.sub(r"\b(?:gfedcb|gfedc|nmlkji|nmlkj)\b", "", line, flags=re.I)
    line = re.sub(r"[ \t]+", " ", line).strip()
    return line


def parse_amount(text: str) -> tuple[float | None, float | None, str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    cleaned = re.sub(r"\s*[–—-]\s*", " - ", cleaned)
    label = cleaned
    if re.search(r"\bover\b", cleaned, re.I):
        nums = MONEY_RE.findall(cleaned)
        if not nums:
            return None, None, label
        value = parse_number(nums[0])
        return value, None, f"Over ${int(value):,}"
    nums = [parse_number(n) for n in MONEY_RE.findall(cleaned)]
    nums = [n for n in nums if n >= 1000]
    if len(nums) >= 2:
        lo, hi = nums[0], nums[1]
        return lo, hi, f"${lo:,.0f} – ${hi:,.0f}"
    if len(nums) == 1:
        return nums[0], nums[0], f"${nums[0]:,.0f}"
    return None, None, "—"


def extract_ticker(asset: str) -> tuple[str | None, str | None, str]:
    codes = [c.upper() for c in CODE_RE.findall(asset)]
    asset_type = codes[-1] if codes else None
    tickers = []
    for raw in TICKER_RE.findall(asset):
        ticker = raw.upper().replace("/", "-")
        if ticker in NOT_TICKERS or len(ticker) > 6:
            continue
        tickers.append(ticker)
    ticker = tickers[-1] if tickers else None
    name = CODE_RE.sub("", asset)
    if ticker:
        name = re.sub(rf"\(\s*{re.escape(ticker)}\s*\)", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip(" -")
    return ticker, asset_type, name


def classify(description: str, tx_type: str, asset_type: str | None) -> dict:
    desc = re.sub(r"\s+", " ", description).strip()
    expiry_match = EXPIRY_RE.search(desc)
    expiry = to_iso(expiry_match.group(1)) if expiry_match else None
    upper_type = tx_type.upper()
    extent = None
    if "FULL" in upper_type:
        extent = "full"
    elif "PARTIAL" in upper_type:
        extent = "partial"

    exercise = EXERCISE_RE.search(desc)
    if exercise:
        return {
            "kind": "exercise",
            "shares": parse_number(exercise.group(3)),
            "contracts": parse_number(exercise.group(1)),
            "optionRight": exercise.group(2).lower(),
            "strike": parse_number(exercise.group(4)),
            "expiry": expiry,
            "extent": extent,
        }

    option = OPTION_RE.search(desc)
    optionish = option or asset_type == "OP" or re.search(r"\b(call|put)\s+options?\b", desc, re.I)
    if optionish and not SHARES_RE.search(desc):
        raw_side = option.group(1).lower() if option else ("sold" if upper_type.startswith("S") else "purchased")
        side = "sold" if raw_side.startswith("s") else "purchased"
        strike = option.group(4) if option and option.group(4) else None
        return {
            "kind": "option",
            "shares": None,
            "contracts": parse_number(option.group(2)) if option else None,
            "optionRight": option.group(3).lower() if option else None,
            "strike": parse_number(strike) if strike else None,
            "expiry": expiry,
            "optionSide": side,
            "extent": extent,
        }

    if re.search(r"spin-?off", desc, re.I):
        shares = LEADING_SHARES_RE.search(desc)
        return {
            "kind": "receive",
            "shares": parse_number(shares.group(1)) if shares else None,
            "contracts": None,
            "optionRight": None,
            "strike": None,
            "expiry": None,
            "extent": extent,
            "receiveReason": "spinoff",
        }

    shares = SHARES_RE.search(desc)
    if shares:
        verb = shares.group(1).lower()
        count = parse_number(shares.group(2))
        if verb.startswith("contribution"):
            kind = "transfer"
        elif verb.startswith("sold") or verb.startswith("sale"):
            kind = "sell"
        else:
            kind = "buy"
        return {
            "kind": kind,
            "shares": count,
            "contracts": None,
            "optionRight": None,
            "strike": None,
            "expiry": None,
            "extent": extent,
        }

    if upper_type.startswith("S"):
        kind = "sell"
    elif upper_type.startswith("E"):
        kind = "receive"
    elif upper_type.startswith("P"):
        kind = "buy"
    else:
        kind = "other"
    if asset_type == "OP":
        kind = "option"
    return {
        "kind": kind,
        "shares": None,
        "contracts": None,
        "optionRight": None,
        "strike": None,
        "expiry": expiry,
        "extent": extent,
        "optionSide": "sold" if upper_type.startswith("S") else "purchased",
    }


def parse_ptr_text(text: str) -> list[dict]:
    trades: list[dict] = []
    current: dict | None = None
    mode = "seek"

    def flush() -> None:
        nonlocal current
        if current is not None:
            trades.append(current)
            current = None

    for raw_line in text.splitlines():
        line = normalize_line(raw_line)
        if not line:
            continue
        lower = line.lower()
        if lower.startswith("* for the complete list"):
            break
        if lower.startswith("i certify") or lower.startswith("digitally signed"):
            break
        if (
            lower.startswith("id owner")
            or lower.startswith("type date")
            or lower.startswith("filing id")
            or lower.startswith("clerk of the house")
            or lower.startswith("filer information")
            or lower.startswith("transactions")
            or lower.startswith("name:")
            or lower.startswith("status:")
            or lower.startswith("state/district")
            or "cap." in lower and "gain" in lower
            or lower in {"p t r", "ptr"}
        ):
            continue
        if STATUS_RE.match(line):
            mode = "meta"
            continue

        desc = DESC_RE.match(line)
        if desc and current is not None:
            extra = desc.group(1).strip()
            if extra:
                current["description"] = (current["description"] + " " + extra).strip()
            mode = "desc"
            continue

        match = TXN_RE.match(line)
        if match:
            flush()
            asset = match.group("asset")
            ticker, asset_type, name = extract_ticker(asset)
            amount_min, amount_max, amount_label = parse_amount(match.group("amount"))
            owner_raw = (match.group("owner") or "").upper()
            owner = {"SP": "spouse", "JT": "joint", "DC": "dependent"}.get(owner_raw, "self")
            current = {
                "owner": owner,
                "ticker": ticker,
                "assetType": asset_type,
                "name": name,
                "txType": match.group("type").upper(),
                "transactionDate": to_iso(match.group("tdate")),
                "notificationDate": to_iso(match.group("ndate")),
                "amountMin": amount_min,
                "amountMax": amount_max,
                "amountLabel": amount_label,
                "amountOpen": match.group("amount").rstrip().endswith("-"),
                "description": "",
            }
            mode = "asset"
            continue

        if current is None:
            continue

        if mode == "desc":
            current["description"] = (current["description"] + " " + line).strip()
            continue

        if current.get("amountOpen"):
            tail = re.match(r"^(.*?)(\$[\d,]+(?:\.\d+)?)\s*$", line)
            if tail:
                prefix = tail.group(1).strip()
                current["amountMin"], current["amountMax"], current["amountLabel"] = parse_amount(
                    f"{current['amountLabel']} {tail.group(2)}"
                )
                current["amountOpen"] = False
                if prefix:
                    ticker, asset_type, name = extract_ticker(f"{current['name']} {prefix}")
                    if ticker:
                        current["ticker"] = ticker
                    if asset_type:
                        current["assetType"] = asset_type
                    current["name"] = name or current["name"]
                continue

        if mode == "asset":
            ticker, asset_type, name = extract_ticker(f"{current['name']} {line}")
            if ticker:
                current["ticker"] = ticker
            if asset_type:
                current["assetType"] = asset_type
            if name:
                current["name"] = name

    flush()
    for trade in trades:
        trade.pop("amountOpen", None)
        info = classify(trade["description"], trade["txType"], trade.get("assetType"))
        trade.update(info)
    return trades


def extract_pdf_text(data: bytes) -> str:
    pages: list[str] = []
    with pdfplumber.open(BytesIO(data)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n".join(pages)


def session() -> requests.Session:
    http = requests.Session()
    http.headers.update({"User-Agent": UA})
    return http


def download(http: requests.Session, url: str) -> bytes | None:
    for attempt in range(4):
        try:
            response = http.get(url, timeout=60)
        except requests.RequestException as exc:
            print(f"  request failed ({exc}); retry {attempt + 1}")
            time.sleep(1.5 * (attempt + 1))
            continue
        if response.status_code == 404:
            return None
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(1.5 * (attempt + 1))
            continue
        response.raise_for_status()
        return response.content
    return None


def load_index(http: requests.Session, year: int) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    zip_path = CACHE / f"{year}FD.zip"
    if not zip_path.exists():
        payload = download(http, CLERK_INDEX.format(year=year))
        if payload is None:
            print(f"[index] {year}: not published")
            return []
        zip_path.write_bytes(payload)
        time.sleep(0.2)
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        xml_name = next((n for n in names if n.lower().endswith(".xml")), None)
        if xml_name:
            root = ET.fromstring(archive.read(xml_name))
            rows = []
            for member in root:
                rows.append({child.tag: (child.text or "").strip() for child in member})
        else:
            txt_name = next(n for n in names if n.lower().endswith(".txt"))
            rows = []
            lines = archive.read(txt_name).decode("utf-8", "replace").splitlines()
            header = lines[0].split("\t")
            for line in lines[1:]:
                parts = line.split("\t")
                if len(parts) < len(header):
                    continue
                rows.append(dict(zip(header, parts)))

    filings = []
    for row in rows:
        last = (row.get("Last") or "").strip().lower()
        first = (row.get("First") or "").strip().lower()
        kind = (row.get("FilingType") or "").strip().upper()
        if last != MEMBER_LAST or first != MEMBER_FIRST or kind != "P":
            continue
        doc_id = (row.get("DocID") or "").strip()
        filing_year = int((row.get("Year") or year))
        filings.append(
            {
                "docId": doc_id,
                "year": filing_year,
                "filingDate": to_iso(row.get("FilingDate") or ""),
                "stateDst": (row.get("StateDst") or "").strip(),
                "pdfUrl": CLERK_PDF.format(year=filing_year, doc_id=doc_id),
            }
        )
    print(f"[index] {year}: {len(filings)} Pelosi PTR filings")
    return filings


def parse_filing(http: requests.Session, filing: dict) -> tuple[list[dict], str]:
    PDF_CACHE.mkdir(parents=True, exist_ok=True)
    path = PDF_CACHE / f"{filing['docId']}.pdf"
    if not path.exists():
        payload = download(http, filing["pdfUrl"])
        if payload is None:
            return [], "missing"
        path.write_bytes(payload)
        time.sleep(0.25)
    text = extract_pdf_text(path.read_bytes())
    if not text.strip():
        return [], "scanned"
    trades = parse_ptr_text(text)
    if not trades:
        fail_dir = CACHE / "unparsed"
        fail_dir.mkdir(parents=True, exist_ok=True)
        (fail_dir / f"{filing['docId']}.txt").write_text(text)
        return [], "empty"
    for index, trade in enumerate(trades, start=1):
        trade["id"] = f"{filing['docId']}-{index}"
        trade["docId"] = filing["docId"]
        trade["pdfUrl"] = filing["pdfUrl"]
        trade["filingDate"] = filing["filingDate"]
        trade["year"] = filing["year"]
    return trades, "ok"


def dedupe_trades(trades: list[dict]) -> list[dict]:
    """House members sometimes restate the same trade on a later filing."""
    kept: dict[tuple, dict] = {}
    order: list[tuple] = []
    for trade in trades:
        shares = trade.get("shares")
        ticker = trade.get("ticker")
        if ticker and trade.get("kind") == "option" and trade.get("contracts"):
            key = (
                trade["transactionDate"],
                ticker,
                "option",
                round(float(trade["contracts"]), 2),
                trade.get("strike"),
                trade.get("optionSide"),
            )
        elif ticker and shares and trade.get("kind") in {"buy", "sell", "exercise", "transfer", "receive"}:
            key = (
                trade["transactionDate"],
                ticker,
                trade["kind"],
                round(float(shares), 2),
                trade.get("strike"),
            )
        else:
            key = ("id", trade.get("id"))
        if key in kept:
            def rank(item: dict) -> tuple:
                description = (item.get("description") or "").lower()
                return (1 if "shares" in description else 0, 0 if item.get("owner") == "self" else 1)
            if rank(trade) > rank(kept[key]):
                kept[key] = trade
            continue
        kept[key] = trade
        order.append(key)
    return [kept[key] for key in order]


def load_cached_trades() -> dict | None:
    if not TRADES_PATH.exists():
        return None
    data = json.loads(TRADES_PATH.read_text())
    if data.get("parserVersion") != PARSER_VERSION:
        return None
    return data


def collect_trades(http: requests.Session, reparse: bool) -> dict:
    years = range(FIRST_YEAR, datetime.now(NY).year + 1)
    filings: list[dict] = []
    for year in years:
        filings.extend(load_index(http, year))
    filings.sort(key=lambda item: (item["filingDate"], item["docId"]))

    cached = None if reparse else load_cached_trades()
    known = {trade["docId"]: [] for trade in (cached or {}).get("trades", [])}
    for trade in (cached or {}).get("trades", []):
        known.setdefault(trade["docId"], []).append(trade)
    filing_status = {item["docId"]: item for item in (cached or {}).get("filings", [])}

    trades: list[dict] = []
    stored_filings = []
    for filing in filings:
        status_row = {
            "docId": filing["docId"],
            "year": filing["year"],
            "filingDate": filing["filingDate"],
            "stateDst": filing["stateDst"],
            "pdfUrl": filing["pdfUrl"],
        }
        if filing["docId"] in known and filing_status.get(filing["docId"], {}).get("status") == "ok":
            parsed = known[filing["docId"]]
            status_row["status"] = "ok"
            status_row["tradeCount"] = len(parsed)
            print(f"[pdf] {filing['docId']} cached ({len(parsed)} trades)")
        else:
            parsed, status = parse_filing(http, filing)
            status_row["status"] = status
            status_row["tradeCount"] = len(parsed)
            print(f"[pdf] {filing['docId']} {filing['filingDate']}: {status}, {len(parsed)} trades")
        stored_filings.append(status_row)
        trades.extend(parsed)

    before = len(trades)
    trades = dedupe_trades(trades)
    if before != len(trades):
        print(f"[book] dropped {before - len(trades)} restated filings")

    document = {
        "parserVersion": PARSER_VERSION,
        "generatedAt": now_iso(),
        "filings": stored_filings,
        "trades": trades,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    TRADES_PATH.write_text(json.dumps(document, indent=2) + "\n")
    return document


@dataclass
class Lot:
    date: str
    shares: float
    price: float
    trade_id: str
    owner: str
    note: str

    @property
    def cost(self) -> float:
        return self.shares * self.price


@dataclass
class OptionLot:
    ticker: str
    right: str | None
    strike: float | None
    expiry: str | None
    contracts: float
    premium: float
    date: str
    owner: str
    name: str


@dataclass
class Books:
    lots: dict[str, list[Lot]] = field(default_factory=dict)
    options: list[OptionLot] = field(default_factory=list)
    realized: list[dict] = field(default_factory=list)
    realized_total: float = 0.0
    deployed: float = 0.0
    warnings: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        if message in self.warnings:
            return
        important = "exceeds tracked" in message
        routine = sum(1 for item in self.warnings if "exceeds tracked" not in item)
        if important or routine < 12:
            self.warnings.append(message)


NASDAQ_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
}
SPLIT_RE = re.compile(r"(\d{2}/\d{2}/\d{4})</TD>\s*<TD[^>]*>\s*(\d+)\s+for\s+(\d+)", re.I)


def nasdaq_symbol(ticker: str) -> str:
    return ticker.upper().replace("/", ".")


def parse_nasdaq_number(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.replace("$", "").replace(",", "").replace("+", "").strip()
    if cleaned.upper() in {"", "UNCH", "N/A", "--", "NA"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def fetch_splits(http: requests.Session, symbol: str) -> list[dict]:
    cache_path = CACHE / "splits" / f"{symbol.replace('/', '_')}.json"
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.exists():
        return json.loads(cache_path.read_text())
    slugs = [symbol.lower(), symbol.lower().replace(".", "-"), symbol.lower().replace(".", "")]
    splits: list[dict] = []
    found = False
    for slug in dict.fromkeys(slugs):
        try:
            response = http.get(
                f"https://www.splithistory.com/{slug}/",
                headers={"User-Agent": UA},
                timeout=30,
            )
        except requests.RequestException:
            continue
        if response.status_code != 200 or "split history" not in response.text.lower():
            continue
        found = True
        for month, numerator, denominator in SPLIT_RE.findall(response.text):
            left, right = float(numerator), float(denominator)
            if right == 0:
                continue
            splits.append({"date": to_iso(month), "ratio": left / right})
        break
    if found:
        cache_path.write_text(json.dumps(splits) + "\n")
    time.sleep(0.2)
    return splits


def fetch_chart(http: requests.Session, ticker: str, start: str) -> dict | None:
    PRICE_CACHE.mkdir(parents=True, exist_ok=True)
    symbol = nasdaq_symbol(ticker)
    cache_path = PRICE_CACHE / f"{symbol.replace('/', '_')}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        age = datetime.now(timezone.utc) - datetime.fromisoformat(cached["fetchedAt"])
        if age < timedelta(hours=18) and cached.get("bars"):
            return cached

    symbols = [symbol]
    alias = TICKER_ALIASES.get(ticker.upper())
    if alias and alias not in symbols:
        symbols.append(alias)

    for candidate in symbols:
        try:
            response = http.get(
                f"https://api.nasdaq.com/api/quote/{candidate}/historical",
                params={"assetclass": "stocks", "fromdate": "2014-01-01", "todate": datetime.now(NY).date().isoformat(), "limit": 5000},
                headers=NASDAQ_HEADERS,
                timeout=60,
            )
            payload = response.json()
        except (requests.RequestException, ValueError):
            continue
        rows = ((payload.get("data") or {}).get("tradesTable") or {}).get("rows") or []
        if not rows:
            continue
        bars = []
        for row in rows:
            close = parse_nasdaq_number(row.get("close"))
            if close is None:
                continue
            bars.append({"date": to_iso(row["date"]), "close": round(close, 4)})
        bars.sort(key=lambda item: item["date"])
        bars = [bar for bar in bars if bar["date"] >= "2012-01-01"]
        info = {}
        try:
            info_response = http.get(
                f"https://api.nasdaq.com/api/quote/{candidate}/info",
                params={"assetclass": "stocks"},
                headers=NASDAQ_HEADERS,
                timeout=30,
            )
            info = (info_response.json().get("data") or {})
        except (requests.RequestException, ValueError):
            info = {}
        primary = info.get("primaryData") or {}
        price = parse_nasdaq_number(primary.get("lastSalePrice")) or (bars[-1]["close"] if bars else None)
        change = parse_nasdaq_number(primary.get("netChange"))
        previous = round(price - change, 4) if price is not None and change is not None else (bars[-2]["close"] if len(bars) > 1 else None)
        document = {
            "ticker": ticker.upper(),
            "symbol": candidate,
            "name": re.sub(r"\s+Common Stock$", "", info.get("companyName") or "") or None,
            "fetchedAt": now_iso(),
            "price": round(price, 4) if price is not None else None,
            "previousClose": previous,
            "bars": bars,
            "splits": fetch_splits(http, candidate),
        }
        cache_path.write_text(json.dumps(document) + "\n")
        time.sleep(0.25)
        return document
    return None


def price_lookup(chart: dict | None):
    if not chart:
        return lambda _day: None
    bars = {bar["date"]: bar["close"] for bar in chart["bars"]}
    dates = sorted(bars)

    def on(day: str) -> float | None:
        if not dates:
            return None
        if day in bars:
            return bars[day]
        index = bisect.bisect_right(dates, day) - 1
        if index < 0:
            return None
        last = dates[index]
        gap = (datetime.fromisoformat(day) - datetime.fromisoformat(last)).days
        if gap > 10:
            return None
        return bars[last]

    return on


def midpoint(trade: dict) -> float | None:
    lo, hi = trade.get("amountMin"), trade.get("amountMax")
    if lo is None:
        return None
    if hi is None:
        return lo
    return (lo + hi) / 2.0


def execution_price(market: float | None, trade: dict, ratio: float, disclosed_shares: float | None) -> float | None:
    if market:
        return market
    notional = midpoint(trade)
    if disclosed_shares and ratio and notional:
        return (notional / disclosed_shares) / ratio
    return None


def split_ratio_after(chart: dict | None, day: str) -> float:
    """Nasdaq closes are split-adjusted. Filing share counts are not, so lots
    are converted into today's share units once, at booking.
    """
    if not chart:
        return 1.0
    ratio = 1.0
    for split in chart.get("splits") or []:
        if split["date"] > day and split["ratio"] > 0:
            ratio *= float(split["ratio"])
    return ratio


def consume_lots(books: Books, ticker: str, shares: float, price: float, trade: dict, reason: str) -> float:
    remaining = shares
    cost = 0.0
    sold = 0.0
    lots = books.lots.get(ticker, [])
    while remaining > 1e-6 and lots:
        lot = lots[0]
        take = min(lot.shares, remaining)
        cost += take * lot.price
        lot.shares -= take
        remaining -= take
        sold += take
        if lot.shares <= 1e-6:
            lots.pop(0)
    if remaining > 0.05:
        books.warn(
            f"{ticker} {trade['transactionDate']}: disclosed exit of {shares:,.0f} shares "
            f"exceeds tracked purchases by {remaining:,.0f}. Those shares were likely bought "
            f"before the filing window and are excluded from profit."
        )
    proceeds = sold * price
    pnl = proceeds - cost
    if sold > 0:
        books.realized_total += pnl
        books.realized.append(
            {
                "ticker": ticker,
                "name": trade["name"],
                "date": trade["transactionDate"],
                "shares": round(sold, 4),
                "proceeds": round(proceeds, 2),
                "cost": round(cost, 2),
                "pnl": round(pnl, 2),
                "reason": reason,
                "tradeId": trade["id"],
            }
        )
    return sold


def match_option_premium(books: Books, trade: dict) -> float:
    need = trade.get("contracts") or 0
    if need <= 0:
        return 0.0
    premium = 0.0
    kept: list[OptionLot] = []
    for lot in books.options:
        same = (
            lot.ticker == trade["ticker"]
            and (lot.right or "call") == (trade.get("optionRight") or "call")
            and lot.strike is not None
            and trade.get("strike") is not None
            and abs(lot.strike - trade["strike"]) < 0.02
            and need > 1e-6
        )
        if not same:
            kept.append(lot)
            continue
        take = min(lot.contracts, need)
        if lot.contracts > 0:
            premium += lot.premium * (take / lot.contracts)
        lot.contracts -= take
        lot.premium -= lot.premium * (take / (take + lot.contracts)) if (take + lot.contracts) else 0
        need -= take
        if lot.contracts > 1e-6:
            kept.append(lot)
    books.options = kept
    return premium


def add_lot(books: Books, ticker: str, shares: float, price: float, trade: dict, note: str) -> None:
    if shares <= 0 or price is None or price <= 0:
        books.warn(f"{ticker} {trade['transactionDate']}: could not price a {shares:g}-share lot.")
        return
    if shares > 2_000_000:
        books.warn(f"{ticker} {trade['transactionDate']}: ignored an implausible share count of {shares:,.0f}.")
        return
    books.lots.setdefault(ticker, []).append(
        Lot(trade["transactionDate"], shares, price, trade["id"], trade["owner"], note)
    )
    books.deployed += shares * price


def close_options(books: Books, trade: dict) -> None:
    need = trade.get("contracts") or 0
    if need <= 0:
        return
    kept: list[OptionLot] = []
    for lot in books.options:
        same = lot.ticker == trade.get("ticker") and (
            trade.get("strike") is None or lot.strike is None or abs(lot.strike - trade["strike"]) < 0.02
        )
        if same and need > 1e-6:
            take = min(lot.contracts, need)
            if lot.contracts:
                lot.premium *= (lot.contracts - take) / lot.contracts
            lot.contracts -= take
            need -= take
        if lot.contracts > 1e-6:
            kept.append(lot)
    books.options = kept


def book_trade(books: Books, trade: dict, quotes, charts: dict[str, dict]) -> None:
    kind = trade.get("kind")
    ticker = trade.get("ticker")
    if kind == "option":
        if not ticker:
            return
        contracts = trade.get("contracts") or 0
        premium = midpoint(trade) or 0
        side = trade.get("optionSide") or "purchased"
        if side.startswith("sold"):
            close_options(books, trade)
            return
        if contracts > 0:
            books.options.append(
                OptionLot(
                    ticker,
                    trade.get("optionRight"),
                    trade.get("strike"),
                    trade.get("expiry"),
                    contracts,
                    premium,
                    trade["transactionDate"],
                    trade["owner"],
                    trade["name"],
                )
            )
        return

    if not ticker or kind not in {"buy", "sell", "exercise", "transfer", "receive"}:
        return

    market = quotes(trade["transactionDate"])
    ratio = split_ratio_after(charts.get(ticker), trade["transactionDate"])
    if kind == "exercise":
        shares = trade.get("shares")
        strike = trade.get("strike")
        if not shares or not strike:
            return
        premium = match_option_premium(books, trade)
        shares_now = shares * ratio
        price = (strike * shares + premium) / shares_now
        note = f"Exercised {trade.get('optionRight') or 'call'}s at ${strike:,.2f}"
        if ratio != 1:
            note += f", split-adjusted x{ratio:g}"
        if premium:
            note += ", including estimated option premium"
        add_lot(books, ticker, shares_now, price, trade, note)
        trade["bookedShares"] = round(shares_now, 4)
        trade["bookedPrice"] = round(price, 4)
        return

    if kind == "receive":
        disclosed = trade.get("shares")
        estimated = disclosed is None
        fill = execution_price(market, trade, ratio, disclosed)
        if estimated and market and midpoint(trade):
            shares = midpoint(trade) / market
            fill = market
            trade["sharesEstimated"] = True
        elif disclosed is not None:
            shares = disclosed * ratio
        else:
            shares = None
        if not shares or not fill:
            books.warn(f"{ticker} {trade['transactionDate']}: spinoff or receipt could not be priced.")
            return
        note = "Received shares; cost set to that day's close" if market else "Received shares; cost estimated from the disclosed range"
        if not estimated and ratio != 1:
            note += f", split-adjusted x{ratio:g}"
        add_lot(books, ticker, shares, fill, trade, note)
        trade["bookedShares"] = round(shares, 4)
        trade["bookedPrice"] = round(fill, 4)
        return

    if kind in {"sell", "transfer"}:
        disclosed = trade.get("shares")
        if trade.get("extent") == "full":
            shares = sum(lot.shares for lot in books.lots.get(ticker, []))
            fill = market
        elif disclosed is None and market and midpoint(trade):
            shares = midpoint(trade) / market
            fill = market
            trade["sharesEstimated"] = True
        elif disclosed is not None:
            shares = disclosed * ratio
            fill = execution_price(market, trade, ratio, disclosed)
        else:
            shares = None
            fill = None
        if not shares or not fill:
            books.warn(f"{ticker} {trade['transactionDate']}: sale could not be sized.")
            return
        sold = consume_lots(books, ticker, shares, fill, trade, "transfer" if kind == "transfer" else "sale")
        trade["bookedShares"] = round(sold, 4)
        trade["bookedPrice"] = round(fill, 4)
        return

    disclosed = trade.get("shares")
    estimated = False
    if disclosed is None and market and midpoint(trade):
        shares = midpoint(trade) / market
        fill = market
        estimated = True
        trade["sharesEstimated"] = True
    elif disclosed is not None:
        shares = disclosed * ratio
        fill = execution_price(market, trade, ratio, disclosed)
    else:
        shares = None
        fill = None
    if not shares or not fill:
        books.warn(f"{ticker or trade['name']} {trade['transactionDate']}: purchase could not be sized.")
        return
    note = "Share count estimated from the disclosed dollar range" if estimated else "Disclosed share count"
    if not estimated and not market:
        note += "; cost estimated from the disclosed range"
    if not estimated and ratio != 1:
        note += f", split-adjusted x{ratio:g}"
    add_lot(books, ticker, shares, fill, trade, note)
    trade["bookedShares"] = round(shares, 4)
    trade["bookedPrice"] = round(fill, 4)


def build_snapshot(http: requests.Session, document: dict) -> dict:
    trades = document["trades"]
    filings = document["filings"]
    stock_tickers = sorted(
        {
            trade["ticker"]
            for trade in trades
            if trade.get("ticker") and trade.get("kind") in {"buy", "sell", "exercise", "transfer", "receive"}
        }
    )
    start = min((trade["transactionDate"] for trade in trades), default="2012-01-01")
    try:
        http.get("https://www.nasdaq.com/", headers={"User-Agent": UA}, timeout=30)
    except requests.RequestException:
        pass
    charts: dict[str, dict] = {}
    for ticker in stock_tickers:
        chart = fetch_chart(http, ticker, start)
        if chart:
            charts[ticker] = chart
            print(f"[price] {ticker}: {len(chart['bars'])} sessions, last {chart['price']}")
        else:
            print(f"[price] {ticker}: no data")

    order = {"option": 0, "exercise": 1, "buy": 2, "receive": 3, "sell": 4, "transfer": 5, "other": 6}
    scheduled = sorted(
        trades,
        key=lambda trade: (
            trade["transactionDate"],
            order.get(trade.get("kind"), 9),
            trade["filingDate"],
            trade["id"],
        ),
    )
    by_day: dict[str, list[dict]] = {}
    for trade in scheduled:
        by_day.setdefault(trade["transactionDate"], []).append(trade)

    calendar = sorted({bar["date"] for chart in charts.values() for bar in chart["bars"]})
    if calendar:
        calendar = [day for day in calendar if day >= start]
    books = Books()
    history = []
    lookups = {ticker: price_lookup(charts[ticker]) for ticker in charts}

    def quote_fn(ticker: str):
        return lookups.get(ticker, lambda _day: None)

    trade_days = set(by_day)
    marks = sorted(set(calendar) | trade_days)

    for day in marks:
        for trade in by_day.get(day, []):
            ticker = trade.get("ticker")
            book_trade(books, trade, quote_fn(ticker) if ticker else (lambda _d: None), charts)
        if day not in set(calendar):
            continue
        value = 0.0
        cost = 0.0
        for ticker, lots in books.lots.items():
            held = sum(lot.shares for lot in lots)
            if held <= 1e-4:
                continue
            price = lookups[ticker](day) if ticker in lookups else None
            if price is None:
                continue
            value += held * price
            cost += sum(lot.cost for lot in lots)
        history.append(
            {
                "date": day,
                "value": round(value, 2),
                "cost": round(cost, 2),
                "pnl": round(value - cost + books.realized_total, 2),
            }
        )

    holdings = []
    priced_value = 0.0
    priced_cost = 0.0
    day_change = 0.0
    for ticker, lots in books.lots.items():
        shares = sum(lot.shares for lot in lots)
        if shares <= 0.01:
            continue
        chart = charts.get(ticker)
        price = chart.get("price") if chart else None
        previous = chart.get("previousClose") if chart else None
        if price and previous and previous > 0 and abs(price - previous) / previous > 0.4:
            bars = chart["bars"]
            if len(bars) >= 2:
                price = bars[-1]["close"]
                previous = bars[-2]["close"]
        cost = sum(lot.cost for lot in lots)
        market = shares * price if price else None
        owners = sorted({lot.owner for lot in lots})
        filing_name = next(
            (trade["name"] for trade in reversed(trades) if trade.get("ticker") == ticker and trade.get("name")),
            ticker,
        )
        holding = {
            "ticker": ticker,
            "symbol": chart.get("symbol") if chart else ticker,
            "name": chart.get("name") if chart and chart.get("name") else filing_name,
            "shares": round(shares, 4),
            "avgCost": round(cost / shares, 4),
            "costBasis": round(cost, 2),
            "price": price,
            "prevClose": previous,
            "marketValue": round(market, 2) if market is not None else None,
            "unrealized": round(market - cost, 2) if market is not None else None,
            "unrealizedPct": ((market - cost) / cost) if market is not None and cost else None,
            "dayChange": round((price - previous) * shares, 2) if price and previous else None,
            "dayChangePct": ((price - previous) / previous) if price and previous else None,
            "owners": owners,
            "lots": [
                {
                    "date": lot.date,
                    "shares": round(lot.shares, 4),
                    "price": round(lot.price, 4),
                    "cost": round(lot.cost, 2),
                    "owner": lot.owner,
                    "note": lot.note,
                    "tradeId": lot.trade_id,
                }
                for lot in lots
                if lot.shares > 0.01
            ],
        }
        holdings.append(holding)
        if market is not None:
            priced_value += market
            priced_cost += cost
            if holding["dayChange"] is not None:
                day_change += holding["dayChange"]
        else:
            books.warn(f"{ticker} is still on the book but has no current price, so it is left out of the total.")

    holdings.sort(key=lambda item: item["marketValue"] or 0, reverse=True)
    for holding in holdings:
        if holding["marketValue"] is not None and priced_value:
            holding["weight"] = holding["marketValue"] / priced_value
        else:
            holding["weight"] = None

    names = {}
    for trade in trades:
        if trade.get("ticker") and trade.get("name"):
            names[trade["ticker"]] = trade["name"]
    for ticker, chart in charts.items():
        if chart.get("name"):
            names[ticker] = chart["name"]
    for event in books.realized:
        event["name"] = names.get(event["ticker"], event["name"])

    today = datetime.now(NY).date().isoformat()
    options = [
        {
            "ticker": lot.ticker,
            "name": names.get(lot.ticker, lot.name),
            "right": lot.right,
            "strike": lot.strike,
            "expiry": lot.expiry,
            "contracts": round(lot.contracts, 2),
            "owner": lot.owner,
            "opened": lot.date,
            "premium": round(lot.premium, 2),
        }
        for lot in books.options
        if lot.contracts > 0.01 and (not lot.expiry or lot.expiry >= today)
    ]

    other = [
        {
            "date": trade["transactionDate"],
            "name": trade["name"],
            "amountLabel": trade["amountLabel"],
            "description": trade["description"],
            "pdfUrl": trade["pdfUrl"],
            "owner": trade["owner"],
        }
        for trade in trades
        if not trade.get("ticker") or trade.get("kind") == "other"
    ]

    ui_trades = []
    for trade in sorted(trades, key=lambda item: (item["transactionDate"], item["id"]), reverse=True):
        ui_trades.append(
            {
                "id": trade["id"],
                "docId": trade["docId"],
                "pdfUrl": trade["pdfUrl"],
                "filingDate": trade["filingDate"],
                "transactionDate": trade["transactionDate"],
                "owner": trade["owner"],
                "ticker": trade.get("ticker"),
                "name": names.get(trade.get("ticker"), trade.get("name")),
                "assetType": trade.get("assetType"),
                "action": trade.get("kind"),
                "amountLabel": trade.get("amountLabel"),
                "description": trade.get("description") or "",
                "shares": trade.get("shares") if trade.get("shares") is not None else trade.get("bookedShares"),
                "sharesEstimated": bool(trade.get("sharesEstimated")),
                "price": trade.get("bookedPrice", trade.get("strike")),
                "extent": trade.get("extent"),
            }
        )

    unrealized = priced_value - priced_cost
    total_pnl = unrealized + books.realized_total
    prior_value = priced_value - day_change
    last_filing = max((item["filingDate"] for item in filings), default=None)
    district = ""
    if filings:
        latest = max(filings, key=lambda item: item["filingDate"])
        district = latest.get("stateDst") or ""
        match = re.match(r"([A-Z]{2})(\d+)", district)
        if match:
            district = f"{match.group(1)}-{int(match.group(2))}"

    failed = [item["docId"] for item in filings if item.get("status") not in {"ok"}]
    if failed:
        books.warn(
            "Some filings could not be read as text ("
            + ", ".join(failed[:12])
            + ("…" if len(failed) > 12 else "")
            + ")."
        )

    snapshot = {
        "generatedAt": now_iso(),
        "asOf": datetime.now(NY).strftime("%b %-d, %Y"),
        "member": {
            "name": "Nancy Pelosi",
            "district": district,
            "chamber": "U.S. House",
        },
        "source": {
            "name": "Clerk of the House of Representatives",
            "url": "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/",
        },
        "summary": {
            "marketValue": round(priced_value, 2),
            "costBasis": round(priced_cost, 2),
            "unrealized": round(unrealized, 2),
            "unrealizedPct": (unrealized / priced_cost) if priced_cost else None,
            "realized": round(books.realized_total, 2),
            "totalPnl": round(total_pnl, 2),
            "totalPnlPct": (total_pnl / books.deployed) if books.deployed else None,
            "dayChange": round(day_change, 2),
            "dayChangePct": (day_change / prior_value) if prior_value else None,
            "positions": len(holdings),
            "trades": len(trades),
            "filings": len([item for item in filings if item.get("status") == "ok"]),
            "firstTrade": min((trade["transactionDate"] for trade in trades), default=None),
            "lastFiling": last_filing,
            "deployed": round(books.deployed, 2),
        },
        "history": history,
        "holdings": holdings,
        "realized": sorted(books.realized, key=lambda item: item["date"], reverse=True),
        "options": options,
        "other": other,
        "trades": ui_trades,
        "filings": filings,
        "warnings": books.warnings,
    }
    SNAPSHOT_PATH.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(
        f"[book] {len(holdings)} positions, value ${priced_value:,.0f}, "
        f"unrealized ${unrealized:,.0f}, realized ${books.realized_total:,.0f}"
    )
    return snapshot


def debug_pdfs(paths: list[str]) -> None:
    for raw in paths:
        data = Path(raw).read_bytes()
        trades = parse_ptr_text(extract_pdf_text(data))
        print(f"\n==== {raw} ({len(trades)} trades) ====")
        for trade in trades:
            print(
                f"{trade['transactionDate']} {trade.get('ticker') or '—':6} "
                f"{trade['kind']:10} sh={trade.get('shares')} strike={trade.get('strike')} "
                f"{trade['amountLabel']}"
            )
            print(f"   {trade['description'][:160]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Nancy Pelosi PTR filings into a portfolio snapshot.")
    parser.add_argument("--reparse", action="store_true", help="Re-read every cached PDF.")
    parser.add_argument("--debug-pdf", nargs="*", help="Parse local PDFs and exit.")
    args = parser.parse_args()
    if args.debug_pdf:
        debug_pdfs(args.debug_pdf)
        return
    http = session()
    document = collect_trades(http, reparse=args.reparse)
    build_snapshot(http, document)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
