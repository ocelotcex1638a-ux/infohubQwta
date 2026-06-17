import { NextResponse } from 'next/server';
import { fetchAllExchangesWithHealth } from '../../_shared/exchange-fetchers';
import { fetchWithTimeout } from '../../_shared/fetch';
import { tickerFetchers } from '../../tickers/exchanges';
import { detectPriceArbitrage, type TickerEntry } from '@/lib/arbitrage-detector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const preferredRegion = 'bom1';

// Cache in memory for 30s, separated by filter settings.
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_MS = 30_000;

function clampNumber(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const minVolumeUsd = clampNumber(url.searchParams.get('minVolumeUsd'), 500_000, 0, 100_000_000);
  const minNetSpreadPct = clampNumber(url.searchParams.get('minNetSpreadPct'), 0.02, 0, 5);
  const maxSpreadPct = clampNumber(url.searchParams.get('maxSpreadPct'), 5, 0.1, 25);
  const cacheKey = `${minVolumeUsd}:${minNetSpreadPct}:${maxSpreadPct}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return NextResponse.json(cached.data, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } });
  }

  try {
    // Fetch tickers directly (no self-fetch)
    const { data: results } = await fetchAllExchangesWithHealth(tickerFetchers, fetchWithTimeout);
    const tickers = (results as any[])
      .map((t): TickerEntry => ({
        symbol: String(t.symbol ?? '').toUpperCase(),
        exchange: String(t.exchange ?? ''),
        lastPrice: Number(t.lastPrice ?? 0),
        quoteVolume24h: Number(t.quoteVolume24h ?? 0),
      }))
      .filter((t) => t.symbol && t.exchange && t.lastPrice > 0);

    const exchangeCounts = new Map<string, number>();
    for (const t of tickers) {
      exchangeCounts.set(t.symbol, (exchangeCounts.get(t.symbol) ?? 0) + 1);
    }

    // Christian's feedback: largest raw spread is often not tradable.
    // Default to the existing volume-aware detector so the scanner opens on
    // liquid, fee-adjusted, denomination-sane opportunities.
    const data = detectPriceArbitrage(tickers, {
      threshold: minNetSpreadPct,
      minVolumeUsd,
      maxSpreadPct,
    }).map((row) => ({
      ...row,
      exchangeCount: exchangeCounts.get(row.symbol) ?? 2,
      minSideVolume: Math.min(row.lowVolume, row.highVolume),
      maxTradableUsd: Math.floor(Math.min(row.lowVolume, row.highVolume) * 0.0025),
    }));

    const resp = {
      data,
      count: data.length,
      ts: Date.now(),
      meta: {
        minSideVolumeUsd: minVolumeUsd,
        minNetSpreadPct,
        maxSpreadPct,
        rankedBy: 'netPct',
      },
    };
    cache.set(cacheKey, { data: resp, ts: Date.now() });
    return NextResponse.json(resp, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } });
  } catch (err: any) {
    console.error('[spreads/current]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
