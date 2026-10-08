export type Owner = "self" | "spouse" | "joint" | "dependent";

export type TradeAction =
  | "buy"
  | "sell"
  | "exercise"
  | "option"
  | "transfer"
  | "receive"
  | "exchange"
  | "other";

export type Lot = {
  date: string;
  shares: number;
  price: number;
  cost: number;
  owner: Owner;
  note: string;
  tradeId: string;
  pdfUrl?: string | null;
};

export type Holding = {
  ticker: string;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  price: number | null;
  prevClose: number | null;
  marketValue: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  weight: number | null;
  owners: Owner[];
  lots: Lot[];
  latestBuy?: string | null;
  sourceUrl?: string | null;
};

export type HistoryPoint = {
  date: string;
  value: number;
  cost: number;
  pnl: number;
};

export type Realized = {
  ticker: string;
  name: string;
  date: string;
  shares: number;
  proceeds: number;
  cost: number;
  pnl: number;
  reason: "sale" | "transfer";
  tradeId: string;
};

export type OptionPosition = {
  ticker: string;
  name: string;
  right: "call" | "put" | null;
  strike: number | null;
  expiry: string | null;
  contracts: number;
  owner: Owner;
  opened: string;
  premium: number;
};

export type Trade = {
  id: string;
  docId: string;
  pdfUrl: string;
  filingDate: string;
  transactionDate: string;
  owner: Owner;
  ticker: string | null;
  name: string;
  assetType: string | null;
  action: TradeAction;
  amountLabel: string;
  description: string;
  shares: number | null;
  sharesEstimated: boolean;
  price: number | null;
  extent: "full" | "partial" | null;
};

export type OtherAsset = {
  date: string;
  name: string;
  amountLabel: string;
  description: string;
  pdfUrl: string;
  owner: Owner;
};

export type Filing = {
  docId: string;
  year: number;
  filingDate: string;
  stateDst: string;
  pdfUrl: string;
  status: string;
  tradeCount: number;
};

export type Snapshot = {
  generatedAt: string;
  asOf: string;
  member: { name: string; nameZh?: string; slug?: string; district: string; chamber: string; party?: string };
  source: { name: string; url: string };
  summary: {
    marketValue: number;
    costBasis: number;
    unrealized: number;
    unrealizedPct: number | null;
    realized: number;
    totalPnl: number;
    totalPnlPct: number | null;
    dayChange: number;
    dayChangePct: number | null;
    positions: number;
    trades: number;
    filings: number;
    firstTrade: string | null;
    lastFiling: string | null;
    deployed: number;
  };
  history: HistoryPoint[];
  holdings: Holding[];
  realized: Realized[];
  options: OptionPosition[];
  other: OtherAsset[];
  trades: Trade[];
  filings: Filing[];
  warnings: string[];
};
