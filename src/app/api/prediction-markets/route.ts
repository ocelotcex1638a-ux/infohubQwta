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

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_bid?: number;    // cents (0–100)
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number; // cents
  volume?: number;     // contracts
  volume_24h?: number;
  liquidity?: number;
  close_time?: string;
  category?: string;
  status?: string;
}

interface KalshiResponse {
  markets: KalshiMarket[];
  cursor?: string;
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
    fetchedAt: number;
    sources: string[];
  };
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

    const rawTag = (m.tags?.[0] || m.category || '').toLowerCase();
    const category = rawTag.includes('crypto') || rawTag.includes('bitcoin') || rawTag.includes('eth')
      ? 'Crypto'
      : rawTag.includes('politic') || rawTag.includes('election') || rawTag.includes('trump') || rawTag.includes('president')
      ? 'Politics'
      : rawTag.includes('sport') || rawTag.includes('nba') || rawTag.includes('nfl') || rawTag.includes('soccer')
      ? 'Sports'
      : rawTag.includes('science') || rawTag.includes('tech') || rawTag.includes('ai')
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
    'https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=100',
    {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Kalshi ${res.status}`);
  const data: KalshiResponse = await res.json();

  const markets = data.markets ?? [];
  return markets
    .filter(m => m.status === 'open' && m.title)
    .map(m => {
      // Kalshi prices are in cents (0–100); convert to 0..1
      const yesMid = m.yes_bid != null && m.yes_ask != null
        ? ((m.yes_bid + m.yes_ask) / 2) / 100
        : m.last_price != null
        ? m.last_price / 100
        : 0.5;
      const yesOdds = Math.min(1, Math.max(0, yesMid));
      const noOdds  = 1 - yesOdds;

      const rawCat = (m.category || '').toLowerCase();
      const category = rawCat.includes('crypto') || rawCat.includes('bitcoin')
        ? 'Crypto'
        : rawCat.includes('polit') || rawCat.includes('election') || rawCat.includes('fed')
        ? 'Politics'
        : rawCat.includes('sport') || rawCat.includes('nfl') || rawCat.includes('nba')
        ? 'Sports'
        : rawCat.includes('tech') || rawCat.includes('science')
        ? 'Science/Tech'
        : 'Other';

      return {
        id: `kalshi:${m.ticker}`,
        source: 'kalshi' as const,
        question: m.title,
        url: `https://kalshi.com/markets/${m.ticker}`,
        yesOdds,
        noOdds,
        volume24h: m.volume_24h ?? 0,
        totalVolume: m.volume ?? 0,
        liquidity: m.liquidity ?? 0,
        category,
        endDate: m.close_time ?? null,
        kalshiOdds: yesOdds,
      };
    });
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

  // Enrich Polymarket entries with matching Kalshi odds (keyword fuzzy match)
  for (const pm of polyByVol) {
    const pmWords = pm.question.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const match = kalshiMarkets.find(km => {
      const kmWords = km.question.toLowerCase();
      return pmWords.filter(w => kmWords.includes(w)).length >= 3;
    });
    if (match) {
      pm.kalshiOdds = match.yesOdds;
    }
  }

  // Kalshi sorted by volume desc, take top 20
  const kalshiByVol = kalshiMarkets.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 20);

  const markets = [...polyByVol, ...kalshiByVol];

  const response: PredictionMarketsResponse = {
    markets,
    meta: {
      polymarketCount: polyMarkets.length,
      kalshiCount: kalshiMarkets.length,
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
