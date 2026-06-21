/**
 * GET /api/gtrade-traders/[address]
 *
 * Public gTrade (Gains Network) dossier: open positions with liquidation
 * prices for an Arbitrum wallet. Uses the on-chain getTrades() reader in
 * lib/wallet-clients/gtrade.ts — same path as /account/connections sync.
 *
 * Cache: 30s TTL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gtradeWalletClient } from '@/lib/wallet-clients/gtrade';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cache = new Map<string, { body: unknown; ts: number }>();
const CACHE_TTL = 30_000;

export async function GET(
  _request: NextRequest,
  { params }: { params: { address: string } },
) {
  const raw = params.address || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  const address = raw.toLowerCase();

  const cacheKey = `gtrade-trader:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.body, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  }

  const rows = await gtradeWalletClient.fetchPositions(address);

  const openPositions = rows.map((p) => {
    const sizeUsd = p.positionValue ?? 0;
    const margin = p.marginUsed ?? 0;
    const pnl = p.unrealizedPnl ?? 0;
    const roePct = margin > 0 ? (pnl / margin) * 100 : 0;
    return {
      symbol: p.symbol,
      isLong: p.side === 'long',
      sizeUsd,
      size: p.size ?? 0,
      entryPrice: p.entryPrice ?? 0,
      markPrice: p.markPrice ?? p.entryPrice ?? 0,
      unrealizedPnl: pnl,
      roePct,
      leverage: p.leverage ?? null,
      liquidationPrice: p.liquidationPrice ?? null,
      marginUsed: margin > 0 ? margin : null,
      tpPrice: p.tpPrice ?? null,
      slPrice: p.slPrice ?? null,
    };
  });

  const body = {
    address,
    openPositions,
    summary: {
      openCount: openPositions.length,
      totalNotional: openPositions.reduce((s, p) => s + p.sizeUsd, 0),
      totalUnrealized: openPositions.reduce((s, p) => s + p.unrealizedPnl, 0),
      totalMargin: openPositions.reduce((s, p) => s + (p.marginUsed ?? 0), 0),
    },
    meta: { venue: 'gtrade', chain: 'arbitrum' },
  };

  cache.set(cacheKey, { body, ts: Date.now() });

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
