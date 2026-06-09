import { NextRequest, NextResponse } from 'next/server';
import { initDB, isDBConfigured, getSQL, recordAuditEvent } from '@/lib/db';
import { sendSubscriptionConfirmed } from '@/lib/email/templates';
import { TIER_BRANDING } from '@/lib/constants/tiers';
import {
  getPaymentoSecretKey,
  isPaymentoFinalStatus,
  parsePaymentoOrderStatus,
  paymentoAdditionalDataToObject,
  verifyPaymentoRequest,
  verifyPaymentoSignature,
  type PaymentoCallbackPayload,
  type PaymentoPeriod,
  type PaymentoTier,
} from '@/lib/paymento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

const NO_STORE = { 'Cache-Control': 'no-store' };
const TIER_RANK: Record<PaymentoTier | 'free', number> = {
  free: 0,
  trader: 1,
  pro: 2,
  whale: 3,
};

function normalizeTier(value: unknown): PaymentoTier | null {
  if (value === 'trader' || value === 'pro' || value === 'whale') return value;
  return null;
}

function normalizePeriod(value: unknown): PaymentoPeriod | null {
  if (value === 'monthly' || value === 'annual') return value;
  return null;
}

function statusLabel(status: number): string {
  switch (status) {
    case 0: return 'initialize';
    case 1: return 'pending';
    case 2: return 'partial_paid';
    case 3: return 'waiting_to_confirm';
    case 4: return 'timeout';
    case 5: return 'user_canceled';
    case 7: return 'paid';
    case 8: return 'approved';
    case 9: return 'rejected';
    default: return `unknown_${status}`;
  }
}

function computeNextExpiry(currentExpiresAt: Date | null, period: PaymentoPeriod): Date {
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

type CheckoutRow = {
  id: number;
  user_id: string;
  order_id: string;
  token: string | null;
  payment_id: string | number | null;
  tier: string;
  period: string;
  fiat_amount: string | number;
  fiat_currency: string;
  status: string;
  order_status: number | null;
  return_url: string | null;
  callback_url: string | null;
  email: string | null;
  additional_data: unknown;
  request_payload: unknown;
  verify_payload: unknown;
  callback_payload: unknown;
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

async function upsertCheckoutRow(
  tx: any,
  params: {
    userId: string;
    orderId: string;
    token: string | null;
    paymentId: number | null;
    tier: PaymentoTier;
    period: PaymentoPeriod;
    amountUsd: number;
    currency: string;
    status: string;
    orderStatus: number;
    returnUrl: string | null;
    callbackUrl: string | null;
    email: string | null;
    additionalData: Record<string, string>;
    requestPayload: unknown;
    verifyPayload: unknown;
    callbackPayload: unknown;
    paidAt: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
  },
) {
  await tx`
    INSERT INTO paymento_checkouts (
      user_id, order_id, token, payment_id, tier, period, fiat_amount, fiat_currency,
      status, order_status, return_url, callback_url, email, additional_data,
      request_payload, verify_payload, callback_payload, paid_at, verified_at, expires_at,
      updated_at
    )
    VALUES (
      ${params.userId},
      ${params.orderId},
      ${params.token},
      ${params.paymentId},
      ${params.tier},
      ${params.period},
      ${params.amountUsd},
      ${params.currency},
      ${params.status},
      ${params.orderStatus},
      ${params.returnUrl},
      ${params.callbackUrl},
      ${params.email},
      ${JSON.stringify(params.additionalData)}::jsonb,
      ${JSON.stringify(params.requestPayload)}::jsonb,
      ${JSON.stringify(params.verifyPayload)}::jsonb,
      ${JSON.stringify(params.callbackPayload)}::jsonb,
      ${params.paidAt},
      ${params.verifiedAt},
      ${params.expiresAt},
      NOW()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      token = COALESCE(EXCLUDED.token, paymento_checkouts.token),
      payment_id = COALESCE(EXCLUDED.payment_id, paymento_checkouts.payment_id),
      tier = EXCLUDED.tier,
      period = EXCLUDED.period,
      fiat_amount = EXCLUDED.fiat_amount,
      fiat_currency = EXCLUDED.fiat_currency,
      status = EXCLUDED.status,
      order_status = EXCLUDED.order_status,
      return_url = COALESCE(EXCLUDED.return_url, paymento_checkouts.return_url),
      callback_url = COALESCE(EXCLUDED.callback_url, paymento_checkouts.callback_url),
      email = COALESCE(EXCLUDED.email, paymento_checkouts.email),
      additional_data = EXCLUDED.additional_data,
      request_payload = COALESCE(EXCLUDED.request_payload, paymento_checkouts.request_payload),
      verify_payload = EXCLUDED.verify_payload,
      callback_payload = EXCLUDED.callback_payload,
      paid_at = EXCLUDED.paid_at,
      verified_at = EXCLUDED.verified_at,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = getPaymentoSecretKey();
  if (!secret) {
    return NextResponse.json({ error: 'Paymento webhook is not configured' }, { status: 503, headers: NO_STORE });
  }

  const signature = request.headers.get('x-hmac-sha256-signature');
  if (!verifyPaymentoSignature(rawBody, signature, secret)) {
    console.warn('Paymento webhook: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: NO_STORE });
  }

  let payload: PaymentoCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as PaymentoCallbackPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }

  const token = typeof payload.Token === 'string' ? payload.Token.trim() : '';
  const orderId = typeof payload.OrderId === 'string' ? payload.OrderId.trim() : '';
  const orderStatus = parsePaymentoOrderStatus(payload.OrderStatus);
  if (!token && !orderId) {
    return NextResponse.json({ error: 'Missing token/orderId' }, { status: 400, headers: NO_STORE });
  }
  if (orderStatus == null) {
    return NextResponse.json({ error: 'Missing order status' }, { status: 400, headers: NO_STORE });
  }

  const callbackData = paymentoAdditionalDataToObject(payload.AdditionalData);

  if (!isDBConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();

  const checkoutRows = await db`
    SELECT
      pc.id,
      pc.user_id,
      pc.order_id,
      pc.token,
      pc.payment_id,
      pc.tier,
      pc.period,
      pc.fiat_amount,
      pc.fiat_currency,
      pc.status,
      pc.order_status,
      pc.return_url,
      pc.callback_url,
      pc.email,
      pc.additional_data,
      pc.request_payload,
      pc.verify_payload,
      pc.callback_payload,
      pc.paid_at,
      pc.verified_at,
      pc.expires_at
    FROM paymento_checkouts pc
    WHERE pc.token = ${token || null} OR pc.order_id = ${orderId || ''}
    LIMIT 1
  ` as CheckoutRow[];

  const checkout = checkoutRows[0] ?? null;
  const resolvedUserId = checkout?.user_id ?? callbackData.userId ?? null;
  if (!resolvedUserId) {
    console.error('Paymento webhook: missing user identity', { token, orderId, orderStatus, callbackData });
    return NextResponse.json({ error: 'Missing payment metadata' }, { status: 500, headers: NO_STORE });
  }

  const userRows = await db`
    SELECT id, email, role, billing_tier, billing_expires_at, referred_by_user_id
    FROM users
    WHERE id = ${resolvedUserId}
    LIMIT 1
  ` as UserRow[];
  const user = userRows[0];
  if (!user) {
    console.error('Paymento webhook: unknown user', { token, orderId, orderStatus, userId: resolvedUserId });
    return NextResponse.json({ error: 'Unknown order' }, { status: 500, headers: NO_STORE });
  }

  const tier = normalizeTier(checkout?.tier ?? callbackData.tier);
  const period = normalizePeriod(checkout?.period ?? callbackData.period);
  if (!tier || !period) {
    return NextResponse.json({ error: 'Invalid checkout record' }, { status: 500, headers: NO_STORE });
  }

  const amountUsd = parseAmount(callbackData.amountUsd) ?? Number(checkout?.fiat_amount ?? 0);
  const currency = (checkout?.fiat_currency ?? callbackData.currency ?? 'USD').toString() || 'USD';
  const nextTier = user.role === 'admin'
    ? 'whale'
    : TIER_RANK[tier] > TIER_RANK[normalizeTier(user.billing_tier) ?? 'free']
      ? tier
      : (normalizeTier(user.billing_tier) ?? 'free');
  const currentExpiresAt = user.billing_expires_at ? new Date(user.billing_expires_at) : null;
  const finalStatus = isPaymentoFinalStatus(orderStatus);
  const currentStatus = checkout?.status ?? statusLabel(orderStatus);

  if (checkout && (currentStatus === 'approved' || currentStatus === 'paid')) {
    return NextResponse.json({ ok: true, duplicate: true }, { headers: NO_STORE });
  }

  const verifiedPayload = finalStatus
    ? await verifyPaymentoRequest(token || checkout?.token || '')
    : null;

  if (finalStatus && !verifiedPayload?.success) {
    await db.begin(async (txRaw) => {
      const tx = txRaw as any;
      await upsertCheckoutRow(tx, {
        userId: user.id,
        orderId: checkout?.order_id ?? orderId,
        token: token || checkout?.token || null,
        paymentId: typeof payload.PaymentId === 'number' ? payload.PaymentId : Number(payload.PaymentId ?? 0) || null,
        tier,
        period,
        amountUsd,
        currency,
        status: statusLabel(orderStatus),
        orderStatus,
        returnUrl: checkout?.return_url ?? null,
        callbackUrl: checkout?.callback_url ?? null,
        email: checkout?.email ?? user.email,
        additionalData: callbackData,
        requestPayload: checkout?.request_payload ?? null,
        verifyPayload: verifiedPayload ?? {},
        callbackPayload: payload,
        paidAt: null,
        verifiedAt: null,
        expiresAt: null,
      });
    }).catch(() => undefined);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 502, headers: NO_STORE });
  }

  const finalizedAt = new Date().toISOString();
  const nextExpiry = finalStatus ? computeNextExpiry(currentExpiresAt, period) : null;
  const callbackJson = payload;
  const verifiedJson = verifiedPayload ?? {};
  const paymentId = typeof payload.PaymentId === 'number' ? payload.PaymentId : Number(payload.PaymentId ?? 0) || null;

  await db.begin(async (txRaw) => {
    const tx = txRaw as any;
    if (checkout?.id) {
      const lockedRows = await tx`
        SELECT id, verified_at, status
        FROM paymento_checkouts
        WHERE id = ${checkout.id}
        FOR UPDATE
      ` as Array<{ id: number; verified_at: string | Date | null; status: string }>;
      if (lockedRows[0]?.verified_at || lockedRows[0]?.status === 'approved' || lockedRows[0]?.status === 'paid') {
        return;
      }
    }

    await upsertCheckoutRow(tx, {
      userId: user.id,
      orderId: checkout?.order_id ?? orderId,
      token: token || checkout?.token || null,
      paymentId,
      tier,
      period,
      amountUsd,
      currency,
      status: finalStatus ? 'approved' : statusLabel(orderStatus),
      orderStatus,
      returnUrl: checkout?.return_url ?? null,
      callbackUrl: checkout?.callback_url ?? null,
      email: checkout?.email ?? user.email,
      additionalData: checkout?.additional_data ? callbackData : callbackData,
      requestPayload: checkout?.request_payload ?? null,
      verifyPayload: verifiedJson,
      callbackPayload: callbackJson,
      paidAt: finalStatus ? finalizedAt : null,
      verifiedAt: finalStatus ? finalizedAt : null,
      expiresAt: finalStatus && nextExpiry ? nextExpiry.toISOString() : null,
    });

    if (finalStatus && user.role !== 'admin' && nextExpiry) {
      await tx`
        UPDATE users
        SET billing_tier = ${nextTier},
            billing_expires_at = ${nextExpiry.toISOString()}
        WHERE id = ${user.id}
      `;
    }

    if (finalStatus && user.referred_by_user_id) {
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
              provider: 'paymento',
              orderId: checkout?.order_id ?? orderId,
              token: token || checkout?.token,
              tier,
              period,
            })}::jsonb
          )
        `;
      }
    }
  });

  if (finalStatus) {
    const tierBranding = TIER_BRANDING[nextTier];
    const recipient = checkout?.email || user.email;
    if (recipient) {
      sendSubscriptionConfirmed({
        to: recipient,
        dryRun: false,
        tierLabel: tierBranding.label,
        amountUsd,
        period,
        nextRenewalIso: nextExpiry ? nextExpiry.toISOString().slice(0, 10) : finalizedAt.slice(0, 10),
      }).catch((error) => {
        console.warn('Paymento webhook: confirmation email failed', error);
      });
    }
    await recordAuditEvent('paymento_subscription_confirmed', {
      userId: user.id,
      orderId: checkout?.order_id ?? orderId,
      token: token || checkout?.token,
      tier: nextTier,
      period,
      amountUsd,
      orderStatus,
      callbackData,
    }).catch(() => undefined);
  } else {
    await recordAuditEvent('paymento_callback_received', {
      userId: user.id,
      orderId: checkout?.order_id ?? orderId,
      token: token || checkout?.token,
      tier,
      period,
      orderStatus,
      status: statusLabel(orderStatus),
      callbackData,
    }).catch(() => undefined);
  }

  return NextResponse.json(
    {
      ok: true,
      status: statusLabel(orderStatus),
      verified: finalStatus,
      orderId: checkout?.order_id ?? orderId,
    },
    { headers: NO_STORE },
  );
}
