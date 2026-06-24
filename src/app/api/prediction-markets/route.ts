import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let l1Cache: { body: PredictionMarketsResponse; ts: number } | null = null;
const L1_TTL = 3 * 60 * 1000;

interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  description?: string;
  endDate?: string;
  active: boolean;
  closed: boolean;
  volume24hr?: number;
  volume?: number;
  liquidityNum?: number;
  outcomePrices?: string; // JSON array e.g. ["0.65","0.35"]
  outcomes?: string;      // JSON array e.g. ["Yes","No"]
  category?: string;
  tags?: string[];
  startDate?: string;
  negRisk?: boolean;
  enableOrderBook?: boolean;
}

// Kalshi's public market data lives on the elections host. The old
// trading-api.kalshi.com host now requires an authed session (401), and
// the v2 schema switched from integer cents to dollar strings (e.g.
// "0.0170" = 1.7% implied probability), so all the *_dollars fields are
// already in 0..1 — no /100 conversion. The bare /markets list is
// flooded with zero-volume multivariate sports parlays; the /events
// feed with nested markets is the only way to get the recognizable
// headline questions ("2028 President", "GTA VI price", etc).
interface KalshiNestedMarket {
  ticker: string;
  title?: string;
  yes_sub_title?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  liquidity_dollars?: string;
  open_interest_fp?: string;
  close_time?: string;
  status?: string;
}

interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title?: string;
  category?: string;
  markets?: KalshiNestedMarket[];
}

interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor?: string;
}

/** Parse a Kalshi numeric string field ("0.0170", "122446.21") → number. */
function kNum(s: string | number | undefined | null): number {
  if (s == null) return 0;
  const n = typeof s === 'number' ? s : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Map Kalshi's event category onto the 5 buckets the UI filters on.
 *  Kalshi's real categories (Jun 2026): Politics, Sports, Entertainment,
 *  Elections, Science and Technology, Economics, Climate and Weather,
 *  Companies, Financials, World, Health, Social, Transportation.
 *  NB: keyword tests must be specific — a loose `'ai'` substring matches
 *  "entertAInment" and miscategorizes 31 events as Science/Tech. */
function mapKalshiCategory(cat?: string): string {
  const c = (cat || '').toLowerCase();
  if (c.includes('crypto') || c.includes('bitcoin') || c.includes('ethereum')) return 'Crypto';
  if (c.includes('sport')) return 'Sports';
  if (c.includes('science') || c.includes('technology') || c.includes('climate') || c.includes('weather')) return 'Science/Tech';
  if (c.includes('polit') || c.includes('election') || c.includes('econ') || c.includes('financ') || c.includes('world') || c.includes('fed')) return 'Politics';
  return 'Other';
}

export interface PredictionMarket {
  id: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  slug?: string;
  url: string;
  yesOdds: number;   // 0..1
  noOdds: number;    // 0..1
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  category: string;
  endDate: string | null;
  traders?: number;
  // cross-platform fields
  polyOdds?: number;
  kalshiOdds?: number;
}

interface PredictionMarketsResponse {
  markets: PredictionMarket[];
  meta: {
    polymarketCount: number;
    kalshiCount: number;
    matchedCount: number;
    arbCount: number;
    fetchedAt: number;
    sources: string[];
  };
}

// Stopwords + the framing verbs that appear in almost every prediction
// question ("will the next president be…") so they don't inflate the
// token overlap and create spurious matches.
const MATCH_STOPWORDS = new Set([
  'will', 'the', 'be', 'to', 'of', 'in', 'on', 'for', 'by', 'next', 'who',
  'what', 'when', 'how', 'much', 'wins', 'win', 'and', 'or', 'does', 'did',
  'is', 'are', 'at', 'it', 'his', 'her', 'their', 'from', 'with', 'become',
  'before', 'after', 'during', 'term', 'this', 'that', 'than', 'a', 'an',
]);

function significantTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (w.length >= 4 && !MATCH_STOPWORDS.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}

function fourDigitYears(s: string): Set<string> {
  return new Set(s.match(/\b20\d\d\b/g) ?? []);
}

/** Find the Kalshi market that refers to the SAME event as a Polymarket
 *  question, or null. High precision by design — see the call site. */
function bestKalshiMatch(question: string, kalshi: PredictionMarket[]): PredictionMarket | null {
  const pt = significantTokens(question);
  if (pt.size < 2) return null;
  const py = fourDigitYears(question);

  let best: PredictionMarket | null = null;
  let bestScore = 0;
  for (const km of kalshi) {
    const kt = significantTokens(km.question);
    let shared = 0;
    pt.forEach(w => { if (kt.has(w)) shared++; });
    if (shared < 2) continue;

    // Reject when both name a year and the years don't overlap — this is
    // what keeps "win the 2026 World Cup" from matching "host 2038".
    const ky = fourDigitYears(km.question);
    if (py.size && ky.size) {
      let yearOverlap = false;
      py.forEach(y => { if (ky.has(y)) yearOverlap = true; });
      if (!yearOverlap) continue;
    }

    const jaccard = shared / (pt.size + kt.size - shared);
    if (jaccard >= 0.4 && jaccard > bestScore) {
      bestScore = jaccard;
      best = km;
    }
  }
  return best;
}

async function fetchPolymarket(): Promise<PredictionMarket[]> {
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=60',
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`Polymarket ${res.status}`);
  const data: PolyMarket[] = await res.json();

  const markets: PredictionMarket[] = [];
  for (const m of data) {
    if (!m.question || m.closed || !m.active) continue;

    let yesOdds = 0.5;
    let noOdds = 0.5;
    if (m.outcomePrices) {
      try {
        const prices: string[] = JSON.parse(m.outcomePrices);
        const outcomes: string[] = m.outcomes ? JSON.parse(m.outcomes) : [];
        const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
        const noIdx  = outcomes.findIndex(o => o.toLowerCase() === 'no');
        if (yesIdx >= 0 && prices[yesIdx]) yesOdds = parseFloat(prices[yesIdx]);
        if (noIdx  >= 0 && prices[noIdx])  noOdds  = parseFloat(prices[noIdx]);
        if (yesIdx < 0 && prices[0]) {
          yesOdds = parseFloat(prices[0]);
          noOdds  = 1 - yesOdds;
        }
      } catch { /* skip */ }
    }

    const vol24h = m.volume24hr ?? 0;
    const totalVol = m.volume ?? 0;

    // Keyword tests must be specific: a bare 'eth' substring matches
    // "ethics"/"whether" and 'ai' matches "entertainment"/"ukraine".
    const rawTag = (m.tags?.[0] || m.category || '').toLowerCase();
    const category = rawTag.includes('crypto') || rawTag.includes('bitcoin') || rawTag.includes('ethereum')
      ? 'Crypto'
      : rawTag.includes('politic') || rawTag.includes('election') || rawTag.includes('trump') || rawTag.includes('president')
      ? 'Politics'
      : rawTag.includes('sport') || rawTag.includes('nba') || rawTag.includes('nfl') || rawTag.includes('soccer')
      ? 'Sports'
      : rawTag.includes('science') || rawTag.includes('tech')
      ? 'Science/Tech'
      : 'Other';

    markets.push({
      id: `poly:${m.id}`,
      source: 'polymarket',
      question: m.question,
      slug: m.slug,
      url: m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com/markets',
      yesOdds: Math.min(1, Math.max(0, yesOdds)),
      noOdds: Math.min(1, Math.max(0, noOdds)),
      volume24h: vol24h,
      totalVolume: totalVol,
      liquidity: m.liquidityNum ?? 0,
      category,
      endDate: m.endDate ?? null,
      polyOdds: yesOdds,
    });
  }

  return markets;
}

async function fetchKalshi(): Promise<PredictionMarket[]> {
  const res = await fetch(
    'https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=200&with_nested_markets=true',
    {
      signal: AbortSignal.timeout(9000),
      headers: { 'Accept': 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Kalshi ${res.status}`);
  const data: KalshiEventsResponse = await res.json();
  const events = data.events ?? [];

  // Flatten (event, market) pairs and sort by 24h volume so the leading
  // outcome of each event surfaces first.
  const pairs: { ev: KalshiEvent; m: KalshiNestedMarket; v24: number }[] = [];
  for (const ev of events) {
    for (const m of ev.markets ?? []) {
      if (m.status && m.status !== 'active' && m.status !== 'open') continue;
      pairs.push({ ev, m, v24: kNum(m.volume_24h_fp) });
    }
  }
  pairs.sort((a, b) => b.v24 - a.v24);

  const out: PredictionMarket[] = [];
  const perEvent = new Map<string, number>();

  for (const { ev, m, v24 } of pairs) {
    const yb = kNum(m.yes_bid_dollars);
    const ya = kNum(m.yes_ask_dollars);
    const last = kNum(m.last_price_dollars);
    // Skip markets with no real pricing signal at all (no book, no trade).
    if (yb === 0 && ya === 0 && last === 0) continue;

    const yesMid = yb > 0 && ya > 0 ? (yb + ya) / 2 : last > 0 ? last : 0.5;
    const yesOdds = Math.min(1, Math.max(0, yesMid));

    // Cap to 2 outcomes per event so a 20-candidate election doesn't
    // dominate the whole list.
    const seen = perEvent.get(ev.event_ticker) ?? 0;
    if (seen >= 2) continue;
    perEvent.set(ev.event_ticker, seen + 1);

    // Readable question — append the outcome label when it disambiguates
    // (multi-outcome events) and isn't already echoed in the title.
    const sub = (m.yes_sub_title || '').trim();
    const question = sub && !ev.title.toLowerCase().includes(sub.toLowerCase())
      ? `${ev.title} — ${sub}`
      : ev.title;

    out.push({
      id: `kalshi:${m.ticker}`,
      source: 'kalshi',
      question,
      url: `https://kalshi.com/markets/${ev.series_ticker.toLowerCase()}`,
      yesOdds,
      noOdds: 1 - yesOdds,
      volume24h: v24,
      totalVolume: kNum(m.volume_fp),
      liquidity: kNum(m.liquidity_dollars),
      category: mapKalshiCategory(ev.category),
      endDate: m.close_time ?? null,
      kalshiOdds: yesOdds,
    });
  }

  return out;
}

export async function GET(_req: NextRequest) {
  if (l1Cache && Date.now() - l1Cache.ts < L1_TTL) {
    return NextResponse.json(l1Cache.body, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }

  const [polyResult, kalshiResult] = await Promise.allSettled([
    fetchPolymarket(),
    fetchKalshi(),
  ]);

  const polyMarkets   = polyResult.status   === 'fulfilled' ? polyResult.value   : [];
  const kalshiMarkets = kalshiResult.status === 'fulfilled' ? kalshiResult.value : [];

  // Sort Polymarket by 24h volume desc
  const polyByVol = polyMarkets.sort((a, b) => b.volume24h - a.volume24h);

  // Cross-list Polymarket entries against Kalshi by matching the SAME
  // event. Cross-platform arb is genuinely rare (the two venues mostly
  // list different events, and where they overlap — e.g. 2028 election
  // candidates — the odds usually agree), so precision matters far more
  // than recall: a fake match manufactures fake arb, which is worse than
  // showing none. We require ≥2 shared significant tokens AND a Jaccard
  // ≥0.4, AND reject pairs whose 4-digit years conflict (this is what
  // stops "win 2026 World Cup" matching "host 2038 World Cup").
  let matchedCount = 0;
  for (const pm of polyByVol) {
    const match = bestKalshiMatch(pm.question, kalshiMarkets);
    if (match) {
      pm.kalshiOdds = match.yesOdds;
      matchedCount++;
    }
  }
  const arbCount = polyByVol.filter(
    pm => pm.kalshiOdds != null && pm.polyOdds != null && Math.abs(pm.polyOdds - pm.kalshiOdds) >= 0.05,
  ).length;

  // Kalshi already sorted by 24h volume in the fetcher; take the top 25.
  const kalshiByVol = kalshiMarkets.slice(0, 25);

  const markets = [...polyByVol, ...kalshiByVol];

  const response: PredictionMarketsResponse = {
    markets,
    meta: {
      polymarketCount: polyMarkets.length,
      kalshiCount: kalshiMarkets.length,
      // How many Polymarket markets are cross-listed on Kalshi (same
      // event), and how many of those have a ≥5% gap. arbCount is almost
      // always 0 — that's the honest state, not a failure — so the UI can
      // explain "N cross-listed, odds agree" instead of looking broken.
      matchedCount,
      arbCount,
      fetchedAt: Date.now(),
      sources: [
        polyResult.status   === 'fulfilled' ? 'polymarket' : '',
        kalshiResult.status === 'fulfilled' ? 'kalshi'     : '',
      ].filter(Boolean),
    },
  };

  if (markets.length > 0) {
    l1Cache = { body: response, ts: Date.now() };
  }

  return NextResponse.json(response, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
  });
}
