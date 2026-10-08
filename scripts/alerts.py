"""Tell registered Telegram chats when a new disclosed trade shows up.

Telegram cannot text a phone number until that person has opened the bot.
The phone number is only a label. Delivery uses the chat id from /start.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALERTS_PATH = ROOT / "data" / "alerts.json"


def load_env() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_alerts() -> dict:
    if not ALERTS_PATH.exists():
        return {"offset": 0, "subscribers": [], "pending": []}
    data = json.loads(ALERTS_PATH.read_text())
    data.setdefault("offset", 0)
    data.setdefault("subscribers", [])
    data.setdefault("pending", [])
    return data


def save_alerts(data: dict) -> None:
    ALERTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    ALERTS_PATH.write_text(json.dumps(data, indent=2) + "\n")


def _api(token: str, method: str, payload: dict | None = None) -> dict:
    import requests

    response = requests.post(
        f"https://api.telegram.org/bot{token}/{method}",
        json=payload or {},
        timeout=30,
    )
    body = response.json()
    if not body.get("ok"):
        print(f"[telegram] {method} failed: {body}")
    return body


def register_updates(token: str | None = None) -> dict:
    load_env()
    token = token or os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    data = load_alerts()
    if not token:
        return data
    body = _api(token, "getUpdates", {"offset": data.get("offset") or 0, "timeout": 0})
    for update in body.get("result") or []:
        data["offset"] = max(int(data.get("offset") or 0), int(update["update_id"]) + 1)
        message = update.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if chat_id is None:
            continue
        text = (message.get("text") or "").strip()
        code = ""
        if text.startswith("/start"):
            code = text.split(maxsplit=1)[1].strip() if " " in text else ""
        pending = next((item for item in data["pending"] if item.get("code") == code), None) if code else None
        name = " ".join(part for part in (chat.get("first_name"), chat.get("last_name")) if part)
        subscriber = {
            "chatId": chat_id,
            "name": name or str(chat_id),
        }
        data["subscribers"] = [item for item in data["subscribers"] if item.get("chatId") != chat_id]
        data["subscribers"].append(subscriber)
        if pending:
            data["pending"] = [item for item in data["pending"] if item.get("code") != code]
        print(f"[telegram] registered {subscriber['name']}")
    save_alerts(data)
    return data


def _money(value: float) -> str:
    return f"${value:,.2f}"


def _count(value: float, estimated: bool) -> str:
    if estimated:
        shown = f"{value:,.0f}" if value >= 100 else f"{value:,.1f}"
        return f"about {shown}"
    if abs(value - round(value)) < 0.05:
        return f"{round(value):,}"
    return f"{value:,.2f}"


def _premium(trade: dict) -> float | None:
    contracts = trade.get("contracts")
    lo = trade.get("amountMin")
    if not contracts or lo is None:
        return None
    hi = trade.get("amountMax")
    mid = float(lo) if hi is None else (float(lo) + float(hi)) / 2
    if contracts <= 0:
        return None
    return mid / float(contracts)


def trade_line(trade: dict) -> str:
    kind = trade.get("kind") or trade.get("action") or ""
    ticker = trade.get("ticker") or "—"
    head = " ".join(part for part in (trade.get("transactionDate") or "", kind, ticker) if part)
    detail: list[str] = []
    if kind == "option":
        contracts = trade.get("contracts")
        if contracts:
            right = trade.get("optionRight") or "call"
            detail.append(f"{_count(float(contracts), False)} {right}s")
        strike = trade.get("strike")
        if strike:
            detail.append(f"strike {_money(float(strike))}")
        if trade.get("expiry"):
            detail.append(f"exp {trade['expiry']}")
        premium = _premium(trade)
        if premium:
            detail.append(f"about ${premium:,.0f} per contract")
    else:
        shares = trade.get("bookedShares")
        if shares is None:
            shares = trade.get("shares")
        price = trade.get("bookedPrice")
        if price is None:
            price = trade.get("price")
        if shares and price:
            estimated = bool(trade.get("sharesEstimated"))
            detail.append(f"{_count(float(shares), estimated)} shares @ {_money(float(price))} close")
    if trade.get("amountLabel"):
        detail.append(trade["amountLabel"])
    body = " · ".join(detail)
    return f"• {head} · {body}" if body else f"• {head}"


def render_message(sections: list[tuple[str, list[dict]]]) -> str:
    lines = ["New disclosed trades"]
    for name, trades in sections:
        if not trades:
            continue
        lines.append("")
        lines.append(name)
        for trade in trades[:12]:
            lines.append(trade_line(trade))
            if trade.get("pdfUrl"):
                lines.append(trade["pdfUrl"])
        if len(trades) > 12:
            lines.append(f"• {len(trades) - 12} more")
    return "\n".join(lines)[:4000]


def send_trades(sections: list[tuple[str, list[dict]]]) -> None:
    load_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    fresh = [(name, trades) for name, trades in sections if trades]
    if not token or not fresh:
        if fresh and not token:
            print("[telegram] new trades found, but TELEGRAM_BOT_TOKEN is not set")
        return
    data = register_updates(token)
    if not data["subscribers"]:
        print("[telegram] new trades found, no subscribers yet")
        return
    text = render_message(fresh)
    for subscriber in data["subscribers"]:
        _api(token, "sendMessage", {"chat_id": subscriber["chatId"], "text": text, "disable_web_page_preview": True})
    print(f"[telegram] sent {sum(len(trades) for _, trades in fresh)} trades to {len(data['subscribers'])} chats")
