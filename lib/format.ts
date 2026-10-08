
export function money(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function signedMoney(value: number, digits = 0) {
  const formatted = money(Math.abs(value), digits);
  if (value > 0.5) return `+${formatted}`;
  if (value < -0.5) return `−${formatted}`;
  return money(0, digits);
}

export function signedPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const body = `${(Math.abs(value) * 100).toFixed(2)}%`;
  if (value > 0.00005) return `+${body}`;
  if (value < -0.00005) return `−${body}`;
  return body;
}

export function compactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return money(value, 0);
}

export function axisMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function shares(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function price(value: number | null) {
  if (value == null) return "—";
  const digits = value >= 1000 ? 0 : value >= 100 ? 2 : 2;
  return money(value, digits);
}

export function prettyDate(iso: string | null, locale: "en" | "zh" = "en") {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: locale === "zh" ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function tone(value: number | null | undefined) {
  if (value == null || Math.abs(value) < 0.5) return "text-cream";
  return value > 0 ? "text-up" : "text-down";
}

export function cleanNote(text: string) {
  return text.replace(/\s*\$200\?\s*/g, " ").replace(/\s+/g, " ").trim();
}
