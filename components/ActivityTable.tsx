"use client";

import { useMemo, useState } from "react";
import { ACTION_LABEL, OWNER_LABEL, cleanNote, prettyDate, price, shares } from "@/lib/format";
import type { Trade, TradeAction } from "@/lib/types";

const filters: Array<TradeAction | "all"> = ["all", "buy", "sell", "exercise", "option", "transfer", "receive"];

export function ActivityTable({ trades, initialQuery }: { trades: Trade[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [action, setAction] = useState<TradeAction | "all">("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return trades.filter((trade) => {
      if (action !== "all" && trade.action !== action) return false;
      if (!needle) return true;
      return [trade.ticker, trade.name, trade.description, trade.owner, trade.action]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [trades, query, action]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl">Activity</h2>
          <p className="mt-1 text-sm text-muted">{rows.length} disclosed transactions</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ticker or note"
          className="w-full rounded-full border border-line bg-panel px-4 py-2 text-sm text-cream placeholder:text-muted sm:w-72"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setAction(item)}
            className={`rounded-full px-3 py-1 text-xs uppercase tracking-wide ${
              action === item ? "bg-cream text-ink" : "border border-line text-muted"
            }`}
          >
            {item === "all" ? "All" : ACTION_LABEL[item]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-3xl border border-line bg-panel/80">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-3 text-left font-medium">Trade</th>
              <th className="px-3 py-3 text-left font-medium">Filed</th>
              <th className="px-3 py-3 text-left font-medium">Symbol</th>
              <th className="px-3 py-3 text-left font-medium">Action</th>
              <th className="px-3 py-3 text-right font-medium">Shares</th>
              <th className="px-3 py-3 text-right font-medium">Entry / exit</th>
              <th className="px-3 py-3 text-left font-medium">Range</th>
              <th className="px-3 py-3 text-left font-medium">Filing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trade) => (
              <tr key={trade.id} className="border-b border-line/70 align-top">
                <td className="px-3 py-3">
                  <div>{prettyDate(trade.transactionDate)}</div>
                  <div className="text-xs text-muted">{OWNER_LABEL[trade.owner]}</div>
                </td>
                <td className="px-3 py-3 text-muted">{prettyDate(trade.filingDate)}</td>
                <td className="px-3 py-3">
                  <div className="font-mono">{trade.ticker ?? "—"}</div>
                  <div className="max-w-[220px] truncate text-xs text-muted">{trade.name}</div>
                </td>
                <td className="px-3 py-3 text-gold">{ACTION_LABEL[trade.action]}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {trade.shares == null ? "—" : shares(trade.shares)}
                  {trade.sharesEstimated ? <span className="block text-xs text-muted">estimated</span> : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{price(trade.price)}</td>
                <td className="px-3 py-3 text-muted">{trade.amountLabel}</td>
                <td className="px-3 py-3">
                  <a href={trade.pdfUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                    {trade.docId}
                  </a>
                  {trade.description ? <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{cleanNote(trade.description)}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="px-4 py-8 text-sm text-muted">No trades match that filter.</p> : null}
      </div>
    </div>
  );
}
