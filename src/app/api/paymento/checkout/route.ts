import { NextRequest, NextResponse } from 'next/server';
import { auth, verifySameOrigin } from '@/lib/auth';
import { isDBConfigured } from '@/lib/db';
import {
  buildPaymentoAdditionalData,
  buildPaymentoGatewayUrl,
  buildPaymentoOrderId,
  buildPaymentoReturnUrl,
  createPaymentoRequest,
  getPaymentoAmount,
  getPaymentoApiKey,
  type PaymentoPeriod,
  type PaymentoTier,
} from '@/lib/paymento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

const NO_STORE = { 'Cache-Control': 'no-store' };
const VALID_TIERS = new Set<PaymentoTier>(['trader', 'pro', 'whale']);
const VALID_PERIODS = new Set<PaymentoPeriod>(['monthly', 'annual']);

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || new URL(request.url).origin;
}

function extractToken(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) return body.trim();
  if (body && typeof body === 'object') {
    const token = (body as { token?: unknown }).token;
    if (typeof token === 'string' && token.trim()) return token.trim();
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
  if (!getPaymentoApiKey()) {
    return NextResponse.json({ error: 'Paymento is not configured' }, { status: 503, headers: NO_STORE });
  }

  let body: { tier?: unknown; period?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = typeof body.tier === 'string' ? body.tier.toLowerCase() : '';
  const period = typeof body.period === 'string' ? body.period.toLowerCase() : 'monthly';
  if (!VALID_TIERS.has(tier as PaymentoTier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400, headers: NO_STORE });
  }
  if (!VALID_PERIODS.has(period as PaymentoPeriod)) {
    return NextResponse.json({ error: 'Invalid billing period' }, { status: 400, headers: NO_STORE });
  }

  const paymentTier = tier as PaymentoTier;
  const billingPeriod = period as PaymentoPeriod;
  const amountUsd = getPaymentoAmount(paymentTier, billingPeriod);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400, headers: NO_STORE });
  }

  const orderId = buildPaymentoOrderId();
  const baseUrl = getBaseUrl(request);
  const returnUrl = buildPaymentoReturnUrl(baseUrl, {
    orderId,
    tier: paymentTier,
    period: billingPeriod,
  });
  const callbackUrl = new URL('/api/webhooks/paymento', baseUrl).toString();
  const email = typeof session.user.email === 'string' ? session.user.email : null;
  const additionalData = buildPaymentoAdditionalData({
    userId: session.user.id,
    email,
    tier: paymentTier,
    period: billingPeriod,
    currency: 'USD',
    amountUsd,
  });
  const requestPayload = {
    fiatAmount: amountUsd.toFixed(2),
    fiatCurrency: 'USD',
    ReturnUrl: returnUrl,
    orderId,
    Speed: 1,
    additionalData,
    EmailAddress: email ?? undefined,
  };

  try {
    const paymentoResponse = await createPaymentoRequest(requestPayload);
    const token = extractToken(paymentoResponse.body);
    if (paymentoResponse.success === false) {
      return NextResponse.json(
        { error: paymentoResponse.message || paymentoResponse.error || 'Paymento rejected the request' },
        { status: 502, headers: NO_STORE },
      );
    }
    if (!token) {
      return NextResponse.json(
        { error: paymentoResponse.message || paymentoResponse.error || 'Paymento did not return a token' },
        { status: 502, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        orderId,
        token,
        paymentUrl: buildPaymentoGatewayUrl(token),
        amountUsd,
        currency: 'USD',
        tier: paymentTier,
        period: billingPeriod,
        returnUrl,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('Paymento checkout error:', error);
    return NextResponse.json(
      { error: 'Unable to start Paymento checkout' },
      { status: 500, headers: NO_STORE },
    );
  }
}
