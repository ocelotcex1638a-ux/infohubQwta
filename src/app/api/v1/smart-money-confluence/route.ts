import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api/v1-auth';
import { buildSmartMoneyConfluenceFeed } from '@/lib/smart-money-confluence';
import type { TraderSignalTier } from '@/lib/smart-money';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function normalizeTier(raw: string | null): TraderSignalTier {
  const value = (raw ?? '').toUpperCase();
  if (value === 'A' || value === 'B' || value === 'C') return value;
  return 'Watch';
}

export async function GET(request: NextRequest) {
  const auth = await authenticateV1Request(request);
  if (!auth.ok) return auth.response;

  const topN = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('topN') ?? '50', 10) || 50, 5), 100);
  const lookbackDays = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('lookbackDays') ?? '90', 10) || 90, 1), 180);
  const minWallets = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('minWallets') ?? '2', 10) || 2, 1), 10);
  const minPositionUsd = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('minPositionUsd') ?? '25000', 10) || 25_000, 1_000), 1_000_000);
  const minTier = normalizeTier(request.nextUrl.searchParams.get('minTier'));

  try {
    const feed = await buildSmartMoneyConfluenceFeed({
      topN,
      lookbackDays,
      minTier,
      minWallets,
      minPositionUsd,
    });

    return NextResponse.json({
      success: true,
      data: feed.signals,
      summary: {
        scanned: feed.scanned,
        lookbackDays: feed.lookbackDays,
        walletsConsidered: feed.walletsConsidered,
        count: feed.signals.length,
        minTier: feed.minTier,
        minWallets: feed.minWallets,
      },
      meta: {
        timestamp: feed.ts,
        topN,
        lookbackDays,
        minTier,
        minWallets,
        minPositionUsd,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        ...auth.headers,
      },
    });
  } catch (e) {
    console.error('v1/smart-money-confluence error:', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
