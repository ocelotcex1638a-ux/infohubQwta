import { NextRequest, NextResponse } from 'next/server';
import { auth, verifySameOrigin } from '@/lib/auth';
import { initDB, isDBConfigured, getSQL } from '@/lib/db';
import {
  buildMaxelPayDescription,
  buildMaxelPayOrderId,
  buildMaxelPaySuccessUrl,
  createMaxelPaySession,
  getMaxelPayAmount,
  getMaxelPayApiKey,
  type MaxelPayPeriod,
  type MaxelPayTier,
} from '@/lib/maxelpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

const NO_STORE = { 'Cache-Control': 'no-store' };
const VALID_TIERS = new Set<MaxelPayTier>(['trader', 'pro', 'whale']);
const VALID_PERIODS = new Set<MaxelPayPeriod>(['monthly', 'annual']);

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || new URL(request.url).origin;
}

function extractCheckoutUrl(response: Record<string, unknown>): string | null {
  const candidates = [
    response.checkoutUrl,
    response.paymentUrl,
    response.url,
    typeof response.data === 'object' && response.data
      ? (response.data as Record<string, unknown>).checkoutUrl
      : null,
    typeof response.data === 'object' && response.data
      ? (response.data as Record<string, unknown>).paymentUrl
      : null,
    typeof response.data === 'object' && response.data
      ? (response.data as Record<string, unknown>).url
      : null,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractSessionId(response: Record<string, unknown>): string | null {
  const candidates = [
    response.sessionId,
    typeof response.data === 'object' && response.data
      ? (response.data as Record<string, unknown>).sessionId
      : null,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function POST(request: NextRequest) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }
  if (!isDBConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: NO_STORE });
  }
  if (!getMaxelPayApiKey()) {
    return NextResponse.json({ error: 'MaxelPay is not configured' }, { status: 503, headers: NO_STORE });
  }

  let body: { tier?: unknown; period?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = typeof body.tier === 'string' ? body.tier.toLowerCase() : '';
  const period = typeof body.period === 'string' ? body.period.toLowerCase() : 'monthly';
  if (!VALID_TIERS.has(tier as MaxelPayTier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400, headers: NO_STORE });
  }
  if (!VALID_PERIODS.has(period as MaxelPayPeriod)) {
    return NextResponse.json({ error: 'Invalid billing period' }, { status: 400, headers: NO_STORE });
  }

  const paymentTier = tier as MaxelPayTier;
  const billingPeriod = period as MaxelPayPeriod;
  const amountUsd = getMaxelPayAmount(paymentTier, billingPeriod);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers: NO_STORE });
  }

  const orderId = buildMaxelPayOrderId();
  const baseUrl = getBaseUrl(request);
  const successUrl = buildMaxelPaySuccessUrl(baseUrl, {
    orderId,
    tier: paymentTier,
    period: billingPeriod,
  });
  const cancelUrl = new URL('/pricing?checkout=cancelled', baseUrl).toString();
  const callbackUrl = new URL('/api/webhooks/maxelpay', baseUrl).toString();
  const email = typeof session.user.email === 'string' ? session.user.email : null;
  const requestPayload = {
    orderId,
    amount: amountUsd,
    currency: 'USD',
    description: buildMaxelPayDescription(paymentTier, billingPeriod),
    successUrl,
    cancelUrl,
    callbackUrl,
  };

  await initDB();
  const db = getSQL();
  const now = new Date().toISOString();
  await db`
    CREATE TABLE IF NOT EXISTS maxelpay_checkouts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL UNIQUE,
      session_id TEXT UNIQUE,
      tier TEXT NOT NULL,
      period TEXT NOT NULL,
      amount_usd NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'created',
      success_url TEXT,
      cancel_url TEXT,
      callback_url TEXT,
      email TEXT,
      request_payload JSONB,
      response_payload JSONB,
      webhook_payload JSONB,
      status_payload JSONB,
      paid_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_maxelpay_checkouts_user_created ON maxelpay_checkouts(user_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_maxelpay_checkouts_session ON maxelpay_checkouts(session_id) WHERE session_id IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS idx_maxelpay_checkouts_status ON maxelpay_checkouts(status, updated_at DESC)`;
  await db`
    INSERT INTO maxelpay_checkouts (
      user_id,
      order_id,
      tier,
      period,
      amount_usd,
      currency,
      status,
      success_url,
      cancel_url,
      callback_url,
      email,
      request_payload,
      created_at,
      updated_at
    )
    VALUES (
      ${session.user.id},
      ${orderId},
      ${paymentTier},
      ${billingPeriod},
      ${amountUsd},
      'USD',
      'creating',
      ${successUrl},
      ${cancelUrl},
      ${callbackUrl},
      ${email},
      ${JSON.stringify(requestPayload)}::jsonb,
      ${now},
      ${now}
    )
    ON CONFLICT (order_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      tier = EXCLUDED.tier,
      period = EXCLUDED.period,
      amount_usd = EXCLUDED.amount_usd,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      success_url = EXCLUDED.success_url,
      cancel_url = EXCLUDED.cancel_url,
      callback_url = EXCLUDED.callback_url,
      email = EXCLUDED.email,
      request_payload = EXCLUDED.request_payload,
      updated_at = EXCLUDED.updated_at
  `;

  try {
    const maxelPayResponse = await createMaxelPaySession(requestPayload);
    const checkoutUrl = extractCheckoutUrl(maxelPayResponse);
    const sessionId = extractSessionId(maxelPayResponse);
    const failed = maxelPayResponse.success === false || !checkoutUrl;

    await db`
      UPDATE maxelpay_checkouts
      SET session_id = ${sessionId},
          response_payload = ${JSON.stringify(maxelPayResponse)}::jsonb,
          status = ${failed ? 'failed' : 'pending'},
          updated_at = NOW()
      WHERE order_id = ${orderId}
    `;

    if (failed) {
      return NextResponse.json(
        { error: maxelPayResponse.message || maxelPayResponse.error || 'MaxelPay did not return a checkout URL' },
        { status: 502, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        orderId,
        sessionId,
        paymentUrl: checkoutUrl,
        amountUsd,
        currency: 'USD',
        tier: paymentTier,
        period: billingPeriod,
        successUrl,
        cancelUrl,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    await db`
      UPDATE maxelpay_checkouts
      SET status = 'failed',
          response_payload = ${JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })}::jsonb,
          updated_at = NOW()
      WHERE order_id = ${orderId}
    ` .catch(() => undefined);

    console.error('MaxelPay checkout error:', error);
    return NextResponse.json(
      { error: 'Unable to start MaxelPay checkout' },
      { status: 500, headers: NO_STORE },
    );
  }
}
