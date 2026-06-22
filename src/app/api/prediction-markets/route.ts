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
  // multi-outcome markets won't have binary yes/no
  enableOrderBook?: boolean;
}

interface ManifoldMarket {
  id: string;
  question: string;
  url: string;
  probability?: number;
  totalTraders?: number;
  volume?: number;
  createdTime?: number;
  closeTime?: number;
  isResolved?: boolean;
  outcomeType?: string;
}

export interface PredictionMarket {
  id: string;
  source: 'polymarket' | 'manifold';
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
  manifoldOdds?: number;
}

interface PredictionMarketsResponse {
  markets: PredictionMarket[];
  meta: {
    polymarketCount: number;
    manifoldCount: number;
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
        // Non-binary multi-outcome markets: use first outcome as "yes" proxy
        if (yesIdx < 0 && prices[0]) {
          yesOdds = parseFloat(prices[0]);
          noOdds  = 1 - yesOdds;
        }
      } catch { /* skip */ }
    }

    const vol24h = m.volume24hr ?? 0;
    const totalVol = m.volume ?? 0;

    // Categorize from tags or defaults
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
      url: `https://polymarket.com/event/${m.slug || m.id}`,
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

async function fetchManifold(): Promise<PredictionMarket[]> {
  const res = await fetch(
    'https://api.manifold.markets/v0/markets?limit=20&sort=liquidity&filter=open',
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Manifold ${res.status}`);
  const data: ManifoldMarket[] = await res.json();

  return data
    .filter(m => !m.isResolved && m.outcomeType === 'BINARY' && m.probability != null)
    .map(m => ({
      id: `manifold:${m.id}`,
      source: 'manifold' as const,
      question: m.question,
      url: m.url ?? `https://manifold.markets/${m.id}`,
      yesOdds: m.probability ?? 0.5,
      noOdds: 1 - (m.probability ?? 0.5),
      volume24h: 0,
      totalVolume: m.volume ?? 0,
      liquidity: 0,
      category: 'Other',
      endDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
      traders: m.totalTraders,
      manifoldOdds: m.probability,
    }));
}

export async function GET(_req: NextRequest) {
  if (l1Cache && Date.now() - l1Cache.ts < L1_TTL) {
    return NextResponse.json(l1Cache.body, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  }

  const [polyResult, manifoldResult] = await Promise.allSettled([
    fetchPolymarket(),
    fetchManifold(),
  ]);

  const polyMarkets = polyResult.status === 'fulfilled' ? polyResult.value : [];
  const manifoldMarkets = manifoldResult.status === 'fulfilled' ? manifoldResult.value : [];

  // Merge: sort Polymarket by 24h volume desc, then append Manifold
  const polyByVol = polyMarkets.sort((a, b) => b.volume24h - a.volume24h);

  // Try to enrich Polymarket entries with matching Manifold odds (keyword fuzzy match)
  for (const pm of polyByVol) {
    const pmWords = pm.question.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const match = manifoldMarkets.find(mm => {
      const mmWords = mm.question.toLowerCase();
      return pmWords.filter(w => mmWords.includes(w)).length >= 3;
    });
    if (match) {
      pm.manifoldOdds = match.yesOdds;
    }
  }

  const markets = [...polyByVol, ...manifoldMarkets.slice(0, 15)];

  const response: PredictionMarketsResponse = {
    markets,
    meta: {
      polymarketCount: polyMarkets.length,
      manifoldCount: manifoldMarkets.length,
      fetchedAt: Date.now(),
      sources: [
        polyResult.status === 'fulfilled' ? 'polymarket' : '',
        manifoldResult.status === 'fulfilled' ? 'manifold' : '',
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
