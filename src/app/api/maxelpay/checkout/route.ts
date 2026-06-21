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
import { parsePromoDiscount, applyPromoDiscount } from '@/lib/promo';
import { sendSubscriptionConfirmed } from '@/lib/email/templates';
import { TIER_BRANDING } from '@/lib/constants/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let body: { tier?: unknown; period?: unknown; promoCode?: unknown };
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
  const baseAmountUsd = getMaxelPayAmount(paymentTier, billingPeriod);
  if (!Number.isFinite(baseAmountUsd) || baseAmountUsd <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers: NO_STORE });
  }

  // Validate promo code server-side — the client sends it but we must not
  // trust the discount the client claims; compute it here.
  const rawPromo = typeof body.promoCode === 'string' ? body.promoCode.trim() : null;
  const promoDiscount = parsePromoDiscount(rawPromo);
  // Only honour promos that unlock the requested tier or a pct discount.
  // A "1 month Trader FREE" code must not be used to upgrade to Pro/Whale.
  const promoValid =
    promoDiscount &&
    (promoDiscount.freeTier === null || promoDiscount.freeTier === paymentTier);
  const effectivePromo = promoValid ? promoDiscount : null;
  const amountUsd = effectivePromo
    ? applyPromoDiscount(baseAmountUsd, effectivePromo.pct)
    : baseAmountUsd;

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

  // Validate promo code against wheel_spins — prevents brute-force use of
  // codes that were never actually issued by the Lucky Wheel.
  let wheelSpinRowId: number | null = null;
  if (rawPromo && effectivePromo) {
    const spinRows = await db`
      SELECT id, used_at FROM wheel_spins WHERE promo_code = ${rawPromo}
    `;
    if (spinRows.length === 0) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 400, headers: NO_STORE });
    }
    if (spinRows[0].used_at) {
      return NextResponse.json({ error: 'Promo code already redeemed' }, { status: 400, headers: NO_STORE });
    }
    wheelSpinRowId = Number(spinRows[0].id);
  }

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

  // ── Free-tier promo bypass ─────────────────────────────────────────────────
  // 100% promos (IH-TRADER-xxx, IH-PRO-xxx) have $0 amount — MaxelPay won't
  // accept a zero-dollar session. Grant the tier directly and return the local
  // confirmation page URL as the "paymentUrl" so the client redirect still works.
  if (effectivePromo && amountUsd === 0) {
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime());
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);
    const grantedAtIso = grantedAt.toISOString();
    const expiresAtIso = expiresAt.toISOString();
    await db.begin(async (txRaw) => {
      const tx = txRaw as any;
      await tx`
        UPDATE maxelpay_checkouts
        SET status = 'promo_granted',
            paid_at = ${grantedAtIso},
            verified_at = ${grantedAtIso},
            expires_at = ${expiresAtIso},
            updated_at = NOW()
        WHERE order_id = ${orderId}
      `;
      await tx`
        UPDATE users
        SET billing_tier = ${paymentTier},
            billing_expires_at = ${expiresAtIso}
        WHERE id = ${session.user.id}
          AND role != 'admin'
      `;
      await tx`
        UPDATE api_keys
        SET tier = ${paymentTier}
        WHERE user_id = ${session.user.id}
          AND is_active = true
      `;
      if (wheelSpinRowId) {
        await tx`
          UPDATE wheel_spins
          SET used_at = NOW(), used_by_user_id = ${session.user.id}
          WHERE id = ${wheelSpinRowId} AND used_at IS NULL
        `;
      }
    });
    if (email) {
      sendSubscriptionConfirmed({
        to: email,
        dryRun: false,
        tierLabel: TIER_BRANDING[paymentTier].label,
        amountUsd: 0,
        period: billingPeriod,
        nextRenewalIso: expiresAtIso.slice(0, 10),
      }).catch((e) => console.warn('[promo-grant] confirmation email failed:', e));
    }
    return NextResponse.json(
      {
        ok: true,
        orderId,
        paymentUrl: successUrl,
        amountUsd: 0,
        currency: 'USD',
        tier: paymentTier,
        period: billingPeriod,
        promoGranted: true,
      },
      { headers: NO_STORE },
    );
  }

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

    // Mark the discount promo code as consumed now that the checkout session exists
    if (wheelSpinRowId) {
      await db`
        UPDATE wheel_spins
        SET used_at = NOW(), used_by_user_id = ${session.user.id}
        WHERE id = ${wheelSpinRowId} AND used_at IS NULL
      `;
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
