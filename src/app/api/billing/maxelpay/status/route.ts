import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSQL, initDB, isDBConfigured, recordAuditEvent } from '@/lib/db';
import { sendSubscriptionConfirmed } from '@/lib/email/templates';
import { TIER_BRANDING } from '@/lib/constants/tiers';
import {
  getMaxelPaySessionStatus,
  isMaxelPayFinalStatus,
  parseMaxelPayStatus,
  type MaxelPayPeriod,
  type MaxelPayTier,
} from '@/lib/maxelpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  tier: string | null;
  period: string | null;
  amount_usd: string | number;
  currency: string | null;
  status: string | null;
  verified_at: string | Date | null;
  expires_at: string | Date | null;
  email: string | null;
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

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
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

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }
  if (!isDBConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: NO_STORE });
  }

  const orderId = request.nextUrl.searchParams.get('orderId')?.trim() || '';
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400, headers: NO_STORE });
  }

  await initDB();
  const db = getSQL();
  const rows = await db`
    SELECT id, user_id, order_id, session_id, tier, period, amount_usd, currency, status, verified_at, expires_at, email
    FROM maxelpay_checkouts
    WHERE order_id = ${orderId}
      AND user_id = ${session.user.id}
    LIMIT 1
  ` as CheckoutRow[];

  const checkout = rows[0] ?? null;
  if (!checkout) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const currentStatus = checkout.status || 'processing';
  const alreadyVerified = Boolean(checkout.verified_at) || currentStatus === 'paid' || currentStatus === 'overpaid';
  if (alreadyVerified) {
    return NextResponse.json(
      {
        ok: true,
        status: currentStatus,
        verified: true,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

  if (!checkout.session_id) {
    return NextResponse.json(
      {
        ok: true,
        status: currentStatus,
        verified: false,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

  const tier = normalizeTier(checkout.tier);
  const period = normalizePeriod(checkout.period);
  if (!tier || !period) {
    return NextResponse.json(
      {
        ok: true,
        status: currentStatus,
        verified: false,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

  let providerStatus = currentStatus;
  let providerPayload: Record<string, unknown> | null = null;
  try {
    providerPayload = await getMaxelPaySessionStatus(checkout.session_id);
    providerStatus = parseMaxelPayStatus(providerPayload.status) ?? currentStatus;
  } catch (error) {
    console.warn('MaxelPay status poll failed:', error);
    return NextResponse.json(
      {
        ok: true,
        status: currentStatus,
        verified: false,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

  const isSuccessful = isMaxelPayFinalStatus(providerStatus);
  const isTerminal = isSuccessful || providerStatus === 'failed' || providerStatus === 'expired';

  if (!isTerminal) {
    await db`
      UPDATE maxelpay_checkouts
      SET status = ${providerStatus},
          status_payload = ${JSON.stringify(providerPayload ?? {})}::jsonb,
          updated_at = NOW()
      WHERE id = ${checkout.id}
    `.catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        status: providerStatus,
        verified: false,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

  if (!isSuccessful) {
    await db`
      UPDATE maxelpay_checkouts
      SET status = ${providerStatus},
          status_payload = ${JSON.stringify(providerPayload ?? {})}::jsonb,
          updated_at = NOW()
      WHERE id = ${checkout.id}
    `.catch(() => undefined);

    return NextResponse.json(
      {
        ok: true,
        status: providerStatus,
        verified: false,
        tier: checkout.tier,
        expiresAt: checkout.expires_at,
      },
      { headers: NO_STORE },
    );
  }

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

  const currentExpiresAt = user.billing_expires_at ? new Date(user.billing_expires_at) : null;
  const nextTier = user.role === 'admin'
    ? 'whale'
    : TIER_RANK[tier] > TIER_RANK[normalizeTier(user.billing_tier) ?? 'free']
      ? tier
      : (normalizeTier(user.billing_tier) ?? 'free');
  const finalizedAt = new Date().toISOString();
  const nextExpiry = computeNextExpiry(currentExpiresAt, period);
  const amountUsd = parseAmount(providerPayload?.amount) ?? Number(checkout.amount_usd ?? 0);
  const currency = typeof providerPayload?.currency === 'string' && providerPayload.currency
    ? providerPayload.currency
    : (checkout.currency ?? 'USD');

  let newlyVerified = false;
  await db.begin(async (txRaw) => {
    const tx = txRaw as any;
    const lockedRows = await tx`
      SELECT verified_at, status
      FROM maxelpay_checkouts
      WHERE id = ${checkout.id}
      FOR UPDATE
    ` as Array<{ verified_at: string | Date | null; status: string | null }>;

    if (lockedRows[0]?.verified_at || lockedRows[0]?.status === 'paid' || lockedRows[0]?.status === 'overpaid') {
      return;
    }

    newlyVerified = true;
    await tx`
      UPDATE maxelpay_checkouts
      SET status = ${providerStatus},
          status_payload = ${JSON.stringify(providerPayload ?? {})}::jsonb,
          paid_at = ${finalizedAt},
          verified_at = ${finalizedAt},
          expires_at = ${nextExpiry.toISOString()},
          updated_at = NOW()
      WHERE id = ${checkout.id}
    `;

    if (user.role !== 'admin') {
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

    if (user.referred_by_user_id) {
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
              orderId: checkout.order_id,
              sessionId: checkout.session_id,
              tier,
              period,
              source: 'status_poll',
            })}::jsonb
          )
        `;
      }
    }
  });

  if (newlyVerified) {
    const tierBranding = TIER_BRANDING[nextTier];
    const recipient = checkout.email || user.email;
    if (recipient) {
      sendSubscriptionConfirmed({
        to: recipient,
        dryRun: false,
        tierLabel: tierBranding.label,
        amountUsd,
        period,
        nextRenewalIso: nextExpiry.toISOString().slice(0, 10),
      }).catch((error) => {
        console.warn('MaxelPay status poll: confirmation email failed', error);
      });
    }
    await recordAuditEvent('maxelpay_subscription_confirmed', {
      userId: user.id,
      orderId: checkout.order_id,
      sessionId: checkout.session_id,
      tier: nextTier,
      period,
      amountUsd,
      status: providerStatus,
      source: 'status_poll',
    }).catch(() => undefined);
  }

  return NextResponse.json(
    {
      ok: true,
      status: providerStatus,
      verified: true,
      tier: nextTier,
      expiresAt: nextExpiry.toISOString(),
    },
    { headers: NO_STORE },
  );
}
