"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { prettyDate } from "@/lib/format";
import { LOCALE_COOKIE, type Locale } from "@/lib/locale";
import type { Owner, TradeAction } from "@/lib/types";

export type { Locale };

type Copy = {
  brand: string;
  member: string;
  chamber: string;
  sourceName: string;
  marked: (date: string) => string;
  nav: { portfolio: string; activity: string };
  language: string;
  directoryEyebrow: string;
  directoryTitle: string;
  directoryNote: string;
  openBook: string;
  notReady: string;
  recentTitle: string;
  recentNone: string;
  recentCount: (count: number) => string;
  alertsIncludesTitle: string;
  alertsIncludes: string[];
  house: string;
  senate: string;
  allMembers: string;
  alerts: string;
  sortValue: string;
  sortPurchase: string;
  filingLink: string;
  newest: string;
  oldest: string;
  alertsTitle: string;
  alertsLead: string;
  phoneLabel: string;
  phonePlaceholder: string;
  openBot: string;
  botMissing: string;
  checkBot: string;
  linked: string;
  notLinked: string;
  marketValue: string;
  today: string;
  unrealized: string;
  realized: string;
  totalProfit: string;
  openPositions: string;
  costBasis: string;
  firstTrade: string;
  latestFiling: string;
  positions: string;
  filingsParsed: (count: number) => string;
  openOptions: string;
  option: string;
  call: string;
  put: string;
  contracts: (count: number) => string;
  expires: (date: string) => string;
  expiryUnknown: string;
  opened: (date: string) => string;
  recent: string;
  fullBlotter: string;
  filed: string;
  sharesShort: string;
  outside: string;
  outsideNote: string;
  notes: (count: number) => string;
  noPositions: string;
  position: string;
  shares: string;
  avgCost: string;
  last: string;
  day: string;
  value: string;
  return: string;
  weight: string;
  openLots: string;
  allFilings: (ticker: string) => string;
  cost: string;
  activity: string;
  transactions: (count: number) => string;
  search: string;
  all: string;
  actions: Record<TradeAction, string>;
  owners: Record<Owner, string>;
  trade: string;
  symbol: string;
  action: string;
  entryExit: string;
  range: string;
  filing: string;
  estimated: string;
  noMatches: string;
  chartValue: string;
  chartProfit: string;
  ranges: { "1M": string; "3M": string; YTD: string; "1Y": string; ALL: string };
  profitTip: string;
  valueCaption: string;
  profitCaption: string;
  noHistory: string;
  footerLead: string;
  footerBody: string;
  title: string;
};

const en: Copy = {
  brand: "Disclosed book",
  member: "Nancy Pelosi",
  chamber: "U.S. House",
  sourceName: "Clerk of the House of Representatives",
  marked: (date) => `marked ${date}`,
  nav: { portfolio: "Portfolio", activity: "Activity" },
  language: "Language",
  directoryEyebrow: "Disclosed books",
  directoryTitle: "Choose a member",
  directoryNote: "Each book is rebuilt from that member's official periodic transaction reports.",
  openBook: "Open book",
  notReady: "Filings are still being pulled.",
  recentTitle: "Most active, past 2 months",
  recentNone: "No disclosed trades in the past 2 months.",
  recentCount: (count) => `${count} trades`,
  alertsIncludesTitle: "What the message includes",
  alertsIncludes: [
    "A heading, “New disclosed trades”, then the member’s name.",
    "Each new trade on its own line: transaction date, action (buy, sell, exercise, option, transfer, receive, or other), ticker, share count, and price.",
    "When the filing states a share count, that count is used. Otherwise the count is the midpoint of the dollar range divided by that day's closing price, and the line says “about”.",
    "The price is that day's closing price. Options show the contract count, strike, expiration, and an estimated premium per contract from the midpoint of the range.",
    "The disclosed dollar range stays on that line. The official filing link is on the next line.",
    "At most 12 trades for each member. Any further trades are a single count, and the message stops at 4,000 characters.",
    "No profit and no phone number.",
    "The first saved book for a member does not send an alert. Later pulls send only trades that were not already in the saved file.",
    "Messages go to Telegram chats that have tapped Start, after the 9:00, 12:00, and 3:30 ET pulls.",
  ],
  house: "House",
  senate: "Senate",
  allMembers: "All members",
  alerts: "Alerts",
  sortValue: "Market value",
  sortPurchase: "Latest purchase",
  filingLink: "Filing",
  newest: "Newest",
  oldest: "Oldest",
  alertsTitle: "Telegram alerts",
  alertsLead:
    "Enter your mobile number, then open the bot and tap Start. Telegram cannot message a number until you do that. New disclosed trades are sent after the 9:00, 12:00, and 3:30 ET pulls.",
  phoneLabel: "Mobile number",
  phonePlaceholder: "+1 555 0100",
  openBot: "Open Telegram",
  botMissing: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME before alerts can be delivered.",
  checkBot: "I've tapped Start",
  linked: "This chat is registered. New trades will be sent there.",
  notLinked: "The bot has not seen this registration yet. Open Telegram, tap Start, then check again.",
  marketValue: "Disclosed market value",
  today: "today",
  unrealized: "Unrealized",
  realized: "Realized",
  totalProfit: "Total profit",
  openPositions: "Open positions",
  costBasis: "Cost basis",
  firstTrade: "First tracked trade",
  latestFiling: "Latest filing",
  positions: "Positions",
  filingsParsed: (count) => `${count} filings parsed`,
  openOptions: "Open options",
  option: "option",
  call: "call",
  put: "put",
  contracts: (count) => `${count} contracts`,
  expires: (date) => `Expires ${date}`,
  expiryUnknown: "Expiry not stated",
  opened: (date) => `opened ${date}`,
  recent: "Recent activity",
  fullBlotter: "Full blotter",
  filed: "Filed",
  sharesShort: "sh",
  outside: "Outside the priced book",
  outsideNote: "These disclosures have no listed ticker, so they are not marked to market.",
  notes: (count) => `Reconstruction notes (${count})`,
  noPositions: "No open stock positions could be reconstructed from the filings.",
  position: "Position",
  shares: "Shares",
  avgCost: "Avg cost",
  last: "Last",
  day: "Day",
  value: "Value",
  return: "Return",
  weight: "Weight",
  openLots: "Open lots",
  allFilings: (ticker) => `All ${ticker} filings`,
  cost: "cost",
  activity: "Activity",
  transactions: (count) => `${count} disclosed transactions`,
  search: "Search ticker or note",
  all: "All",
  actions: {
    buy: "Buy",
    sell: "Sell",
    exercise: "Exercise",
    option: "Option",
    transfer: "Transfer",
    receive: "Receive",
    exchange: "Exchange",
    other: "Other",
  },
  owners: { self: "Member", spouse: "Spouse", joint: "Joint", dependent: "Dependent" },
  trade: "Trade",
  symbol: "Symbol",
  action: "Action",
  entryExit: "Entry / exit",
  range: "Range",
  filing: "Filing",
  estimated: "estimated",
  noMatches: "No trades match that filter.",
  chartValue: "Value",
  chartProfit: "Profit",
  ranges: { "1M": "1M", "3M": "3M", YTD: "YTD", "1Y": "1Y", ALL: "ALL" },
  profitTip: "Profit",
  valueCaption: "Solid line is market value. Dashed line is remaining cost basis.",
  profitCaption: "Profit is unrealized gain on that day plus gains already realized.",
  noHistory: "Not enough priced history yet.",
  footerLead: "Built from public",
  footerBody:
    "periodic transaction reports. Filings report dollar ranges, not a brokerage blotter, and they can arrive weeks after the trade. Share counts use the filing text when it states them; otherwise they are estimated from the midpoint of the range. A trade restated on a later report is counted once. This is a personal reconstruction, not an official account.",
  title: "Pelosi Portfolio",
};

const zh: Copy = {
  brand: "披露持仓",
  member: "南希·佩洛西",
  chamber: "美国众议院",
  sourceName: "美国众议院书记官",
  marked: (date) => `截至 ${date}`,
  nav: { portfolio: "持仓", activity: "交易" },
  language: "语言",
  directoryEyebrow: "披露账本",
  directoryTitle: "选择议员",
  directoryNote: "每本账都根据该议员的官方定期交易报告还原。",
  openBook: "打开账本",
  notReady: "申报还在拉取。",
  recentTitle: "近两个月最活跃",
  recentNone: "近两个月没有披露交易。",
  recentCount: (count) => `${count} 笔`,
  alertsIncludesTitle: "提醒里有什么",
  alertsIncludes: [
    "标题是 “New disclosed trades”，下面是议员姓名。",
    "每笔新交易一行：交易日期、动作（buy、sell、exercise、option、transfer、receive 或 other）、代码、股数和价格。",
    "申报写明股数时用该股数。否则用金额区间的中点除以当天收盘价，行内会写 “about”。",
    "价格是当天收盘价。期权写合约张数、行权价、到期日，以及用金额区间中点估算的每张权利金。",
    "申报金额区间在同一行，官方申报链接在下一行。",
    "每位议员最多 12 笔。多出来的只报剩余笔数，整条消息在 4,000 字处截断。",
    "不含收益或手机号。",
    "某位议员第一次存档不会发提醒。之后的拉取只发送上次文件里没有的交易。",
    "消息发给已经点过开始的 Telegram 对话，在美东时间 9:00、12:00 和 15:30 的拉取之后发出。",
  ],
  house: "众议院",
  senate: "参议院",
  allMembers: "全部议员",
  alerts: "提醒",
  sortValue: "市值",
  sortPurchase: "最近买入",
  filingLink: "申报原文",
  newest: "最新",
  oldest: "最早",
  alertsTitle: "Telegram 提醒",
  alertsLead:
    "填写手机号，然后打开机器人并点开始。在你点开始之前，Telegram 无法按号码发消息。新披露的交易会在美东时间 9:00、12:00 和 15:30 的拉取之后发出。",
  phoneLabel: "手机号",
  phonePlaceholder: "+1 555 0100",
  openBot: "打开 Telegram",
  botMissing: "请先配置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_BOT_USERNAME，提醒才能发出。",
  checkBot: "我已点开始",
  linked: "这个对话已登记。之后的新交易会发到这里。",
  notLinked: "机器人还没看到这次登记。请打开 Telegram 点开始，然后再检查一次。",
  marketValue: "披露市值",
  today: "今日",
  unrealized: "未实现",
  realized: "已实现",
  totalProfit: "总收益",
  openPositions: "持仓数",
  costBasis: "成本",
  firstTrade: "最早跟踪交易",
  latestFiling: "最新申报",
  positions: "持仓",
  filingsParsed: (count) => `${count} 份申报已解析`,
  openOptions: "未平仓期权",
  option: "期权",
  call: "看涨",
  put: "看跌",
  contracts: (count) => `${count} 张合约`,
  expires: (date) => `${date} 到期`,
  expiryUnknown: "未披露到期日",
  opened: (date) => `${date} 开仓`,
  recent: "近期交易",
  fullBlotter: "全部记录",
  filed: "申报于",
  sharesShort: "股",
  outside: "未计入市值的资产",
  outsideNote: "这些申报没有上市代码，因此没有按市价计价。",
  notes: (count) => `还原说明（${count}）`,
  noPositions: "无法从申报中还原未平仓股票。",
  position: "标的",
  shares: "股数",
  avgCost: "均价",
  last: "现价",
  day: "当日",
  value: "市值",
  return: "收益",
  weight: "权重",
  openLots: "未平仓批次",
  allFilings: (ticker) => `${ticker} 全部申报`,
  cost: "成本",
  activity: "交易记录",
  transactions: (count) => `${count} 笔披露交易`,
  search: "搜索代码或备注",
  all: "全部",
  actions: {
    buy: "买入",
    sell: "卖出",
    exercise: "行权",
    option: "期权",
    transfer: "转出",
    receive: "获配",
    exchange: "转换",
    other: "其他",
  },
  owners: { self: "本人", spouse: "配偶", joint: "共同", dependent: "受抚养人" },
  trade: "交易",
  symbol: "代码",
  action: "方向",
  entryExit: "进出价",
  range: "金额区间",
  filing: "申报文件",
  estimated: "估算",
  noMatches: "没有符合筛选的交易。",
  chartValue: "市值",
  chartProfit: "收益",
  ranges: { "1M": "1月", "3M": "3月", YTD: "今年", "1Y": "1年", ALL: "全部" },
  profitTip: "收益",
  valueCaption: "实线为市值，虚线为剩余成本。",
  profitCaption: "收益为当日未实现盈亏加上已实现收益。",
  noHistory: "价格历史还不够。",
  footerLead: "根据公开的",
  footerBody:
    "定期交易报告还原。申报给出的是金额区间，不是券商成交回单，而且可能在交易发生数周后才提交。股数优先采用申报正文中写明的数量，否则按区间中值估算。同一笔交易若在后续报告中重述，只计一次。这是个人还原，不是官方账户。",
  title: "佩洛西持仓",
};

const messages: Record<Locale, Copy> = { en, zh };

type LocaleValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  copy: Copy;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  const value = useMemo<LocaleValue>(() => {
    return {
      locale,
      copy: messages[locale],
      setLocale(next) {
        setLocaleState(next);
        document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
        document.title = messages[next].title;
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      },
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used within LocaleProvider");
  return value;
}

export function translateNote(note: string, locale: Locale) {
  if (locale !== "zh" || !note) return note;
  let rest = note;
  let head = "";
  const exercised = rest.match(/^Exercised (calls|puts) at \$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  if (exercised) {
    head = `以 $${exercised[2]} 行权${exercised[1] === "puts" ? "看跌" : "看涨"}期权`;
    rest = rest.slice(exercised[0].length);
  } else if (rest.startsWith("Share count estimated from the disclosed dollar range")) {
    head = "股数按申报金额区间中值估算";
    rest = rest.slice("Share count estimated from the disclosed dollar range".length);
  } else if (rest.startsWith("Disclosed share count")) {
    head = "申报中的股数";
    rest = rest.slice("Disclosed share count".length);
  } else if (rest.startsWith("Received shares; cost set to that day's close")) {
    head = "获配股份；成本按当日收盘价";
    rest = rest.slice("Received shares; cost set to that day's close".length);
  } else if (rest.startsWith("Received shares; cost estimated from the disclosed range")) {
    head = "获配股份；成本按申报金额区间估算";
    rest = rest.slice("Received shares; cost estimated from the disclosed range".length);
  } else {
    return note;
  }
  rest = rest
    .replace(/; cost estimated from the disclosed range/g, "；成本按申报金额区间估算")
    .replace(/, split-adjusted x([0-9.]+)/g, "，已按 $1 倍拆股调整")
    .replace(/, including estimated option premium/g, "，含估算期权权利金");
  return `${head}${rest}`;
}

export function translateWarning(warning: string, locale: Locale) {
  if (locale !== "zh") return warning;
  const dated = warning.match(/^(.+?) (\d{4}-\d{2}-\d{2}): (.+)$/);
  if (dated) {
    const [, ticker, date, body] = dated;
    const when = prettyDate(date, "zh");
    const exit = body.match(
      /^disclosed exit of ([\d,]+) shares exceeds tracked purchases by ([\d,]+)\. Those shares were likely bought before the filing window and are excluded from profit\.$/,
    );
    if (exit) {
      return `${ticker} ${when}：申报卖出 ${exit[1]} 股，超出已跟踪买入 ${exit[2]} 股。这些股份很可能在申报窗口开始前购入，未计入收益。`;
    }
    if (body === "sale could not be sized.") return `${ticker} ${when}：卖出无法确定股数。`;
    if (body === "purchase could not be sized.") return `${ticker} ${when}：买入无法确定股数。`;
    if (body === "spinoff or receipt could not be priced.") return `${ticker} ${when}：分拆或获配无法定价。`;
    const priced = body.match(/^could not price a ([0-9.]+)-share lot\.$/);
    if (priced) return `${ticker} ${when}：无法为 ${priced[1]} 股的持仓定价。`;
    const implausible = body.match(/^ignored an implausible share count of ([\d,]+)\.$/);
    if (implausible) return `${ticker} ${when}：忽略了不合理的股数 ${implausible[1]}。`;
  }
  const unpriced = warning.match(/^(.+) is still on the book but has no current price, so it is left out of the total\.$/);
  if (unpriced) return `${unpriced[1]} 仍在持仓中，但没有现价，因此未计入总市值。`;
  const unread = warning.match(/^Some filings could not be read as text \((.+)\)\.$/);
  if (unread) return `部分申报无法读取文本（${unread[1]}）。`;
  return warning;
}
