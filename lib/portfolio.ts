import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ActiveTrade, MemberCard } from "./politicians";
import { politicianBySlug, politicians } from "./politicians";
import type { Snapshot, Trade } from "./types";

export type { MemberCard };

function snapshotFile(slug: string) {
  return path.join(process.cwd(), "data", "politicians", slug, "snapshot.json");
}

export function loadSnapshot(slug: string): Snapshot | null {
  if (!politicianBySlug(slug)) return null;
  const file = snapshotFile(slug);
  if (!existsSync(file)) return null;
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const filings = new Map(snapshot.trades.map((trade) => [trade.id, trade.pdfUrl]));
  snapshot.holdings = snapshot.holdings.map((holding) => {
    const lots = holding.lots.map((lot) => ({
      ...lot,
      pdfUrl: lot.pdfUrl || filings.get(lot.tradeId) || null,
    }));
    const latest = lots.reduce<(typeof lots)[number] | null>(
      (best, lot) => (!best || lot.date > best.date ? lot : best),
      null,
    );
    return {
      ...holding,
      lots,
      latestBuy: holding.latestBuy || latest?.date || null,
      sourceUrl: holding.sourceUrl || latest?.pdfUrl || null,
    };
  });
  return snapshot;
}

function yearsBetween(firstTrade: string | null, asOf: string | null) {
  if (!firstTrade || !asOf) return null;
  const start = Date.parse(`${firstTrade}T12:00:00Z`);
  const end = Date.parse(asOf);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.max((end - start) / (365.25 * 24 * 60 * 60 * 1000), 1 / 12);
}

function activeTrades(trades: Trade[]): ActiveTrade[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  const start = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, ActiveTrade>();
  for (const trade of trades) {
    if (!trade.transactionDate || trade.transactionDate < start || trade.transactionDate > today) continue;
    const key = trade.ticker || trade.name;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ticker: trade.ticker,
        name: trade.name,
        count: 1,
        latest: trade.transactionDate,
        action: trade.action,
      });
      continue;
    }
    current.count += 1;
    if (trade.transactionDate >= current.latest) {
      current.latest = trade.transactionDate;
      current.action = trade.action;
    }
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
  const newest = [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest) || b.count - a.count)[0];
  if (!newest) return [];
  const key = (trade: ActiveTrade) => trade.ticker || trade.name;
  return [newest, ...ranked.filter((trade) => key(trade) !== key(newest))].slice(0, 5);
}

export function loadCards(): MemberCard[] {
  return politicians.map((member) => {
    const snapshot = loadSnapshot(member.slug);
    const activeYears = yearsBetween(snapshot?.summary.firstTrade ?? null, snapshot?.asOf ?? null);
    const totalPnlPct = snapshot?.summary.totalPnlPct ?? null;
    return {
      ...member,
      marketValue: snapshot?.summary.marketValue ?? null,
      dayChange: snapshot?.summary.dayChange ?? null,
      dayChangePct: snapshot?.summary.dayChangePct ?? null,
      positions: snapshot?.summary.positions ?? null,
      lastFiling: snapshot?.summary.lastFiling ?? null,
      totalPnlPct,
      yearlyProfitPct: totalPnlPct != null && activeYears ? totalPnlPct / activeYears : null,
      activeYears,
      yearsInOffice: yearsBetween(member.officeStart, snapshot?.asOf ?? new Date().toDateString()),
      ready: Boolean(snapshot),
      active: snapshot ? activeTrades(snapshot.trades) : [],
    };
  });
}
