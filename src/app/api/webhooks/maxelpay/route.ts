import { NextRequest, NextResponse } from 'next/server';
import { initDB, isDBConfigured, getSQL, recordAuditEvent } from '@/lib/db';
import { sendSubscriptionConfirmed } from '@/lib/email/templates';
import { TIER_BRANDING } from '@/lib/constants/tiers';
import {
  getMaxelPaySessionStatus,
  getMaxelPayWebhookSecret,
  isMaxelPayFinalStatus,
  parseMaxelPayStatus,
  verifyMaxelPaySignature,
  type MaxelPayPeriod,
  type MaxelPayTier,
  type MaxelPayWebhookPayload,
} from '@/lib/maxelpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

const NO_STORE = { 'Cache-Control': 'no-store' };
const TIER_RANK: Record<MaxelPayTier | 'free', number> = {
  free: 0,
  trader: 1,
  pro: 2,
  whale: 3,
};

type CheckoutRow = {
  id: number;
  user_id: string;
  order_id: string;
  session_id: string | null;
  tier: string;
  period: string;
  amount_usd: string | number;
  currency: string;
  status: string;
  success_url: string | null;
  cancel_url: string | null;
  callback_url: string | null;
  email: string | null;
  request_payload: unknown;
  response_payload: unknown;
  webhook_payload: unknown;
  status_payload: unknown;
  paid_at: string | Date | null;
  verified_at: string | Date | null;
  expires_at: string | Date | null;
};

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  billing_tier: string | null;
  billing_expires_at: string | Date | null;
  referred_by_user_id: string | null;
};

function normalizeTier(value: unknown): MaxelPayTier | null {
  if (value === 'trader' || value === 'pro' || value === 'whale') return value;
  return null;
}

function normalizePeriod(value: unknown): MaxelPayPeriod | null {
  if (value === 'monthly' || value === 'annual') return value;
  return null;
}

function computeNextExpiry(currentExpiresAt: Date | null, period: MaxelPayPeriod): Date {
  const base = currentExpiresAt && Number.isFinite(currentExpiresAt.getTime()) && currentExpiresAt.getTime() > Date.now()
    ? currentExpiresAt
    : new Date();
  const next = new Date(base.getTime());
  if (period === 'annual') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWebhookStatus(value: unknown): string | null {
  const status = parseMaxelPayStatus(value);
  return status;
}

function getPayloadData(payload: MaxelPayWebhookPayload): NonNullable<MaxelPayWebhookPayload['data']> {
  return payload.data ?? {};
}

async function upsertCheckoutRow(
  tx: any,
  params: {
    userId: string;
    orderId: string;
    sessionId: string | null;
    tier: MaxelPayTier;
    period: MaxelPayPeriod;
    amountUsd: number;
    currency: string;
    status: string;
    successUrl: string | null;
    cancelUrl: string | null;
    callbackUrl: string | null;
    email: string | null;
    requestPayload: unknown;
    responsePayload: unknown;
    webhookPayload: unknown;
    statusPayload: unknown;
    paidAt: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
  },
) {
  await tx`
    INSERT INTO maxelpay_checkouts (
      user_id, order_id, session_id, tier, period, amount_usd, currency, status,
      success_url, cancel_url, callback_url, email, request_payload, response_payload,
      webhook_payload, status_payload, paid_at, verified_at, expires_at, updated_at
    )
    VALUES (
      ${params.userId},
      ${params.orderId},
      ${params.sessionId},
      ${params.tier},
      ${params.period},
      ${params.amountUsd},
      ${params.currency},
      ${params.status},
      ${params.successUrl},
      ${params.cancelUrl},
      ${params.callbackUrl},
      ${params.email},
      ${JSON.stringify(params.requestPayload)}::jsonb,
      ${JSON.stringify(params.responsePayload)}::jsonb,
      ${JSON.stringify(params.webhookPayload)}::jsonb,
      ${JSON.stringify(params.statusPayload)}::jsonb,
      ${params.paidAt},
      ${params.verifiedAt},
      ${params.expiresAt},
      NOW()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      session_id = COALESCE(EXCLUDED.session_id, maxelpay_checkouts.session_id),
      tier = EXCLUDED.tier,
      period = EXCLUDED.period,
      amount_usd = EXCLUDED.amount_usd,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      success_url = COALESCE(EXCLUDED.success_url, maxelpay_checkouts.success_url),
      cancel_url = COALESCE(EXCLUDED.cancel_url, maxelpay_checkouts.cancel_url),
      callback_url = COALESCE(EXCLUDED.callback_url, maxelpay_checkouts.callback_url),
      email = COALESCE(EXCLUDED.email, maxelpay_checkouts.email),
      request_payload = COALESCE(EXCLUDED.request_payload, maxelpay_checkouts.request_payload),
      response_payload = COALESCE(EXCLUDED.response_payload, maxelpay_checkouts.response_payload),
      webhook_payload = EXCLUDED.webhook_payload,
      status_payload = EXCLUDED.status_payload,
      paid_at = EXCLUDED.paid_at,
      verified_at = EXCLUDED.verified_at,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = getMaxelPayWebhookSecret();
  const signature = request.headers.get('x-maxelpay-signature');

  if (secret && !verifyMaxelPaySignature(rawBody, signature, secret)) {
    console.warn('MaxelPay webhook: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: NO_STORE });
  }

  let payload: MaxelPayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MaxelPayWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  const data = getPayloadData(payload);
  const event = typeof payload.event === 'string' ? payload.event : '';
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
  const orderId = typeof data.orderId === 'string' ? data.orderId.trim() : '';
  const payloadStatus = normalizeWebhookStatus(data.status);

  if (!sessionId && !orderId) {
    return NextResponse.json({ error: 'Missing sessionId/orderId' }, { status: 400, headers: NO_STORE });
  }
  if (!payloadStatus) {
    return NextResponse.json({ error: 'Missing status' }, { status: 400, headers: NO_STORE });
  }

  if (!isDBConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();
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

  const checkoutRows = await db`
    SELECT
      id, user_id, order_id, session_id, tier, period, amount_usd, currency, status,
      success_url, cancel_url, callback_url, email, request_payload, response_payload,
      webhook_payload, status_payload, paid_at, verified_at, expires_at
    FROM maxelpay_checkouts
    WHERE session_id = ${sessionId || null}
       OR order_id = ${orderId || ''}
    LIMIT 1
  ` as CheckoutRow[];

  const checkout = checkoutRows[0] ?? null;
  if (!checkout) {
    return NextResponse.json({ error: 'Unknown checkout' }, { status: 404, headers: NO_STORE });
  }

  const resolvedSessionId = sessionId || checkout.session_id || null;
  const resolvedOrderId = checkout.order_id || orderId || null;

  const userRows = await db`
    SELECT id, email, role, billing_tier, billing_expires_at, referred_by_user_id
    FROM users
    WHERE id = ${checkout.user_id}
    LIMIT 1
  ` as UserRow[];
  const user = userRows[0] ?? null;
  if (!user) {
    return NextResponse.json({ error: 'Unknown user' }, { status: 500, headers: NO_STORE });
  }

  const tier = normalizeTier(checkout.tier);
  const period = normalizePeriod(checkout.period);
  if (!tier || !period) {
    return NextResponse.json({ error: 'Invalid checkout record' }, { status: 500, headers: NO_STORE });
  }

  const amountUsd = parseAmount(data.amount) ?? Number(checkout.amount_usd ?? 0);
  const currency = (data.currency ?? checkout.currency ?? 'USD').toString() || 'USD';
  const currentExpiresAt = user.billing_expires_at ? new Date(user.billing_expires_at) : null;
  const currentStatus = checkout.status ?? payloadStatus;
  const isSuccessful = isMaxelPayFinalStatus(payloadStatus);
  const isTerminal = isSuccessful || payloadStatus === 'failed' || payloadStatus === 'expired';
  const nextTier = user.role === 'admin'
    ? 'whale'
    : TIER_RANK[tier] > TIER_RANK[normalizeTier(user.billing_tier) ?? 'free']
      ? tier
      : (normalizeTier(user.billing_tier) ?? 'free');

  if (checkout.verified_at || currentStatus === 'paid' || currentStatus === 'overpaid') {
    return NextResponse.json({ ok: true, duplicate: true }, { headers: NO_STORE });
  }

  let statusPayload: Record<string, unknown> | null = null;
  if (resolvedSessionId && isSuccessful) {
    try {
      statusPayload = await getMaxelPaySessionStatus(resolvedSessionId);
      const verifiedStatus = normalizeWebhookStatus(statusPayload.status);
      if (!verifiedStatus || !isMaxelPayFinalStatus(verifiedStatus)) {
        return NextResponse.json({ error: 'Payment not confirmed' }, { status: 502, headers: NO_STORE });
      }
    } catch (error) {
      console.warn('MaxelPay webhook status check failed', error);
      return NextResponse.json({ error: 'Unable to verify payment status' }, { status: 502, headers: NO_STORE });
    }
  }

  const finalStatus = isSuccessful ? payloadStatus : payloadStatus;
  const finalizedAt = new Date().toISOString();
  const nextExpiry = isSuccessful ? computeNextExpiry(currentExpiresAt, period) : null;
  const verifiedJson = statusPayload ?? {};

  await db.begin(async (txRaw) => {
    const tx = txRaw as any;
    if (checkout.id) {
      const lockedRows = await tx`
        SELECT id, verified_at, status
        FROM maxelpay_checkouts
        WHERE id = ${checkout.id}
        FOR UPDATE
      ` as Array<{ id: number; verified_at: string | Date | null; status: string }>;
      if (lockedRows[0]?.verified_at || lockedRows[0]?.status === 'paid' || lockedRows[0]?.status === 'overpaid') {
        return;
      }
    }

    await upsertCheckoutRow(tx, {
      userId: user.id,
      orderId: resolvedOrderId ?? checkout.order_id,
      sessionId: resolvedSessionId,
      tier,
      period,
      amountUsd,
      currency,
      status: isSuccessful ? payloadStatus : (isTerminal ? payloadStatus : currentStatus),
      successUrl: checkout.success_url,
      cancelUrl: checkout.cancel_url,
      callbackUrl: checkout.callback_url,
      email: checkout.email ?? user.email,
      requestPayload: checkout.request_payload ?? null,
      responsePayload: checkout.response_payload ?? null,
      webhookPayload: payload,
      statusPayload: verifiedJson,
      paidAt: isSuccessful ? finalizedAt : null,
      verifiedAt: isSuccessful ? finalizedAt : null,
      expiresAt: isSuccessful && nextExpiry ? nextExpiry.toISOString() : null,
    });

    if (isSuccessful && user.role !== 'admin' && nextExpiry) {
      await tx`
        UPDATE users
        SET billing_tier = ${nextTier},
            billing_expires_at = ${nextExpiry.toISOString()}
        WHERE id = ${user.id}
      `;
      await tx`
        UPDATE api_keys
        SET tier = ${nextTier}
        WHERE user_id = ${user.id}
          AND is_active = true
      `;
    }

    if (isSuccessful && user.referred_by_user_id) {
      const existingConversion = await tx`
        SELECT 1
        FROM referral_events
        WHERE referred_user_id = ${user.id}
          AND event_type = 'conversion'
        LIMIT 1
      `;
      if (existingConversion.length === 0) {
        const commissionUsd = Math.round(amountUsd * 0.2 * 100) / 100;
        await tx`
          INSERT INTO referral_events (
            affiliate_user_id,
            referred_user_id,
            event_type,
            amount_usd,
            commission_usd,
            metadata
          )
          VALUES (
            ${user.referred_by_user_id},
            ${user.id},
            'conversion',
            ${amountUsd},
            ${commissionUsd},
            ${JSON.stringify({
              provider: 'maxelpay',
              orderId: resolvedOrderId ?? checkout.order_id,
              sessionId: resolvedSessionId,
              tier,
              period,
              event,
            })}::jsonb
          )
        `;
      }
    }
  });

  if (isSuccessful) {
    const tierBranding = TIER_BRANDING[nextTier];
    const recipient = checkout.email || user.email;
    if (recipient) {
      sendSubscriptionConfirmed({
        to: recipient,
        dryRun: false,
        tierLabel: tierBranding.label,
        amountUsd,
        period,
        nextRenewalIso: nextExpiry ? nextExpiry.toISOString().slice(0, 10) : finalizedAt.slice(0, 10),
      }).catch((error) => {
        console.warn('MaxelPay webhook: confirmation email failed', error);
      });
    }
    await recordAuditEvent('maxelpay_subscription_confirmed', {
      userId: user.id,
      orderId: resolvedOrderId ?? checkout.order_id,
      sessionId: resolvedSessionId,
      tier: nextTier,
      period,
      amountUsd,
      status: payloadStatus,
      event,
    }).catch(() => undefined);
  } else {
    await recordAuditEvent('maxelpay_callback_received', {
      userId: user.id,
      orderId: resolvedOrderId ?? checkout.order_id,
      sessionId: resolvedSessionId,
      tier,
      period,
      status: payloadStatus,
      event,
      amountUsd,
    }).catch(() => undefined);
  }

  return NextResponse.json(
    {
      ok: true,
      status: payloadStatus,
      verified: isSuccessful,
      orderId: resolvedOrderId ?? checkout.order_id,
      sessionId: resolvedSessionId,
    },
    { headers: NO_STORE },
  );
}
