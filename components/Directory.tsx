"use client";

import Link from "next/link";
import { money, prettyDate, signedMoney, signedPct, tone } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { MemberCard } from "@/lib/politicians";

export function Directory({ cards }: { cards: MemberCard[] }) {
  const { locale, copy } = useI18n();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((member) => {
        const name = locale === "zh" ? member.nameZh : member.name;
        return (
          <article
            key={member.slug}
            className="rounded-3xl border border-line bg-panel/80 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gold">
                  {member.chamber === "senate" ? copy.senate : copy.house} · {member.district} · {member.party}
                </p>
                <h2 className="mt-2 font-serif text-3xl tracking-tight">
                  <Link href={`/${member.slug}`} className="hover:text-gold">
                    {name}
                  </Link>
                </h2>
              </div>
              <Link
                href={`/${member.slug}`}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-cream"
              >
                {copy.openBook}
              </Link>
            </div>
            {member.ready ? (
              <Link href={`/${member.slug}`} className="mt-6 block">
                <p className="font-serif text-3xl tabular-nums">{money(member.marketValue ?? 0)}</p>
                <p className={`mt-1 text-sm tabular-nums ${tone(member.dayChange)}`}>
                  {signedMoney(member.dayChange ?? 0)} {signedPct(member.dayChangePct)}
                </p>
                <p className="mt-3 text-sm text-muted">
                  {member.positions} {copy.positions.toLowerCase()} · {copy.latestFiling}{" "}
                  {prettyDate(member.lastFiling, locale)}
                </p>
              </Link>
            ) : (
              <p className="mt-6 text-sm text-muted">{copy.notReady}</p>
            )}
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{copy.recentTitle}</p>
              {member.active.length ? (
                <ul className="mt-3 space-y-2">
                  {member.active.map((trade) => {
                    const label = trade.ticker || trade.name;
                    const query = trade.ticker || trade.name;
                    return (
                      <li key={`${member.slug}-${label}`}>
                        <Link
                          href={`/${member.slug}/activity?ticker=${encodeURIComponent(query)}`}
                          className="flex items-baseline justify-between gap-3 text-sm hover:text-gold"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-cream">{label}</span>
                            <span className="ml-2 text-muted">{copy.actions[trade.action]}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {copy.recentCount(trade.count)} · {prettyDate(trade.latest, locale)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">{copy.recentNone}</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
