"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisMoney, money, prettyDate, signedMoney, tone } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { HistoryPoint } from "@/lib/types";

const ranges = ["1M", "3M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof ranges)[number];

function sliceHistory(history: HistoryPoint[], range: Range) {
  if (!history.length || range === "ALL") return history;
  const last = history[history.length - 1].date;
  const end = new Date(last + "T00:00:00");
  const start = new Date(end);
  if (range === "1M") start.setMonth(start.getMonth() - 1);
  else if (range === "3M") start.setMonth(start.getMonth() - 3);
  else if (range === "1Y") start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(0, 1);
  const iso = start.toISOString().slice(0, 10);
  return history.filter((point) => point.date >= iso);
}

function thin(points: HistoryPoint[], max = 420) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last);
  return sampled;
}

export function PortfolioChart({ history }: { history: HistoryPoint[] }) {
  const { locale, copy } = useI18n();
  const [range, setRange] = useState<Range>("ALL");
  const [mode, setMode] = useState<"value" | "pnl">("value");
  const data = useMemo(() => thin(sliceHistory(history, range)), [history, range]);
  const positive = (data[data.length - 1]?.pnl ?? 0) >= 0;
  const stroke = mode === "pnl" ? (positive ? "#3dce97" : "#f07178") : "#d4b483";

  return (
    <section className="rounded-3xl border border-line bg-panel/80 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line p-1">
          {(
            [
              ["value", copy.chartValue],
              ["pnl", copy.chartProfit],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`rounded-full px-3 py-1 text-sm ${mode === key ? "bg-cream text-ink" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {ranges.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`rounded-full px-2.5 py-1 text-xs tracking-wide ${
                range === item ? "bg-panel-2 text-cream" : "text-muted hover:text-cream"
              }`}
            >
              {copy.ranges[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bookFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#ffffff10" />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => {
                  const [year, month, day] = value.split("-").map(Number);
                  const date = new Date(year, month - 1, day);
                  const tag = locale === "zh" ? "zh-CN" : "en-US";
                  if (range === "1M" || range === "3M") {
                    return date.toLocaleDateString(tag, { month: locale === "zh" ? "long" : "short", day: "numeric" });
                  }
                  return date.toLocaleDateString(tag, { month: "short", year: "2-digit" });
                }}
                minTickGap={36}
                tick={{ fill: "#9c978d", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={axisMoney}
                width={64}
                tick={{ fill: "#9c978d", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: "#ffffff22" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || typeof label !== "string") return null;
                  const point = payload[0].payload as HistoryPoint;
                  return (
                    <div className="rounded-2xl border border-line bg-ink px-3 py-2 text-xs shadow-xl">
                      <p className="text-muted">{prettyDate(label, locale)}</p>
                      <p className="mt-1 font-medium text-cream">{money(point.value)}</p>
                      <p className={tone(point.pnl)}>{copy.profitTip} {signedMoney(point.pnl)}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={mode}
                stroke={stroke}
                strokeWidth={2.5}
                fill="url(#bookFill)"
                dot={false}
                activeDot={{ r: 4, fill: stroke }}
              />
              {mode === "value" ? (
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="rgba(255,255,255,0.35)"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.25}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {copy.noHistory}
          </div>
        )}
      </div>
      {mode === "value" ? (
        <p className="mt-2 text-xs text-muted">{copy.valueCaption}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">{copy.profitCaption}</p>
      )}
    </section>
  );
}
