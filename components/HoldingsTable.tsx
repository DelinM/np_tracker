"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { OWNER_LABEL, money, prettyDate, price, shares, signedMoney, signedPct, tone } from "@/lib/format";
import type { Holding } from "@/lib/types";

type SortKey = "marketValue" | "dayChange" | "unrealizedPct" | "ticker" | "weight";

export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("marketValue");
  const [direction, setDirection] = useState<-1 | 1>(-1);

  const rows = useMemo(() => {
    const copy = [...holdings];
    copy.sort((a, b) => {
      const left = sort === "ticker" ? a.ticker : (a[sort] ?? -Infinity);
      const right = sort === "ticker" ? b.ticker : (b[sort] ?? -Infinity);
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return 0;
    });
    return copy;
  }, [holdings, sort, direction]);

  function toggle(key: SortKey) {
    if (sort === key) setDirection((current) => (current === 1 ? -1 : 1));
    else {
      setSort(key);
      setDirection(key === "ticker" ? 1 : -1);
    }
  }

  if (!holdings.length) {
    return <p className="text-sm text-muted">No open stock positions could be reconstructed from the filings.</p>;
  }

  const header = (key: SortKey, label: string, align = "right") => (
    <th className={`${align === "right" ? "text-right" : "text-left"} px-3 py-3 font-medium`}>
      <button type="button" onClick={() => toggle(key)} className="hover:text-cream">
        {label}
        {sort === key ? (direction === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-panel/80">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            {header("ticker", "Position", "left")}
            <th className="px-3 py-3 text-right font-medium">Shares</th>
            <th className="px-3 py-3 text-right font-medium">Avg cost</th>
            <th className="px-3 py-3 text-right font-medium">Last</th>
            {header("dayChange", "Day")}
            {header("marketValue", "Value")}
            {header("unrealizedPct", "Return")}
            {header("weight", "Weight")}
          </tr>
        </thead>
        <tbody>
          {rows.map((holding) => {
            const expanded = open === holding.ticker;
            return (
              <Fragment key={holding.ticker}>
                <tr
                  className="cursor-pointer border-b border-line/80 transition hover:bg-white/[0.025]"
                  onClick={() => setOpen(expanded ? null : holding.ticker)}
                >
                  <td className="sticky left-0 bg-panel px-3 py-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[13px] text-cream">{holding.ticker}</span>
                      <span className="text-xs text-muted">{holding.owners.map((owner) => OWNER_LABEL[owner]).join(" · ")}</span>
                    </div>
                    <p className="max-w-[240px] truncate text-xs text-muted">{holding.name}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{shares(holding.shares)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{price(holding.avgCost)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{price(holding.price)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${tone(holding.dayChange)}`}>
                    <div>{holding.dayChange == null ? "—" : signedMoney(holding.dayChange)}</div>
                    <div className="text-xs">{signedPct(holding.dayChangePct)}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {holding.marketValue == null ? "—" : money(holding.marketValue)}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${tone(holding.unrealized)}`}>
                    <div>{holding.unrealized == null ? "—" : signedMoney(holding.unrealized)}</div>
                    <div className="text-xs">{signedPct(holding.unrealizedPct)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="ml-auto w-16">
                      <div className="mb-1 text-xs tabular-nums text-muted">
                        {holding.weight == null ? "—" : `${(holding.weight * 100).toFixed(1)}%`}
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.min(100, (holding.weight ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr key={`${holding.ticker}-lots`} className="border-b border-line bg-panel-2/50">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted">Open lots</p>
                        <Link href={`/activity?ticker=${holding.ticker}`} className="text-xs text-gold hover:underline">
                          All {holding.ticker} filings
                        </Link>
                      </div>
                      <div className="grid gap-2">
                        {holding.lots.map((lot) => (
                          <div key={lot.tradeId + lot.date + lot.shares} className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                            <span className="text-muted">{prettyDate(lot.date)}</span>
                            <span className="tabular-nums">{shares(lot.shares)} sh @ {price(lot.price)}</span>
                            <span className="tabular-nums text-muted">{money(lot.cost)} cost</span>
                            <span className="text-muted sm:text-right">{lot.note}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
