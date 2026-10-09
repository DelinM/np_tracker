"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, prettyDate, signedMoney, signedPct, tone } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { MemberCard } from "@/lib/politicians";

type SortKey = "value" | "yearly" | "office";
type View = "cards" | "table";

function officeLine(member: MemberCard, copy: { house: string; senate: string; president: string }) {
  const chamber = member.chamber === "senate" ? copy.senate : member.chamber === "executive" ? copy.president : copy.house;
  return [chamber, member.district, member.party].filter(Boolean).join(" · ");
}

function yearsLabel(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

export function Directory({ cards }: { cards: MemberCard[] }) {
  const { locale, copy } = useI18n();
  const [sort, setSort] = useState<SortKey>("value");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("cards");

  function choose(next: SortKey) {
    if (sort === next) {
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(next);
    setDirection("desc");
  }

  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = needle
      ? cards.filter((card) => `${card.name} ${card.nameZh}`.toLowerCase().includes(needle))
      : cards;
    const valueOf = (card: MemberCard) => {
      if (sort === "value") return card.marketValue;
      if (sort === "yearly") return card.yearlyProfitPct;
      return card.yearsInOffice;
    };
    return [...visible].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      if (left == null && right == null) return a.name.localeCompare(b.name);
      if (left == null) return 1;
      if (right == null) return -1;
      const delta = direction === "desc" ? right - left : left - right;
      return delta || a.name.localeCompare(b.name);
    });
  }, [cards, direction, query, sort]);

  const chips: Array<{ id: SortKey; label: string }> = [
    { id: "value", label: copy.sortMarket },
    { id: "yearly", label: copy.sortYearly },
    { id: "office", label: copy.sortOffice },
  ];
  const views: Array<{ id: View; label: string }> = [
    { id: "cards", label: copy.viewCards },
    { id: "table", label: copy.viewTable },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block sm:min-w-64">
          <span className="sr-only">{copy.searchLabel}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="w-full rounded-full border border-line bg-panel/80 px-4 py-2 text-sm text-cream outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-line bg-panel/80 p-1" role="group" aria-label={copy.sortMarket}>
            {chips.map((chip) => {
              const active = sort === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(chip.id)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active ? "bg-cream text-ink" : "text-muted hover:text-cream"
                  }`}
                >
                  {chip.label}
                  {active ? (direction === "desc" ? " ↓" : " ↑") : ""}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 rounded-full border border-line bg-panel/80 p-1" role="group" aria-label={copy.viewCards}>
            {views.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(item.id)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active ? "bg-cream text-ink" : "text-muted hover:text-cream"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted">{copy.noNameMatches}</p>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {ordered.map((member) => (
            <MemberCardView key={member.slug} member={member} locale={locale} />
          ))}
        </div>
      ) : (
        <MemberTable members={ordered} locale={locale} />
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/25 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">{label}</p>
      <div className="mt-1 text-base font-medium tabular-nums text-cream">{children}</div>
    </div>
  );
}

function MemberCardView({ member, locale }: { member: MemberCard; locale: "en" | "zh" }) {
  const { copy } = useI18n();
  const name = locale === "zh" ? member.nameZh : member.name;
  return (
    <article className="rounded-3xl border border-line bg-panel/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <img
            src={`/portraits/${member.slug}.jpg`}
            alt={name}
            className="h-24 w-20 shrink-0 rounded-2xl object-cover object-top ring-1 ring-line"
          />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold">{officeLine(member, copy)}</p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight">
              <Link href={`/${member.slug}`} className="hover:text-gold">
                {name}
              </Link>
            </h2>
          </div>
        </div>
        <Link href={`/${member.slug}`} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-cream">
          {copy.openBook}
        </Link>
      </div>
      {member.ready ? (
        <Link href={`/${member.slug}`} className="mt-5 grid grid-cols-2 gap-2">
          <div className="col-span-2 rounded-2xl bg-black/25 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">{copy.marketValue}</p>
            <p className="mt-1 font-serif text-3xl tabular-nums text-cream">{money(member.marketValue ?? 0)}</p>
          </div>
          <Stat label={copy.statToday}>
            <span className={tone(member.dayChange)}>
              {signedMoney(member.dayChange ?? 0)}
              <span className="mt-0.5 block text-sm">{signedPct(member.dayChangePct)}</span>
            </span>
          </Stat>
          <Stat label={copy.yearlyProfit}>
            <span className={tone(member.yearlyProfitPct)}>{signedPct(member.yearlyProfitPct)}</span>
          </Stat>
          <Stat label={copy.activeYearsLabel}>{yearsLabel(member.activeYears)}</Stat>
          <Stat label={copy.yearsInOffice}>{yearsLabel(member.yearsInOffice)}</Stat>
          <Stat label={copy.positions}>{member.positions ?? "—"}</Stat>
          <Stat label={copy.latestFiling}>{prettyDate(member.lastFiling, locale)}</Stat>
        </Link>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="col-span-2 rounded-2xl bg-black/25 px-3 py-3 text-sm text-muted">{copy.notReady}</div>
          <Stat label={copy.yearsInOffice}>{yearsLabel(member.yearsInOffice)}</Stat>
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">{copy.recentTitle}</p>
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
}

function MemberTable({ members, locale }: { members: MemberCard[]; locale: "en" | "zh" }) {
  const { copy } = useI18n();
  return (
    <div className="overflow-x-auto rounded-3xl border border-line">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="bg-black/30 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
          <tr>
            <th className="px-4 py-3 font-semibold">{copy.nameColumn}</th>
            <th className="px-3 py-3 font-semibold">{copy.marketValue}</th>
            <th className="px-3 py-3 font-semibold">{copy.statToday}</th>
            <th className="px-3 py-3 font-semibold">{copy.yearlyProfit}</th>
            <th className="px-3 py-3 font-semibold">{copy.activeYearsLabel}</th>
            <th className="px-3 py-3 font-semibold">{copy.yearsInOffice}</th>
            <th className="px-3 py-3 font-semibold">{copy.positions}</th>
            <th className="px-3 py-3 font-semibold">{copy.latestFiling}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const name = locale === "zh" ? member.nameZh : member.name;
            return (
              <tr key={member.slug} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/${member.slug}`} className="flex items-center gap-3 hover:text-gold">
                    <img src={`/portraits/${member.slug}.jpg`} alt="" className="h-12 w-10 rounded-lg object-cover object-top" />
                    <span>
                      <span className="block font-medium text-cream">{name}</span>
                      <span className="text-xs text-muted">{officeLine(member, copy)}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 tabular-nums">{member.ready ? money(member.marketValue ?? 0) : "—"}</td>
                <td className={`px-3 py-3 tabular-nums ${tone(member.dayChange)}`}>
                  {member.ready ? (
                    <>
                      {signedMoney(member.dayChange ?? 0)}
                      <span className="block text-xs">{signedPct(member.dayChangePct)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`px-3 py-3 tabular-nums ${tone(member.yearlyProfitPct)}`}>
                  {member.ready ? signedPct(member.yearlyProfitPct) : "—"}
                </td>
                <td className="px-3 py-3 tabular-nums">{member.ready ? yearsLabel(member.activeYears) : "—"}</td>
                <td className="px-3 py-3 tabular-nums">{yearsLabel(member.yearsInOffice)}</td>
                <td className="px-3 py-3 tabular-nums">{member.ready ? member.positions : "—"}</td>
                <td className="px-3 py-3 tabular-nums">{member.ready ? prettyDate(member.lastFiling, locale) : copy.notReady}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
