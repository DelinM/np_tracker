import roster from "@/data/members.json";
import type { TradeAction } from "@/lib/types";

export type Politician = {
  slug: string;
  last: string;
  first: string;
  name: string;
  nameZh: string;
  chamber: "house" | "senate";
  district: string;
  party: string;
};

export const politicians = roster as Politician[];

export function politicianBySlug(slug: string) {
  return politicians.find((member) => member.slug === slug) ?? null;
}

export type ActiveTrade = {
  ticker: string | null;
  name: string;
  count: number;
  latest: string;
  action: TradeAction;
};

export type MemberCard = Politician & {
  marketValue: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  positions: number | null;
  lastFiling: string | null;
  ready: boolean;
  active: ActiveTrade[];
};
