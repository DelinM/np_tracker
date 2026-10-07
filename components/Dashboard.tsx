import Link from "next/link";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PortfolioChart } from "@/components/PortfolioChart";
import { ACTION_LABEL, OWNER_LABEL, cleanNote, money, prettyDate, price, shares, signedMoney, signedPct, tone } from "@/lib/format";
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

export function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const { summary, holdings, history, options, other, trades, warnings } = snapshot;
  const recent = trades.slice(0, 6);

  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-muted">Disclosed market value</p>
        <p className="mt-2 font-serif text-5xl tracking-tight tabular-nums sm:text-7xl">
          {money(summary.marketValue)}
        </p>
        <p className={`mt-3 text-lg tabular-nums ${tone(summary.dayChange)}`}>
          {signedMoney(summary.dayChange)} <span className="text-base">{signedPct(summary.dayChangePct)}</span>
          <span className="ml-2 text-sm text-muted">today</span>
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Stat
            label="Unrealized"
            value={signedMoney(summary.unrealized)}
            detail={signedPct(summary.unrealizedPct)}
            className={tone(summary.unrealized)}
          />
          <Stat label="Realized" value={signedMoney(summary.realized)} className={tone(summary.realized)} />
          <Stat
            label="Total profit"
            value={signedMoney(summary.totalPnl)}
            detail={signedPct(summary.totalPnlPct)}
            className={tone(summary.totalPnl)}
          />
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Open positions</dt>
          <dd className="mt-1 text-lg tabular-nums">{summary.positions}</dd>
        </div>
        <div>
          <dt className="text-muted">Cost basis</dt>
          <dd className="mt-1 text-lg tabular-nums">{money(summary.costBasis)}</dd>
        </div>
        <div>
          <dt className="text-muted">First tracked trade</dt>
          <dd className="mt-1 text-lg">{prettyDate(summary.firstTrade)}</dd>
        </div>
        <div>
          <dt className="text-muted">Latest filing</dt>
          <dd className="mt-1 text-lg">{prettyDate(summary.lastFiling)}</dd>
        </div>
      </dl>

      <PortfolioChart history={history} />

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-serif text-3xl">Positions</h2>
          <p className="text-sm text-muted">{summary.filings} filings parsed</p>
        </div>
        <HoldingsTable holdings={holdings} />
      </section>

      {options.length ? (
        <section>
          <h2 className="mb-4 font-serif text-3xl">Open options</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <div key={`${option.ticker}-${option.strike}-${option.expiry}-${option.opened}`} className="rounded-2xl border border-line bg-panel/80 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-sm">{option.ticker}</p>
                  <p className="text-xs uppercase tracking-wide text-gold">{option.right ?? "option"}</p>
                </div>
                <p className="mt-2 text-lg tabular-nums">
                  {option.contracts} contracts
                  {option.strike != null ? ` @ ${price(option.strike)}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {option.expiry ? `Expires ${prettyDate(option.expiry)}` : "Expiry not stated"} · {OWNER_LABEL[option.owner]} · opened {prettyDate(option.opened)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-serif text-3xl">Recent activity</h2>
          <Link href="/activity" className="text-sm text-gold hover:underline">
            Full blotter
          </Link>
        </div>
        <ol className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-panel/80">
          {recent.map((trade) => (
            <li key={trade.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_88px_1fr_auto] sm:items-center">
              <div>
                <p className="text-sm">{prettyDate(trade.transactionDate)}</p>
                <p className="text-xs text-muted">Filed {prettyDate(trade.filingDate)}</p>
              </div>
              <p className="font-mono text-sm">{trade.ticker ?? "—"}</p>
              <div>
                <p className="text-sm">
                  <span className="text-gold">{ACTION_LABEL[trade.action]}</span>
                  <span className="text-muted"> · {OWNER_LABEL[trade.owner]}</span>
                  {trade.shares != null ? <span className="text-muted"> · {shares(trade.shares)} sh</span> : null}
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
          <h2 className="mb-3 font-serif text-3xl">Outside the priced book</h2>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            These disclosures have no listed ticker, so they are not marked to market.
          </p>
          <ul className="space-y-2 text-sm">
            {other.slice(0, 8).map((item) => (
              <li key={item.pdfUrl + item.date + item.name} className="flex flex-wrap justify-between gap-2 border-b border-line py-2">
                <span>
                  {prettyDate(item.date)} · {item.name}
                </span>
                <span className="text-muted">{item.amountLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length ? (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer text-cream">Reconstruction notes ({warnings.length})</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
