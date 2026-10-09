import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type AlertsFile = {
  offset: number;
  subscribers: Array<{ chatId: number; name: string; username?: string }>;
  pending: Array<{ code: string; createdAt: string; username?: string }>;
};

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "");
}

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
  const stored = {
    offset: data.offset,
    subscribers: data.subscribers.map((item) => ({
      chatId: item.chatId,
      name: item.name,
      ...(item.username ? { username: item.username } : {}),
    })),
    pending: data.pending.map((item) => ({
      code: item.code,
      createdAt: item.createdAt,
      ...(item.username ? { username: item.username } : {}),
    })),
  };
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(stored, null, 2) + "\n");
  } catch {
    // The hosted site cannot write this file. The response still explains
    // whether a bot is configured, instead of failing with an empty error.
  }
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
    result?: Array<{
      update_id: number;
      message?: { text?: string; chat?: { id: number; username?: string; first_name?: string; last_name?: string } };
    }>;
  };
  if (!body.ok) return data;
  for (const update of body.result ?? []) {
    data.offset = Math.max(data.offset, update.update_id + 1);
    const chat = update.message?.chat;
    if (!chat) continue;
    const text = update.message?.text ?? "";
    const code = text.startsWith("/start") ? text.split(/\s+/)[1] ?? "" : "";
    const handle = chat.username ? normalizeUsername(chat.username) : "";
    const pending = code ? data.pending.find((item) => item.code === code) : undefined;
    const name = handle ? `@${handle}` : [chat.first_name, chat.last_name].filter(Boolean).join(" ") || String(chat.id);
    data.subscribers = data.subscribers.filter((item) => item.chatId !== chat.id);
    data.subscribers.push({ chatId: chat.id, name, ...(handle || pending?.username ? { username: handle || pending?.username } : {}) });
    if (code) data.pending = data.pending.filter((item) => item.code !== code);
  }
  save(data);
  return data;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; code?: string };
  const requested = normalizeUsername(body.username ?? "");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(requested)) {
    return NextResponse.json({ error: "username" }, { status: 400 });
  }
  const data = load();
  const code = body.code && data.pending.some((item) => item.code === body.code) ? body.code : randomBytes(4).toString("hex");
  if (!data.pending.some((item) => item.code === code)) {
    data.pending.push({ code, createdAt: new Date().toISOString(), username: requested });
    save(data);
  }
  await pull(data);
  const bot = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
  const linked = data.subscribers.some((item) => item.username?.toLowerCase() === requested.toLowerCase());
  return NextResponse.json({
    code,
    url: bot ? `https://t.me/${bot}?start=${code}` : "",
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && bot),
    linked,
  });
}
