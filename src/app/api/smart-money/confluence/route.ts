import { NextRequest, NextResponse } from 'next/server';
import { buildSmartMoneyConfluenceFeed } from '@/lib/smart-money-confluence';
import type { TraderSignalTier } from '@/lib/smart-money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL_MS = 15 * 60 * 1000;
let l1: { key: string; ts: number; body: unknown } | null = null;

function normalizeTier(raw: string | null): TraderSignalTier {
  const value = (raw ?? '').toUpperCase();
  if (value === 'A' || value === 'B' || value === 'C') return value;
  return 'Watch';
}

export async function GET(request: NextRequest) {
  const topN = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('topN') ?? '50', 10) || 50, 5), 100);
  const lookbackDays = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('lookbackDays') ?? '90', 10) || 90, 1), 180);
  const minWallets = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('minWallets') ?? '2', 10) || 2, 1), 10);
  const minPositionUsd = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('minPositionUsd') ?? '10000', 10) || 10_000, 1_000), 1_000_000);
  const minTier = normalizeTier(request.nextUrl.searchParams.get('minTier'));
  const assetFilter = (request.nextUrl.searchParams.get('asset') ?? '').trim().toUpperCase() || null;
  const cacheKey = `${topN}:${lookbackDays}:${minTier}:${minWallets}:${minPositionUsd}:${assetFilter ?? 'all'}`;

  if (l1 && l1.key === cacheKey && Date.now() - l1.ts < CACHE_TTL_MS) {
    return NextResponse.json(l1.body, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  }

  const feed = await buildSmartMoneyConfluenceFeed({
    topN,
    lookbackDays,
    minTier,
    minWallets,
    minPositionUsd,
    assetFilter,
  });

  if (feed.signals.length > 0) {
    l1 = { key: cacheKey, ts: feed.ts, body: feed };
  }

  return NextResponse.json(feed, {
    headers: {
      'X-Cache': 'MISS',
      'Cache-Control': feed.signals.length > 0
        ? 'public, s-maxage=900, stale-while-revalidate=3600'
        : 'no-store',
    },
  });
}
