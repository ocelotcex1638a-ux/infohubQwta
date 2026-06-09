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
      pc.expires_at,
      u.email AS user_email,
      u.role AS user_role,
      u.billing_tier AS current_billing_tier,
      u.billing_expires_at,
      u.referred_by_user_id
    FROM paymento_checkouts pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.token = ${token || null} OR pc.order_id = ${orderId || ''}
    LIMIT 1
  ` as Array<{
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
    user_email: string | null;
    user_role: string | null;
    current_billing_tier: string | null;
    billing_expires_at: string | Date | null;
    referred_by_user_id: string | null;
  }>;

  const checkout = checkoutRows[0];
  if (!checkout) {
    console.error('Paymento webhook: unknown order', { token, orderId, orderStatus });
    return NextResponse.json({ error: 'Unknown order' }, { status: 500, headers: NO_STORE });
  }

  const tier = normalizeTier(checkout.tier);
  const period = normalizePeriod(checkout.period);
  if (!tier || !period) {
    return NextResponse.json({ error: 'Invalid checkout record' }, { status: 500, headers: NO_STORE });
  }

  if (checkout.status === 'approved' || checkout.status === 'paid') {
    return NextResponse.json({ ok: true, duplicate: true }, { headers: NO_STORE });
  }

  const verifiedPayload = isPaymentoFinalStatus(orderStatus)
    ? await verifyPaymentoRequest(token || checkout.token || '')
    : null;

  if (isPaymentoFinalStatus(orderStatus) && !verifiedPayload?.success) {
    await db`
      UPDATE paymento_checkouts
      SET status = ${statusLabel(orderStatus)},
          order_status = ${orderStatus},
          callback_payload = ${JSON.stringify(payload)}::jsonb,
          verify_payload = ${JSON.stringify(verifiedPayload ?? {})}::jsonb,
          updated_at = NOW()
      WHERE id = ${checkout.id}
    `.catch(() => undefined);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 502, headers: NO_STORE });
  }

  const callbackJson = JSON.stringify(payload);
  const verifiedJson = JSON.stringify(verifiedPayload ?? {});
  const finalizedAt = new Date().toISOString();
  const currentExpiresAt = checkout.billing_expires_at
    ? new Date(checkout.billing_expires_at)
    : null;
  const currentActiveTier = currentExpiresAt && Number.isFinite(currentExpiresAt.getTime()) && currentExpiresAt.getTime() > Date.now()
    ? (normalizeTier(checkout.current_billing_tier) ?? 'free')
    : 'free';
  const nextTier = TIER_RANK[tier] > TIER_RANK[currentActiveTier] ? tier : currentActiveTier === 'free'
    ? tier
    : currentActiveTier;

  await db.begin(async (txRaw) => {
    const tx = txRaw as any;
    const lockedRows = await tx`
      SELECT id, verified_at, status
      FROM paymento_checkouts
      WHERE id = ${checkout.id}
      FOR UPDATE
    ` as Array<{ id: number; verified_at: string | Date | null; status: string }>;

    if (lockedRows[0]?.verified_at || lockedRows[0]?.status === 'approved' || lockedRows[0]?.status === 'paid') {
      return;
    }

    const nextExpiry = computeNextExpiry(currentExpiresAt, period);

    await tx`
      UPDATE paymento_checkouts
      SET token = COALESCE(token, ${token || null}),
          payment_id = COALESCE(payment_id, ${typeof payload.PaymentId === 'number' ? payload.PaymentId : Number(payload.PaymentId ?? 0) || null}),
          status = ${isPaymentoFinalStatus(orderStatus) ? 'approved' : statusLabel(orderStatus)},
          order_status = ${orderStatus},
          callback_payload = ${callbackJson}::jsonb,
          verify_payload = ${verifiedJson}::jsonb,
          paid_at = ${isPaymentoFinalStatus(orderStatus) ? finalizedAt : null},
          verified_at = ${isPaymentoFinalStatus(orderStatus) ? finalizedAt : null},
          expires_at = ${isPaymentoFinalStatus(orderStatus) ? nextExpiry.toISOString() : null},
          updated_at = NOW()
      WHERE id = ${checkout.id}
    `;

    if (isPaymentoFinalStatus(orderStatus) && checkout.user_role !== 'admin') {
      await tx`
        UPDATE users
        SET billing_tier = ${nextTier},
            billing_expires_at = ${nextExpiry.toISOString()}
        WHERE id = ${checkout.user_id}
      `;
    }

    if (isPaymentoFinalStatus(orderStatus) && checkout.referred_by_user_id) {
      const existingConversion = await tx`
        SELECT 1
        FROM referral_events
        WHERE referred_user_id = ${checkout.user_id}
          AND event_type = 'conversion'
        LIMIT 1
      `;
      if (existingConversion.length === 0) {
        const amountUsd = Number(checkout.fiat_amount ?? 0);
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
            ${checkout.referred_by_user_id},
            ${checkout.user_id},
            'conversion',
            ${amountUsd},
            ${commissionUsd},
            ${JSON.stringify({
              provider: 'paymento',
              orderId: checkout.order_id,
              token: token || checkout.token,
              tier,
              period,
            })}::jsonb
          )
        `;
      }
    }
  });

  if (isPaymentoFinalStatus(orderStatus)) {
    const amountUsd = Number(checkout.fiat_amount ?? 0);
    const nextExpiry = computeNextExpiry(currentExpiresAt, period);
    const tierBranding = TIER_BRANDING[nextTier];
    const recipient = checkout.email || checkout.user_email;
    if (recipient) {
      sendSubscriptionConfirmed({
        to: recipient,
        dryRun: false,
        tierLabel: tierBranding.label,
        amountUsd,
        period,
        nextRenewalIso: nextExpiry.toISOString().slice(0, 10),
      }).catch((error) => {
        console.warn('Paymento webhook: confirmation email failed', error);
      });
    }
    await recordAuditEvent('paymento_subscription_confirmed', {
      userId: checkout.user_id,
      orderId: checkout.order_id,
      token: token || checkout.token,
      tier: nextTier,
      period,
      amountUsd,
      orderStatus,
      callbackData,
    }).catch(() => undefined);
  } else {
    await recordAuditEvent('paymento_callback_received', {
      userId: checkout.user_id,
      orderId: checkout.order_id,
      token: token || checkout.token,
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
      verified: isPaymentoFinalStatus(orderStatus),
      orderId: checkout.order_id,
    },
    { headers: NO_STORE },
  );
}
