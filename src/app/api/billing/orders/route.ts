import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDB, isDBConfigured } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }
  if (!isDBConfigured()) {
    return NextResponse.json({ orders: [] }, { headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();

  const rows = await db`
    SELECT
      order_id,
      tier,
      period,
      amount_usd,
      currency,
      status,
      verified_at,
      expires_at,
      created_at
    FROM maxelpay_checkouts
    WHERE user_id = ${session.user.id}
      AND status NOT IN ('creating', 'failed')
    ORDER BY created_at DESC
    LIMIT 10
  ` as Array<{
    order_id: string;
    tier: string | null;
    period: string | null;
    amount_usd: string | number;
    currency: string | null;
    status: string | null;
    verified_at: string | Date | null;
    expires_at: string | Date | null;
    created_at: string | Date;
  }>;

  const orders = rows.map((r) => ({
    orderId: r.order_id,
    tier: r.tier,
    period: r.period,
    amountUsd: Number(r.amount_usd ?? 0),
    currency: r.currency ?? 'USD',
    status: r.status ?? 'processing',
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));

  return NextResponse.json({ orders }, { headers: NO_STORE });
}
