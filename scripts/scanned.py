"""Read scanned House periodic-transaction pages.

Electronic filings already have a text layer. Paper filings are images of the
standard PTR grid. This module OCRs that grid and maps company names to tickers
with the SEC company list. The filing PDF remains the source to check.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

import pdfplumber
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
SWIFT = Path(__file__).with_name("ocr_page.swift")
BINARY = CACHE / "ocr_page"
SEC_PATH = CACHE / "sec_tickers.json"
NAME_CACHE = CACHE / "name_tickers.json"

DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{2,4})")
OWNER_RE = re.compile(r"^(DC|JT|SP|DE)\b[\s.:-]*", re.I)
BANDS = [
    (1001, 15000),
    (15001, 50000),
    (50001, 100000),
    (100001, 250000),
    (250001, 500000),
    (500001, 1_000_000),
    (1_000_001, 5_000_000),
    (5_000_001, 25_000_000),
    (25_000_001, 50_000_000),
    (50_000_001, None),
]
SKIP_NAME = re.compile(
    r"\b(EXAMPLE|TRUST|GRANDCHILD|BOND|NOTE|PERPETUAL|TREASURY|DEBENTURE|MUNICIPAL)\b",
    re.I,
)
DROP_TOKENS = {
    "CMN", "COMMON", "STOCK", "SHARES", "SHARE", "INC", "INCORPORATED", "CORPORATION",
    "CORP", "CO", "COMPANY", "LTD", "PLC", "THE", "NEW", "CLASS", "COM",
}


def ocr_available() -> bool:
    return shutil.which("swiftc") is not None or shutil.which("tesseract") is not None


def _swift_binary() -> Path | None:
    if shutil.which("swiftc") is None:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    if not BINARY.exists() or SWIFT.stat().st_mtime > BINARY.stat().st_mtime:
        subprocess.check_call(["swiftc", "-O", str(SWIFT), "-o", str(BINARY)])
    return BINARY


def _recognize(png: Path) -> list[dict] | None:
    binary = _swift_binary()
    if binary is not None:
        raw = subprocess.check_output([str(binary), str(png)], timeout=90)
        return json.loads(raw)
    if shutil.which("tesseract") is None:
        return None
    raw = subprocess.check_output(["tesseract", str(png), "stdout", "tsv"], timeout=90, stderr=subprocess.DEVNULL)
    image = Image.open(png)
    width, height = image.size
    tokens = []
    for line in raw.decode("utf-8", "replace").splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 12 or not parts[11].strip() or parts[11] == "-1":
            continue
        left, top, box_w, box_h = (int(parts[i]) for i in range(6, 10))
        tokens.append(
            {
                "text": parts[11],
                "confidence": float(parts[10] or 0) / 100,
                "x": left / width,
                "y": 1 - (top + box_h) / height,
                "w": box_w / width,
                "h": box_h / height,
            }
        )
    return tokens


def _iso(month: str, day: str, year: str) -> str | None:
    yy = int(year)
    if yy < 100:
        yy += 2000 if yy < 70 else 1900
    if not (2012 <= yy <= 2027 and 1 <= int(month) <= 12 and 1 <= int(day) <= 31):
        return None
    try:
        return datetime(yy, int(month), int(day)).date().isoformat()
    except ValueError:
        return None


def _ink(image: Image.Image, nx: float, ny: float) -> float:
    width, height = image.size
    cx = int(nx * width)
    cy = int((1 - ny) * height)
    pixels = image.load()
    dark = total = 0
    for y in range(cy - 7, cy + 7):
        for x in range(cx - 8, cx + 8):
            if 0 <= x < width and 0 <= y < height:
                total += 1
                if pixels[x, y] < 145:
                    dark += 1
    return dark / total if total else 0.0


def _peak(image: Image.Image, row_y: float, x0: float, x1: float) -> float:
    best = 0.0
    x = x0
    while x <= x1:
        best = max(best, _ink(image, x, row_y))
        x += 0.006
    return best


def _marked(
    image: Image.Image,
    row_y: float,
    windows: list[tuple[float, float]],
    strict_from: int | None = None,
) -> int | None:
    scores = [_peak(image, row_y, x0, x1) for x0, x1 in windows]
    best = max(range(len(scores)), key=lambda index: scores[index])
    rest = [score for index, score in enumerate(scores) if index != best]
    margin = scores[best] - (max(rest) if rest else 0)
    if scores[best] < 0.15 or margin < 0.04:
        return None
    if strict_from is not None and best >= strict_from and margin < 0.1:
        return None
    return best


def _ticker_for(name: str) -> str | None:
    found = lookup_ticker(name)
    if found or len(name) <= 5:
        return found
    return lookup_ticker(name[1:].strip(" -_."))


def _rows(tokens: list[dict]) -> list[dict]:
    dated = []
    for token in tokens:
        found = DATE_RE.findall(token["text"])
        if not found:
            continue
        dated.append((token["y"] + token["h"] / 2, token["x"], found))
    dated.sort(key=lambda item: -item[0])
    clusters: list[dict] = []
    for y, x, found in dated:
        if clusters and abs(clusters[-1]["y"] - y) < 0.016:
            clusters[-1]["dates"].append((x, found))
            ys = [clusters[-1]["y"], y]
            clusters[-1]["y"] = sum(ys) / len(ys)
        else:
            clusters.append({"y": y, "dates": [(x, found)]})
    return clusters


def _clean_name(name: str) -> str:
    name = re.sub(r"^[^A-Za-z(]+", "", name)
    name = re.sub(r"^(SP|DC|JT|DE)[_\s.:-]+", "", name, flags=re.I)
    cut = re.search(r"\bCMN\b", name, re.I)
    if cut and len(name) > cut.end() + 3:
        name = name[: cut.end()]
    return re.sub(r"\s+", " ", name).strip(" -_.|")


def _name(tokens: list[dict], row_y: float, left_limit: float) -> str:
    pieces = []
    for token in tokens:
        cy = token["y"] + token["h"] / 2
        if abs(cy - row_y) > 0.013 or token["x"] > left_limit:
            continue
        text = token["text"].strip()
        if not text or text.lower() == "x" or DATE_RE.search(text):
            continue
        pieces.append((token["x"], text))
    pieces.sort()
    return re.sub(r"\s+", " ", " ".join(text for _, text in pieces)).strip(" -|.")


def _page_trades(tokens: list[dict], image: Image.Image) -> list[dict]:
    clusters = _rows(tokens)
    if not clusters:
        return []
    date_x = []
    for cluster in clusters:
        xs = sorted(x for x, _found in cluster["dates"])
        if xs:
            date_x.append(xs[0])
    if not date_x:
        return []
    tdate_x = sorted(date_x)[len(date_x) // 2]
    type_windows = [
        (tdate_x - 0.175, tdate_x - 0.118),
        (tdate_x - 0.115, tdate_x - 0.078),
        (tdate_x - 0.075, tdate_x - 0.038),
    ]
    trades = []
    for cluster in clusters:
        ordered = sorted(cluster["dates"], key=lambda item: item[0])
        tx_date = _iso(*ordered[0][1][0])
        if not tx_date:
            continue
        notified = _iso(*ordered[1][1][0]) if len(ordered) > 1 else None
        notified_x = ordered[1][0] if len(ordered) > 1 else ordered[0][0] + 0.055
        amount_windows = [
            (notified_x + 0.045 + index * 0.036, notified_x + 0.073 + index * 0.036) for index in range(len(BANDS))
        ]
        name = _name(tokens, cluster["y"], tdate_x - 0.12)
        owner_match = OWNER_RE.match(name)
        owner = "self"
        if owner_match:
            code = owner_match.group(1).upper()
            owner = {"SP": "spouse", "JT": "joint", "DC": "dependent", "DE": "dependent"}[code]
            name = name[owner_match.end():].strip()
        name = _clean_name(name)
        if len(_tokens_of(name)) < 1 or len(name) < 4 or SKIP_NAME.search(name) or "%" in name:
            continue
        kind_index = _marked(image, cluster["y"], type_windows)
        band_index = _marked(image, cluster["y"], amount_windows, strict_from=4)
        if kind_index is None or band_index is None:
            continue
        lo, hi = BANDS[band_index]
        label = f"Over ${lo:,.0f}" if hi is None else f"${lo:,.0f} – ${hi:,.0f}"
        trades.append(
            {
                "owner": owner,
                "ticker": _ticker_for(name),
                "assetType": "ST",
                "name": name,
                "txType": "PSE"[kind_index],
                "transactionDate": tx_date,
                "notificationDate": notified,
                "amountMin": lo,
                "amountMax": hi,
                "amountLabel": label,
                "description": name,
            }
        )
    return trades


def _tokens_of(name: str) -> set[str]:
    cleaned = name.upper().replace("&", " AND ")
    cleaned = re.sub(r"[^A-Z0-9 ]", " ", cleaned)
    return {token for token in cleaned.split() if token not in DROP_TOKENS and len(token) > 1}


def _companies() -> list[tuple[set[str], str, str]]:
    if not SEC_PATH.exists():
        return []
    payload = json.loads(SEC_PATH.read_text())
    rows = []
    for row in payload.values():
        tokens = _tokens_of(row.get("title") or "")
        ticker = (row.get("ticker") or "").upper()
        if tokens and ticker:
            rows.append((tokens, ticker, row.get("title") or ""))
    return rows


_COMPANIES: list[tuple[set[str], str, str]] | None = None
_POSTINGS: dict[str, list[int]] | None = None
_NAME_MEMO: dict[str, str | None] | None = None


def lookup_ticker(name: str) -> str | None:
    global _COMPANIES, _POSTINGS, _NAME_MEMO
    if _NAME_MEMO is None:
        _NAME_MEMO = json.loads(NAME_CACHE.read_text()) if NAME_CACHE.exists() else {}
    key = re.sub(r"\s+", " ", name.upper()).strip()
    if key in _NAME_MEMO:
        return _NAME_MEMO[key]
    if _COMPANIES is None:
        _COMPANIES = _companies()
        _POSTINGS = {}
        for index, (tokens, _ticker, _title) in enumerate(_COMPANIES):
            for token in tokens:
                _POSTINGS.setdefault(token, []).append(index)
    query = _tokens_of(name)
    ticker = None
    if query and _COMPANIES and _POSTINGS:
        rare = min(query, key=lambda token: len(_POSTINGS.get(token, [])))
        candidates = _POSTINGS.get(rare, [])
        best_len = 99
        for index in candidates:
            tokens, candidate, _title = _COMPANIES[index]
            if len(query & tokens) < len(query):
                continue
            extra = len(tokens - query)
            if extra > 1 or (len(query) == 1 and extra):
                continue
            if len(tokens) < best_len:
                best_len = len(tokens)
                ticker = candidate
    _NAME_MEMO[key] = ticker
    return ticker


def _save_names() -> None:
    if _NAME_MEMO is None:
        return
    NAME_CACHE.parent.mkdir(parents=True, exist_ok=True)
    NAME_CACHE.write_text(json.dumps(_NAME_MEMO) + "\n")


def read_scanned_pdf(path: Path) -> tuple[list[dict], str]:
    if not ocr_available():
        return [], "scanned"
    trades: list[dict] = []
    try:
        with pdfplumber.open(path) as pdf, tempfile.TemporaryDirectory() as tmp:
            for index, page in enumerate(pdf.pages):
                png = Path(tmp) / f"{index}.png"
                page.to_image(resolution=160).save(str(png), format="PNG")
                with Image.open(png) as image:
                    gray = image.convert("L")
                    if gray.height > gray.width:
                        gray = gray.transpose(Image.ROTATE_90)
                        gray.save(png)
                    tokens = _recognize(png)
                    if tokens is None:
                        return [], "scanned"
                    trades.extend(_page_trades(tokens, gray))
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return [], "scanned"
    _save_names()
    if not trades:
        return [], "image"
    from sync import classify

    for trade in trades:
        trade.update(classify(trade.get("description") or "", trade.get("txType") or "", None))
    return trades, "ocr"


if __name__ == "__main__":
    import sys

    found, status = read_scanned_pdf(Path(sys.argv[1]))
    print(status, len(found))
    for trade in found:
        print(
            trade["transactionDate"],
            trade["txType"],
            trade.get("ticker"),
            trade["amountLabel"],
            trade["owner"],
            trade["name"][:60],
        )
