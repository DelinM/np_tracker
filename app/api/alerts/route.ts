import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type AlertsFile = {
  offset: number;
  subscribers: Array<{ chatId: number; name: string }>;
  pending: Array<{ code: string; createdAt: string }>;
};

const filePath = path.join(process.cwd(), "data", "alerts.json");

function load(): AlertsFile {
  if (!existsSync(filePath)) return { offset: 0, subscribers: [], pending: [] };
  const data = JSON.parse(readFileSync(filePath, "utf8")) as AlertsFile;
  data.offset ??= 0;
  data.subscribers ??= [];
  data.pending ??= [];
  return data;
}

function save(data: AlertsFile) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const stored = {
    offset: data.offset,
    subscribers: data.subscribers.map((item) => ({ chatId: item.chatId, name: item.name })),
    pending: data.pending.map((item) => ({ code: item.code, createdAt: item.createdAt })),
  };
  writeFileSync(filePath, JSON.stringify(stored, null, 2) + "\n");
}

async function pull(data: AlertsFile) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return data;
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset: data.offset || undefined, timeout: 0 }),
  });
  const body = (await response.json()) as {
    ok?: boolean;
    result?: Array<{ update_id: number; message?: { text?: string; chat?: { id: number; first_name?: string; last_name?: string } } }>;
  };
  if (!body.ok) return data;
  for (const update of body.result ?? []) {
    data.offset = Math.max(data.offset, update.update_id + 1);
    const chat = update.message?.chat;
    if (!chat) continue;
    const text = update.message?.text ?? "";
    const code = text.startsWith("/start") ? text.split(/\s+/)[1] ?? "" : "";
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || String(chat.id);
    data.subscribers = data.subscribers.filter((item) => item.chatId !== chat.id);
    data.subscribers.push({ chatId: chat.id, name });
    if (code) data.pending = data.pending.filter((item) => item.code !== code);
  }
  save(data);
  return data;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { phone?: string; code?: string };
  const phone = (body.phone ?? "").trim();
  if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    return NextResponse.json({ error: "phone" }, { status: 400 });
  }
  const data = load();
  const code = body.code && data.pending.some((item) => item.code === body.code) ? body.code : randomBytes(4).toString("hex");
  if (!data.pending.some((item) => item.code === code)) {
    data.pending.push({ code, createdAt: new Date().toISOString() });
    save(data);
  }
  await pull(data);
  const username = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
  const linked = data.pending.every((item) => item.code !== code) && data.subscribers.length > 0 && Boolean(body.code);
  return NextResponse.json({
    code,
    url: username ? `https://t.me/${username}?start=${code}` : "",
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && username),
    linked,
  });
}
