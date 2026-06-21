/**
 * POST /api/account/trading-style
 *
 * Saves the authenticated user's trading style preference.
 * Called by the onboarding page on first login.
 *
 * Body: { style: 'arb' | 'directional' | 'intraday' | 'options' | 'spot' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { initDB, isDBConfigured, getSQL } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const VALID_STYLES = new Set(['arb', 'directional', 'intraday', 'options', 'spot']);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  let body: { style?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  const style = body?.style;
  if (!style || !VALID_STYLES.has(style)) {
    return NextResponse.json(
      { error: `Invalid style. Must be one of: ${Array.from(VALID_STYLES).join(', ')}` },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!isDBConfigured()) {
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();

  await db`
    UPDATE users
    SET trading_style = ${style}, trading_style_set_at = NOW()
    WHERE id = ${session.user.id}
  `;

  return NextResponse.json({ ok: true, style }, { headers: NO_STORE });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ style: null }, { headers: NO_STORE });
  }

  if (!isDBConfigured()) {
    return NextResponse.json({ style: null }, { headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();
  const rows = await db`
    SELECT trading_style FROM users WHERE id = ${session.user.id} LIMIT 1
  `;

  return NextResponse.json({ style: rows[0]?.trading_style ?? null }, { headers: NO_STORE });
}
