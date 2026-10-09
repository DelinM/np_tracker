"use client";

import Link from "next/link";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PortfolioChart } from "@/components/PortfolioChart";
import { cleanNote, money, prettyDate, price, shares, signedMoney, signedPct, tone } from "@/lib/format";
import { translateWarning, useI18n } from "@/lib/i18n";
import type { Snapshot } from "@/lib/types";

function Stat({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={`mt-1 font-serif text-2xl tabular-nums sm:text-3xl ${className ?? "text-cream"}`}>{value}</p>
      {detail ? <p className={`mt-1 text-sm tabular-nums ${className ?? "text-muted"}`}>{detail}</p> : null}
    </div>
  );
}

export function Dashboard({ snapshot, base }: { snapshot: Snapshot; base: string }) {
  const { locale, copy } = useI18n();
  const { summary, holdings, history, options, other, trades, warnings } = snapshot;
  const recent = trades.slice(0, 6);
  const date = (iso: string | null) => prettyDate(iso, locale);

  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-muted">{copy.marketValue}</p>
        <p className="mt-2 break-words font-serif text-4xl tracking-tight tabular-nums sm:text-7xl">
          {money(summary.marketValue)}
        </p>
        <p className={`mt-3 text-lg tabular-nums ${tone(summary.dayChange)}`}>
          {signedMoney(summary.dayChange)} <span className="text-base">{signedPct(summary.dayChangePct)}</span>
          <span className="ml-2 text-sm text-muted">{copy.today}</span>
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Stat
            label={copy.unrealized}
            value={signedMoney(summary.unrealized)}
            detail={signedPct(summary.unrealizedPct)}
            className={tone(summary.unrealized)}
          />
          <Stat label={copy.realized} value={signedMoney(summary.realized)} className={tone(summary.realized)} />
          <Stat
            label={copy.totalProfit}
            value={signedMoney(summary.totalPnl)}
            detail={signedPct(summary.totalPnlPct)}
            className={tone(summary.totalPnl)}
          />
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">{copy.openPositions}</dt>
          <dd className="mt-1 text-lg tabular-nums">{summary.positions}</dd>
        </div>
        <div>
          <dt className="text-muted">{copy.costBasis}</dt>
          <dd className="mt-1 text-lg tabular-nums">{money(summary.costBasis)}</dd>
        </div>
        <div>
          <dt className="text-muted">{copy.firstTrade}</dt>
          <dd className="mt-1 text-lg">{date(summary.firstTrade)}</dd>
        </div>
        <div>
          <dt className="text-muted">{copy.latestFiling}</dt>
          <dd className="mt-1 text-lg">{date(summary.lastFiling)}</dd>
        </div>
      </dl>

      <PortfolioChart history={history} />

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-serif text-3xl">{copy.positions}</h2>
          <p className="text-sm text-muted">{copy.filingsParsed(summary.filings)}</p>
        </div>
        <HoldingsTable holdings={holdings} base={base} />
      </section>

      {options.length ? (
        <section>
          <h2 className="mb-4 font-serif text-3xl">{copy.openOptions}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <div key={`${option.ticker}-${option.strike}-${option.expiry}-${option.opened}`} className="rounded-2xl border border-line bg-panel/80 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-sm">{option.ticker}</p>
                  <p className="text-xs uppercase tracking-wide text-gold">
                    {option.right === "call" ? copy.call : option.right === "put" ? copy.put : copy.option}
                  </p>
                </div>
                <p className="mt-2 text-lg tabular-nums">
                  {copy.contracts(option.contracts)}
                  {option.strike != null ? ` @ ${price(option.strike)}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {option.expiry ? copy.expires(date(option.expiry)) : copy.expiryUnknown} · {copy.owners[option.owner]} · {copy.opened(date(option.opened))}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-serif text-3xl">{copy.recent}</h2>
          <Link href={`${base}/activity`} className="text-sm text-gold hover:underline">
            {copy.fullBlotter}
          </Link>
        </div>
        <ol className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-panel/80">
          {recent.map((trade) => (
            <li key={trade.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_88px_1fr_auto] sm:items-center">
              <div>
                <p className="text-sm">{date(trade.transactionDate)}</p>
                <p className="text-xs text-muted">{copy.filed} {date(trade.filingDate)}</p>
              </div>
              <p className="font-mono text-sm">{trade.ticker ?? "—"}</p>
              <div>
                <p className="text-sm">
                  <span className="text-gold">{copy.actions[trade.action]}</span>
                  <span className="text-muted"> · {copy.owners[trade.owner]}</span>
                  {trade.shares != null ? <span className="text-muted"> · {shares(trade.shares)} {copy.sharesShort}</span> : null}
                </p>
                <p className="truncate text-xs text-muted">{cleanNote(trade.description) || trade.name}</p>
              </div>
              <a href={trade.pdfUrl} className="text-xs text-muted hover:text-cream" target="_blank" rel="noreferrer">
                PDF
              </a>
            </li>
          ))}
        </ol>
      </section>

      {other.length ? (
        <section>
          <h2 className="mb-3 font-serif text-3xl">{copy.outside}</h2>
          <p className="mb-4 max-w-2xl text-sm text-muted">{copy.outsideNote}</p>
          <ul className="space-y-2 text-sm">
            {other.slice(0, 8).map((item) => (
              <li key={item.pdfUrl + item.date + item.name} className="flex flex-wrap justify-between gap-2 border-b border-line py-2">
                <span>
                  {date(item.date)} · {item.name}
                </span>
                <span className="text-muted">{item.amountLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length ? (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer text-cream">{copy.notes(warnings.length)}</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{translateWarning(warning, locale)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
