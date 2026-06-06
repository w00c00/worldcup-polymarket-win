// Server-side Polymarket client. Gamma and CLOB public market-data endpoints
// do not require a wallet or API key.
import { TEAMS, teamByCode } from "./worldcup";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

export type Outcome = {
  label: string;
  price: number;
  noPrice?: number;
  question?: string;
  url?: string;
  volume?: number;
  liquidity?: number;
  conditionId?: string;
  marketSlug?: string;
  tokenIds?: { yes?: string; no?: string };
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  lastTradePrice?: number;
  enableOrderBook?: boolean;
};
export type Market = {
  id: string;
  platform: "Polymarket";
  title: string;
  slug: string;
  url: string;
  category: string;
  outcomes: Outcome[];
  volume: number;
  liquidity: number;
  volume24hr?: number;
  openInterest?: number;
  endDate?: string;
  image?: string;
  // computed
  heat: number;
  topOutcome?: Outcome;
};

export type MatchOutcomeKey = "home" | "draw" | "away";

export type MatchPolymarket = {
  key: MatchOutcomeKey;
  label: string;
  question: string;
  slug: string;
  url: string;
  conditionId: string;
  price: number;
  noPrice?: number;
  tokenIds: { yes?: string; no?: string };
  volume: number;
  liquidity: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  midpoint?: number;
  lastTradePrice?: number;
  enableOrderBook?: boolean;
};

export type MatchMarketSet = {
  eventId: string;
  eventSlug: string;
  title: string;
  url: string;
  volume: number;
  liquidity: number;
  endDate?: string;
  markets: Partial<Record<MatchOutcomeKey, MatchPolymarket>>;
};

export type OrderBookLevel = { price: number; size: number };

export type OrderBook = {
  market?: string;
  asset_id?: string;
  timestamp?: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  min_order_size?: string;
  tick_size?: string;
  neg_risk?: boolean;
  hash?: string;
};

export type PricePoint = { t: number; p: number };

// Curated set of football-relevant Polymarket event slugs to aggregate.
// More per-match / prop markets list automatically as the tournament nears.
const GROUP_WINNER_SLUGS = Array.from({ length: 12 }, (_, index) =>
  `world-cup-group-${String.fromCharCode(97 + index)}-winner`
);

const WC_EVENT_SLUGS = [
  "world-cup-winner",
  "world-cup-golden-boot-winner",
  "world-cup-top-scorer-nation",
  "world-cup-team-to-advance-to-knockout-stages",
  "world-cup-nation-to-reach-final",
  "will-any-2026-fifa-world-cup-game-scheduled-in-the-us-be-relocated-abroad",
  "fifa-world-cup-2026-winner",
  ...GROUP_WINNER_SLUGS,
];

const WC_DISCOVERY_QUERIES = [
  "2026 FIFA World Cup",
  "World Cup group winner",
  "World Cup Golden Boot",
  "World Cup top scorer",
];

async function getJSON(url: string) {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 120 }, // cache 2 min
  });
  if (!res.ok) throw new Error(`Polymarket ${res.status}`);
  return res.json();
}

function parseArr(s: unknown): string[] {
  try {
    return typeof s === "string" ? JSON.parse(s) : (s as string[]) ?? [];
  } catch {
    return [];
  }
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function tokenIds(market: any): { yes?: string; no?: string } {
  const ids = parseArr(market.clobTokenIds);
  return { yes: ids[0], no: ids[1] };
}

function prices(market: any): { yes: number; no?: number } {
  const labels = parseArr(market.outcomes).map((label) => label.toLowerCase());
  const ps = parseArr(market.outcomePrices).map(Number);
  const yesIndex = labels.findIndex((label) => label === "yes");
  const noIndex = labels.findIndex((label) => label === "no");
  return {
    yes: ps[yesIndex >= 0 ? yesIndex : 0] ?? 0,
    no: ps[noIndex >= 0 ? noIndex : 1],
  };
}

function eventToMarket(ev: any): Market {
  const mkts: any[] = ev.markets ?? [];
  const outcomes: Outcome[] = mkts
    .map((m) => {
      const ps = prices(m);
      const outcomeLabels = labels(m);
      const label = m.groupItemTitle || outcomeLabels[0] || m.question || "—";
      return {
        label,
        price: ps.yes,
        noPrice: ps.no,
        question: m.question,
        url: m.slug ? `https://polymarket.com/zh/event/${ev.slug}/${m.slug}` : `https://polymarket.com/zh/event/${ev.slug}`,
        volume: num(m.volume),
        liquidity: num(m.liquidity),
        conditionId: m.conditionId,
        marketSlug: m.slug,
        tokenIds: tokenIds(m),
        bestBid: optionalNum(m.bestBid),
        bestAsk: optionalNum(m.bestAsk),
        spread: optionalNum(m.spread),
        lastTradePrice: optionalNum(m.lastTradePrice),
        enableOrderBook: Boolean(m.enableOrderBook),
      };
    })
    .filter((o) => o.price > 0)
    .sort((a, b) => b.price - a.price);

  const volume = num(ev.volume);
  const liquidity = num(ev.liquidity);
  const vol24 = num(ev.volume24hr);
  // Heat: blend of 24h activity, total volume (log), liquidity, recency to close.
  const heat =
    0.45 * Math.min(1, vol24 / 5_000_000) +
    0.30 * Math.min(1, Math.log10(volume + 1) / 9) +
    0.15 * Math.min(1, liquidity / 2_000_000) +
    0.10 * 1;

  return {
    id: String(ev.id),
    platform: "Polymarket",
    title: (ev.title || "").trim(),
    slug: ev.slug,
    url: `https://polymarket.com/event/${ev.slug}`,
    category: marketCategory(ev),
    outcomes,
    volume,
    liquidity,
    volume24hr: vol24,
    openInterest: optionalNum(ev.openInterest),
    endDate: ev.endDate,
    image: ev.image,
    heat: Math.round(heat * 1000) / 10,
    topOutcome: outcomes[0],
  };
}

function labels(market: any): string[] {
  return parseArr(market.outcomes);
}

function optionalNum(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function marketCategory(ev: any): string {
  const text = normalize(`${ev.title ?? ""} ${ev.slug ?? ""}`);
  if (text.includes("group") && text.includes("winner")) return "小组冠军";
  if (text.includes("golden boot")) return "金靴";
  if (text.includes("top scorer")) return "得分王";
  if (text.includes("knockout")) return "晋级淘汰赛";
  if (text.includes("reach final")) return "进决赛";
  if (text.includes("relocated")) return "赛程变更";
  if (text.includes("winner")) return "总冠军";
  return "世界杯";
}

export async function getWorldCupMarkets(): Promise<Market[]> {
  const out: Market[] = [];
  const seen = new Set<string>();

  function addEvent(ev: any) {
    if (!ev || seen.has(String(ev.id)) || !isWorldCupEvent(ev)) return;
    seen.add(String(ev.id));
    const market = eventToMarket(ev);
    if (market.outcomes.length) out.push(market);
  }

  await Promise.all(
    WC_EVENT_SLUGS.map(async (slug) => {
      try {
        const data = await getJSON(`${GAMMA}/events?slug=${slug}`);
        const events = Array.isArray(data) ? data : [data];
        for (const ev of events) addEvent(ev);
      } catch {
        /* skip unavailable slug */
      }
    }),
  );

  for (const query of WC_DISCOVERY_QUERIES) {
    try {
      const data = await getJSON(`${GAMMA}/public-search?q=${encodeURIComponent(query)}&limit=30`);
      const events = Array.isArray(data?.events) ? data.events : [];
      for (const ev of events) addEvent(ev);
    } catch {
      /* ignore discovery failures */
    }
  }

  // Fallback discovery if curated slugs missed: search soccer tag.
  if (out.length === 0) {
    try {
      const data = await getJSON(
        `${GAMMA}/events?closed=false&limit=20&order=volume&ascending=false&tag=soccer`
      );
      for (const ev of data) {
        if (seen.has(String(ev.id))) continue;
        seen.add(String(ev.id));
        out.push(eventToMarket(ev));
      }
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => b.heat - a.heat);
}

function isWorldCupEvent(ev: any): boolean {
  if (ev.closed) return false;
  const haystack = normalize(`${ev.title ?? ""} ${ev.slug ?? ""}`);
  if (!haystack.includes("world cup")) return false;
  return !haystack.includes("club world cup");
}

// Polymarket implied probability vs our model's champion probability — surfaces
// potential value bets / mispricing without mixing in other venues.
export function divergenceSignals(
  market: Market,
  modelProb: (teamName: string) => number
) {
  return market.outcomes
    .map((o) => {
      const mp = modelProb(o.label);
      return {
        label: o.label,
        market: o.price,
        model: mp,
        edge: mp - o.price, // positive => model thinks underpriced
      };
    })
    .filter((d) => d.model > 0)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}

export function teamNameSet(): Set<string> {
  return new Set(TEAMS.map((t) => t.name));
}

export async function getMatchMarkets(homeCode: string, awayCode: string): Promise<MatchMarketSet | null> {
  const home = teamByCode(homeCode);
  const away = teamByCode(awayCode);
  if (!home || !away) return null;

  const data = await getJSON(
    `${GAMMA}/public-search?q=${encodeURIComponent(`${home.name} ${away.name}`)}&limit=10`
  ).catch(() => null);
  const events = Array.isArray(data?.events) ? data.events : [];
  const ev = events.find((candidate: any) => isMatchEvent(candidate, home.name, away.name));
  if (!ev) return null;

  const markets: Partial<Record<MatchOutcomeKey, MatchPolymarket>> = {};
  for (const market of ev.markets ?? []) {
    const key = classifyMatchMarket(market, home.name, away.name);
    if (!key) continue;
    const ps = prices(market);
    const ids = tokenIds(market);
    markets[key] = {
      key,
      label: key === "home" ? home.zh : key === "away" ? away.zh : "平局",
      question: market.question,
      slug: market.slug,
      url: `https://polymarket.com/event/${ev.slug}/${market.slug}`,
      conditionId: market.conditionId,
      price: ps.yes,
      noPrice: ps.no,
      tokenIds: ids,
      volume: num(market.volume),
      liquidity: num(market.liquidity),
      bestBid: optionalNum(market.bestBid),
      bestAsk: optionalNum(market.bestAsk),
      spread: optionalNum(market.spread),
      lastTradePrice: optionalNum(market.lastTradePrice),
      enableOrderBook: Boolean(market.enableOrderBook),
    };
  }

  if (!markets.home && !markets.draw && !markets.away) return null;
  return {
    eventId: String(ev.id),
    eventSlug: ev.slug,
    title: ev.title,
    url: `https://polymarket.com/event/${ev.slug}`,
    volume: num(ev.volume),
    liquidity: num(ev.liquidity),
    endDate: ev.endDate,
    markets,
  };
}

function isMatchEvent(ev: any, homeName: string, awayName: string): boolean {
  const title = normalize(ev.title);
  const home = normalize(homeName);
  const away = normalize(awayName);
  return title.includes(home) && title.includes(away) && title.includes("vs");
}

function classifyMatchMarket(market: any, homeName: string, awayName: string): MatchOutcomeKey | null {
  const question = normalize(market.question);
  if (question.includes("draw")) return "draw";
  if (question.includes(normalize(homeName)) && question.includes("win")) return "home";
  if (question.includes(normalize(awayName)) && question.includes("win")) return "away";
  return null;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim();
}

export async function getClobOrderBook(tokenId: string): Promise<OrderBook> {
  const data = await getJSON(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`);
  return {
    ...data,
    bids: Array.isArray(data.bids) ? data.bids.map(level) : [],
    asks: Array.isArray(data.asks) ? data.asks.map(level) : [],
  };
}

export async function getClobSpread(tokenId: string): Promise<number | undefined> {
  const data = await getJSON(`${CLOB}/spread?token_id=${encodeURIComponent(tokenId)}`);
  return optionalNum(data.spread);
}

export async function getClobMidpoint(tokenId: string): Promise<number | undefined> {
  const data = await getJSON(`${CLOB}/midpoint?token_id=${encodeURIComponent(tokenId)}`);
  return optionalNum(data.mid);
}

export async function getClobPriceHistory({
  tokenId,
  days = 7,
  interval = "1h",
  fidelity = 60,
}: {
  tokenId: string;
  days?: number;
  interval?: "1m" | "1h" | "6h" | "1d" | "1w" | "all" | "max";
  fidelity?: number;
}): Promise<PricePoint[]> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 60 * 60;
  const params = new URLSearchParams({
    market: tokenId,
    startTs: String(start),
    endTs: String(end),
    interval,
    fidelity: String(fidelity),
  });
  const data = await getJSON(`${CLOB}/prices-history?${params.toString()}`);
  return Array.isArray(data.history) ? data.history.map((point: any) => ({ t: num(point.t), p: num(point.p) })) : [];
}

function level(item: any): OrderBookLevel {
  return { price: num(item.price), size: num(item.size) };
}
