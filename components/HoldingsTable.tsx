"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { money, prettyDate, price, shares, signedMoney, signedPct, tone } from "@/lib/format";
import { translateNote, useI18n } from "@/lib/i18n";
import type { Holding } from "@/lib/types";

type SortKey = "marketValue" | "dayChange" | "unrealizedPct" | "ticker" | "weight" | "latestBuy";

export function HoldingsTable({ holdings, base }: { holdings: Holding[]; base: string }) {
  const { locale, copy } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("marketValue");
  const [direction, setDirection] = useState<-1 | 1>(-1);

  const rows = useMemo(() => {
    const copy = [...holdings];
    copy.sort((a, b) => {
      const left = sort === "ticker" ? a.ticker : sort === "latestBuy" ? a.latestBuy ?? "" : (a[sort] ?? -Infinity);
      const right = sort === "ticker" ? b.ticker : sort === "latestBuy" ? b.latestBuy ?? "" : (b[sort] ?? -Infinity);
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
    return <p className="text-sm text-muted">{copy.noPositions}</p>;
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
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSort("marketValue");
            setDirection(-1);
          }}
          className={`rounded-full px-3 py-1 text-xs uppercase tracking-wide ${
            sort === "marketValue" ? "bg-cream text-ink" : "border border-line text-muted"
          }`}
        >
          {copy.sortValue}
        </button>
        <button
          type="button"
          onClick={() => {
            setSort("latestBuy");
            setDirection(-1);
          }}
          className={`rounded-full px-3 py-1 text-xs uppercase tracking-wide ${
            sort === "latestBuy" ? "bg-cream text-ink" : "border border-line text-muted"
          }`}
        >
          {copy.sortPurchase}
        </button>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((holding) => {
          const expanded = open === holding.ticker;
          return (
            <div key={holding.ticker} className="rounded-3xl border border-line bg-panel/80 p-4">
              <button type="button" onClick={() => setOpen(expanded ? null : holding.ticker)} className="w-full text-left">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-sm text-cream">{holding.ticker}</span>
                  <span className="tabular-nums">{holding.marketValue == null ? "—" : money(holding.marketValue)}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted">{holding.name}</span>
                <span className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <span>
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-gold">{copy.day}</span>
                    <span className={tone(holding.dayChange)}>{holding.dayChange == null ? "—" : signedMoney(holding.dayChange)}</span>
                  </span>
                  <span>
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-gold">{copy.return}</span>
                    <span className={tone(holding.unrealized)}>{signedPct(holding.unrealizedPct)}</span>
                  </span>
                </span>
              </button>
              {expanded ? (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">{copy.openLots}</p>
                    <Link href={`${base}/activity?ticker=${holding.ticker}`} className="text-xs text-gold hover:underline">
                      {copy.allFilings(holding.ticker)}
                    </Link>
                  </div>
                  <div className="grid gap-2">
                    {[...holding.lots]
                      .sort((a, b) => b.date.localeCompare(a.date) || b.tradeId.localeCompare(a.tradeId))
                      .map((lot) => (
                        <div key={lot.tradeId + lot.date + lot.shares} className="text-sm">
                          <p className="text-muted">{prettyDate(lot.date, locale)}</p>
                          <p className="tabular-nums">{shares(lot.shares)} {copy.sharesShort} @ {price(lot.price)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-3xl border border-line bg-panel/80 md:block">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            {header("ticker", copy.position, "left")}
            <th className="px-3 py-3 text-right font-medium">{copy.shares}</th>
            <th className="px-3 py-3 text-right font-medium">{copy.avgCost}</th>
            <th className="px-3 py-3 text-right font-medium">{copy.last}</th>
            {header("dayChange", copy.day)}
            {header("marketValue", copy.value)}
            {header("unrealizedPct", copy.return)}
            {header("weight", copy.weight)}
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
                      <span className="text-xs text-muted">{holding.owners.map((owner) => copy.owners[owner]).join(" · ")}</span>
                    </div>
                    <p className="max-w-[240px] truncate text-xs text-muted">{holding.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {holding.latestBuy ? <span>{prettyDate(holding.latestBuy, locale)}</span> : null}
                      {holding.sourceUrl ? (
                        <a
                          href={holding.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-gold hover:underline"
                        >
                          {copy.filingLink}
                        </a>
                      ) : null}
                    </div>
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
                        <p className="text-xs uppercase tracking-[0.18em] text-muted">{copy.openLots}</p>
                        <Link href={`${base}/activity?ticker=${holding.ticker}`} className="text-xs text-gold hover:underline">
                          {copy.allFilings(holding.ticker)}
                        </Link>
                      </div>
                      <div className="grid gap-2">
                        {[...holding.lots]
                          .sort((a, b) => b.date.localeCompare(a.date) || b.tradeId.localeCompare(a.tradeId))
                          .map((lot) => (
                          <div key={lot.tradeId + lot.date + lot.shares} className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                            <span className="text-muted">{prettyDate(lot.date, locale)}</span>
                            <span className="tabular-nums">{shares(lot.shares)} {copy.sharesShort} @ {price(lot.price)}</span>
                            <span className="tabular-nums text-muted">{money(lot.cost)} {copy.cost}</span>
                            <span className="text-muted sm:text-right">
                              {translateNote(lot.note, locale)}
                              {lot.pdfUrl ? (
                                <>
                                  {" · "}
                                  <a href={lot.pdfUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                                    {copy.filingLink}
                                  </a>
                                </>
                              ) : null}
                            </span>
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
    </div>
  );
}
