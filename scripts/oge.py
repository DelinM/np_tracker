"""OGE Form 278-T periodic transaction reports for executive-branch filers."""

import json
import re
from pathlib import Path

import pdfplumber
import requests

from scanned import _recognize
from sync import classify, parse_amount, to_iso

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache" / "oge"
PARSER_TAG = 1

# Public 278-T PDFs. Received dates are the dates stamped on the filings.
TRUMP_FILINGS = [
    {
        "docId": "2025-08-12",
        "received": "2025-08-19",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/E9C024E25C9E4B2085258CEB006E7E23/$FILE/Donald-J-Trump-08.12.2025-278T.pdf",
    },
    {
        "docId": "2025-10-20",
        "received": "2025-10-28",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/18353894FE440B3685258D430031A337/$FILE/Donald%20J.%20Trump%2010.20.2025%20278-T%20(2).pdf",
    },
    {
        "docId": "2025-11-14",
        "received": "2025-11-17",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/903A217DC18563EC85258D4A0031B044/$FILE/Donald%20J.%20Trump%2011.14.2025%20278-T.pdf",
    },
    {
        "docId": "2025-12-18",
        "received": "2025-12-19",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/87BFE542A2751E0285258D6600346FCD/$FILE/Donald%20J.%20Trump%2012.18.2025%20278-T.pdf",
    },
    {
        "docId": "2026-01-14",
        "received": "2026-01-14",
        "url": "https://www.whitehouse.gov/wp-content/uploads/2026/01/President-Donald-J.-Trump-Periodic-Transaction-Report-1.14.2026-.pdf",
    },
    {
        "docId": "2026-04-20",
        "received": "2026-04-23",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/CD75555856A7D2E485258DE4002DD4A0/$FILE/Donald-J-Trump-4.20.2026-278T.pdf",
    },
    {
        "docId": "2026-05-08",
        "received": "2026-05-08",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/405E4EC4E27BE8D185258DF7002DD1C0/$FILE/Trump%2C%20Donald%20J.-05.08.2026-278T%282%29.pdf",
    },
    {
        "docId": "2026-06-25",
        "received": "2026-06-29",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/F9CA13B970439E8F85258E27002DDF15/$FILE/Donald-J-Trump-06.25.2026-278T%20%282%29.pdf",
    },
    {
        "docId": "2026-09-17",
        "received": "2026-09-25",
        "url": "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/0BDCCCE7DE13AEFA85258E8A002DE2B5/$FILE/Donald-J-Trump.09.17.2026-278T.pdf",
    },
]

ROW_RE = re.compile(
    r"\b(?P<type>Purchase|Purchas[eo]|Sale|Sold|Exchange)\b\s+"
    r"(?P<date>\d{1,2}/\d{2}1\d{4}|\d{1,2}[/.]\d{1,2}[/.]?\d{2,4})"
    r"(?P<rest>.*)$",
    re.I,
)
AMOUNT_RE = re.compile(r"\$\s*[\d,.]+\s*[-–—•]\s*\$?\s*[\d,.]+|Over\s+\$\s*[\d,.]+", re.I)
BOND_RE = re.compile(
    r"(\d+\.\d+\s*%|\bDUE\b|\bREV\b|\bBOND\b|\bCNTY\b|\bAUTH\b|\bDIST\b|\bMUNI\b|\bOBLIG\b|B/E|RFDG|\bGO\b)",
    re.I,
)
SKIP_LINE = re.compile(
    r"(OGE Form|Office of Government|public form|account numbers|Filer'?s Name|Donald J\.? Trump|"
    r"^Transactions\b|^#\b|Description\s+Type|Received Over|Days Ago|^Page\b|^Paoe\b|^Note\b|"
    r"If you need more|follow these instructions|278-T|Certification|Ethics Official)",
    re.I,
)


def _filings_for(member: dict) -> list[dict]:
    if member.get("slug") == "trump":
        return TRUMP_FILINGS
    return []


def _fix_date(raw: str) -> str:
    raw = raw.strip().replace(".", "/")
    smashed = re.fullmatch(r"(\d{1,2})/(\d{2})1(\d{4})", raw)
    if smashed:
        raw = f"{smashed.group(1)}/{smashed.group(2)}/{smashed.group(3)}"
    return to_iso(raw)


def _fix_amount(text: str) -> str:
    return re.sub(r"(\d)\.(\d{3})(?!\d)", r"\1,\2", text)


def _clean_desc(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\b\d{1,4}\s+(?:YES|NO)\b", " ", text, flags=re.I)
    text = re.sub(r"\b(?:YES|NO)\b", " ", text, flags=re.I)
    text = re.sub(r"(?:^|\s)\d{1,4}(?=\s|$)", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -·.~'")
    start = re.search(r"\b[A-Z][A-Z0-9&.'/-]{2,}\b", text)
    if start and start.start() > 0:
        text = text[start.start():]
    return text.strip(" -·.~'")


def _lines_from_tokens(tokens: list[dict]) -> str:
    rows: list[list[dict]] = []
    for token in sorted(tokens, key=lambda item: (-item["y"], item["x"])):
        if token.get("confidence", 1) < 0.35 or not str(token.get("text") or "").strip():
            continue
        if not rows or abs(rows[-1][0]["y"] - token["y"]) > 0.012:
            rows.append([token])
        else:
            rows[-1].append(token)
    return "\n".join(" ".join(item["text"] for item in sorted(row, key=lambda item: item["x"])) for row in rows)


def _page_text(page, image_path: Path) -> str:
    text = page.extract_text() or ""
    if len(re.findall(r"\b(?:Purchase|Purchas[eo]|Sale|Sold)\b", text, re.I)) >= 3:
        return text
    image_path.parent.mkdir(parents=True, exist_ok=True)
    page.to_image(resolution=140).save(str(image_path))
    tokens = _recognize(image_path)
    if not tokens:
        return text
    ocr = _lines_from_tokens(tokens)
    return ocr or text


def parse_page(text: str) -> list[dict]:
    rows = []
    buffer: list[str] = []
    pending: dict | None = None
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if pending is not None:
            amount = AMOUNT_RE.search(line)
            if amount:
                pending["amount"] = _fix_amount(amount.group(0))
                rows.append(pending)
            pending = None
            continue
        match = ROW_RE.search(line)
        if not match:
            if not SKIP_LINE.search(line):
                buffer.append(line)
            continue
        prefix = line[: match.start()].strip()
        parts = buffer + ([prefix] if prefix else [])
        buffer = []
        description = _clean_desc(" ".join(parts))
        amount = AMOUNT_RE.search(match.group("rest") or "")
        row = {
            "description": description,
            "txType": match.group("type"),
            "date": _fix_date(match.group("date")),
            "amount": _fix_amount(amount.group(0)) if amount else "",
        }
        if amount:
            rows.append(row)
        else:
            pending = row
    return [row for row in rows if len(row["description"]) >= 8 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"] or "")]


def _ticker_for(name: str) -> tuple[str | None, str]:
    if BOND_RE.search(name):
        return None, "Municipal Bond"
    from scanned import lookup_ticker

    ticker = lookup_ticker(name)
    return ticker, "Stock" if ticker else "Other"


def _trade(filing: dict, index: int, row: dict) -> dict:
    name = row["description"]
    ticker, asset_type = _ticker_for(name)
    verb = row["txType"].lower()
    if verb.startswith("s"):
        tx_type = "S"
    elif verb.startswith("e"):
        tx_type = "E"
    else:
        tx_type = "P"
    lo, hi, label = parse_amount(row["amount"]) if row["amount"] else (None, None, "—")
    classified = classify(name, tx_type, None)
    if ticker is None and classified.get("kind") in {"buy", "sell", "exercise", "transfer", "receive"}:
        classified["kind"] = "other"
    year = int(filing["received"][:4])
    return {
        "id": f"{filing['docId']}-{index}",
        "docId": filing["docId"],
        "pdfUrl": filing["url"],
        "filingDate": filing["received"],
        "year": year,
        "transactionDate": row["date"],
        "notificationDate": None,
        "owner": "self",
        "ticker": ticker,
        "name": name,
        "assetType": asset_type,
        "amountMin": lo,
        "amountMax": hi,
        "amountLabel": label,
        "description": name,
        **classified,
    }


def _download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 1000:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    dest.write_bytes(response.content)


def parse_filing(filing: dict) -> list[dict]:
    cached = CACHE / f"{filing['docId']}.json"
    if cached.exists():
        saved = json.loads(cached.read_text())
        if saved.get("parser") == PARSER_TAG:
            return saved["trades"]
    pdf_path = CACHE / f"{filing['docId']}.pdf"
    _download(filing["url"], pdf_path)
    trades = []
    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages):
            text = _page_text(page, CACHE / f"{filing['docId']}-p{index}.png")
            for row in parse_page(text):
                trades.append(_trade(filing, len(trades) + 1, row))
    cached.write_text(json.dumps({"parser": PARSER_TAG, "trades": trades}))
    return trades


def collect_oge(member: dict) -> tuple[list[dict], list[dict]]:
    filings = []
    trades = []
    for filing in _filings_for(member):
        parsed = parse_filing(filing)
        filings.append(
            {
                "docId": filing["docId"],
                "year": int(filing["received"][:4]),
                "filingDate": filing["received"],
                "stateDst": "",
                "pdfUrl": filing["url"],
                "status": "ok" if parsed else "empty",
                "tradeCount": len(parsed),
            }
        )
        trades.extend(parsed)
        print(f"[oge] {filing['docId']}: {len(parsed)} trades")
    return filings, trades
