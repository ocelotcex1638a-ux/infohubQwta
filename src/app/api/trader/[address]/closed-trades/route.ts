/**
 * GET /api/trader/[address]/closed-trades
 *
 * Export closed Hyperliquid fills for external analysis. This gives power users
 * the raw material they were manually feeding into AI: symbol, side, size,
 * entry/exit proxy fields, realised PnL, hold-time proxy, venue, and timestamp.
 *
 * Query:
 *   ?days=90          1..180, default 90
 *   ?format=json|csv  default json
 */
import { NextRequest, NextResponse } from 'next/server';
import { hyperliquidWalletClient } from '@/lib/wallet-clients/hyperliquid';
import type { NormalizedTrade } from '@/lib/wallet-clients/types';

export const runtime = 'nodejs';
export const preferredRegion = 'bom1';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  const raw = params.address || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('days') ?? '90', 10) || 90, 1), 180);
  const format = (request.nextUrl.searchParams.get('format') || 'json').toLowerCase();
  const sinceMs = Date.now() - days * 86_400_000;
  const address = raw.toLowerCase();

  let fills: NormalizedTrade[] = [];
  try {
    fills = await hyperliquidWalletClient.fetchTradeHistory!(address, sinceMs);
  } catch (err) {
    console.error('[trader/closed-trades] fetch failed:', err);
    return NextResponse.json({ error: 'trade history unavailable' }, { status: 502 });
  }

  const closed = fills
    .filter((f) => f.realizedPnlUsd != null)
    .map((f) => ({
      venue: 'hyperliquid',
      address,
      symbol: f.symbol,
      side: f.side,
      direction: f.direction ?? 'close',
      openedAt: null,
      closedAt: f.ts.toISOString(),
      holdTimeHours: null,
      entryPrice: null,
      exitPrice: f.price,
      size: f.size,
      notionalUsd: f.valueUsd,
      realizedPnlUsd: f.realizedPnlUsd ?? 0,
      feeUsd: f.feeUsd ?? null,
      venueTradeId: f.venueTradeId,
    }))
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));

  if (format === 'csv') {
    const headers = [
      'venue', 'address', 'symbol', 'side', 'direction', 'openedAt', 'closedAt',
      'holdTimeHours', 'entryPrice', 'exitPrice', 'size', 'notionalUsd',
      'realizedPnlUsd', 'feeUsd', 'venueTradeId',
    ];
    const rows = closed.map((trade) => headers.map((h) => csvEscape(trade[h as keyof typeof trade])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${address.slice(0, 10)}-closed-trades-${days}d.csv"`,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    });
  }

  return NextResponse.json({
    address,
    venue: 'hyperliquid',
    days,
    count: closed.length,
    data: closed,
    meta: {
      note: 'Hyperliquid public fills expose close timestamp and realized PnL. Open time, entry price, and hold time are null until full position reconstruction is added.',
      timestamp: Date.now(),
    },
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
  });
}
