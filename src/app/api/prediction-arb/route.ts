/**
 * GET /api/prediction-arb
 *
 * Curated cross-venue "tracked arb" between Polymarket and Kalshi for the
 * markets that genuinely exist on both: crypto daily price levels (BTC/ETH
 * "above $X on <date>") and FOMC rate decisions (the move at each meeting).
 *
 * Unlike /api/prediction-markets (which fuzzy-compares the top-by-volume
 * feeds), this hits each venue's specific series so the overlap is real,
 * then matches on structured fields via lib/prediction-arb. See that
 * module for why exact date/strike/meeting alignment matters (loose
 * matching manufactures phantom arb).
 */
import { NextResponse } from 'next/server';
import {
  parsePolymarketCryptoQuestion,
  parseKalshiCryptoFields,
  matchCryptoLegs,
  parsePolymarketFedQuestion,
  parseKalshiFed,
  matchFedLegs,
  sortTrackedPairs,
  type CryptoLeg,
  type FedLeg,
  type CryptoAsset,
  type TrackedPair,
} from '@/lib/prediction-arb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TrackedArbResponse {
  pairs: TrackedPair[];
  meta: {
    cryptoCount: number;
    fedCount: number;
    arbCount: number;
    fetchedAt: number;
    sources: string[];
  };
}

let l1Cache: { body: TrackedArbResponse; ts: number } | null = null;
const L1_TTL = 3 * 60 * 1000;

// ── Kalshi ────────────────────────────────────────────────────────────
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';

function kNum(s: string | number | undefined | null): number {
  if (s == null) return 0;
  const n = typeof s === 'number' ? s : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
/** Kalshi yes odds (0..1) from dollar-string bid/ask, else last trade. */
function kalshiYes(m: any): number {
  const yb = kNum(m.yes_bid_dollars), ya = kNum(m.yes_ask_dollars), last = kNum(m.last_price_dollars);
  if (yb > 0 && ya > 0) return Math.min(1, Math.max(0, (yb + ya) / 2));
  if (last > 0) return Math.min(1, Math.max(0, last));
  return 0.5;
}

async function fetchKalshiSeries(series: string, withEvents: boolean): Promise<any> {
  const url = withEvents
    ? `${KALSHI}/events?series_ticker=${series}&status=open&limit=50&with_nested_markets=true`
    : `${KALSHI}/markets?series_ticker=${series}&status=open&limit=400`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Kalshi ${series} ${res.status}`);
  return res.json();
}

async function fetchKalshiCryptoLegs(): Promise<CryptoLeg[]> {
  const out: CryptoLeg[] = [];
  const specs: Array<[string, CryptoAsset]> = [['KXBTCD', 'BTC'], ['KXETHD', 'ETH']];
  const results = await Promise.allSettled(specs.map(([s]) => fetchKalshiSeries(s, false)));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const [series, asset] = specs[i];
    for (const m of r.value.markets ?? []) {
      const yb = kNum(m.yes_bid_dollars), ya = kNum(m.yes_ask_dollars), last = kNum(m.last_price_dollars);
      if (yb === 0 && ya === 0 && last === 0) continue;
      const fields = parseKalshiCryptoFields(m.floor_strike, m.close_time, asset);
      if (!fields) continue;
      out.push({
        ...fields,
        yesOdds: kalshiYes(m),
        url: `https://kalshi.com/markets/${series.toLowerCase()}`,
        closeIso: m.close_time,
      });
    }
  });
  return out;
}

async function fetchKalshiFedLegs(now: Date): Promise<FedLeg[]> {
  const data = await fetchKalshiSeries('KXFEDDECISION', true);
  const out: FedLeg[] = [];
  for (const ev of data.events ?? []) {
    for (const m of ev.markets ?? []) {
      const parsed = parseKalshiFed(ev.title ?? '', m.yes_sub_title ?? '', now);
      if (!parsed) continue;
      out.push({ ...parsed, yesOdds: kalshiYes(m), url: 'https://kalshi.com/markets/kxfeddecision' });
    }
  }
  return out;
}

// ── Polymarket ────────────────────────────────────────────────────────
function polyYes(m: any): number {
  try {
    const prices: string[] = JSON.parse(m.outcomePrices ?? '[]');
    const outcomes: string[] = JSON.parse(m.outcomes ?? '[]');
    const i = outcomes.findIndex(o => o.toLowerCase() === 'yes');
    const raw = i >= 0 ? prices[i] : prices[0];
    const v = parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  } catch { return 0.5; }
}
const polyUrl = (m: any): string => (m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com/markets');

/** Polymarket's crypto + Fed markets aren't in the top-by-volume feed, so
 *  page through (parallel) and filter. */
async function fetchPolymarketLegs(now: Date): Promise<{ crypto: CryptoLeg[]; fed: FedLeg[] }> {
  const offsets = [0, 100, 200, 300, 400];
  const pages = await Promise.allSettled(offsets.map(off =>
    fetch(`https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100&offset=${off}`,
      { signal: AbortSignal.timeout(9000), headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : [])),
  ));

  const crypto: CryptoLeg[] = [];
  const fed: FedLeg[] = [];
  for (const p of pages) {
    if (p.status !== 'fulfilled' || !Array.isArray(p.value)) continue;
    for (const m of p.value) {
      const q: string = m.question ?? '';
      const c = parsePolymarketCryptoQuestion(q, now);
      if (c) {
        crypto.push({ ...c, yesOdds: polyYes(m), url: polyUrl(m), closeIso: m.endDate });
        continue;
      }
      const f = parsePolymarketFedQuestion(q, now);
      if (f) fed.push({ ...f, yesOdds: polyYes(m), url: polyUrl(m) });
    }
  }
  return { crypto, fed };
}

export async function GET() {
  if (l1Cache && Date.now() - l1Cache.ts < L1_TTL) {
    return NextResponse.json(l1Cache.body, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600' },
    });
  }

  const now = new Date();
  const [kCrypto, kFed, poly] = await Promise.allSettled([
    fetchKalshiCryptoLegs(),
    fetchKalshiFedLegs(now),
    fetchPolymarketLegs(now),
  ]);

  const kalshiCrypto = kCrypto.status === 'fulfilled' ? kCrypto.value : [];
  const kalshiFed    = kFed.status    === 'fulfilled' ? kFed.value    : [];
  const polyLegs     = poly.status    === 'fulfilled' ? poly.value    : { crypto: [], fed: [] };

  const cryptoPairs = matchCryptoLegs(polyLegs.crypto, kalshiCrypto);
  const fedPairs    = matchFedLegs(polyLegs.fed, kalshiFed);
  const pairs = sortTrackedPairs([...cryptoPairs, ...fedPairs]);

  const sources = new Set<string>();
  if (poly.status === 'fulfilled') sources.add('polymarket');
  if (kCrypto.status === 'fulfilled' || kFed.status === 'fulfilled') sources.add('kalshi');

  const body: TrackedArbResponse = {
    pairs,
    meta: {
      cryptoCount: cryptoPairs.length,
      fedCount: fedPairs.length,
      arbCount: pairs.filter(p => p.gap >= 0.05).length,
      fetchedAt: Date.now(),
      sources: Array.from(sources),
    },
  };

  // Only cache a useful (non-empty) result so a transient double outage
  // doesn't pin an empty board for the TTL.
  if (pairs.length > 0) l1Cache = { body, ts: Date.now() };

  return NextResponse.json(body, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=600' },
  });
}
