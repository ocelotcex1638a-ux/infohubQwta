import crypto from 'crypto';
import { TIER_PRICE_ANNUAL, TIER_PRICE_MONTHLY, type Tier } from '@/lib/constants/tiers';

export const MAXELPAY_API_BASE = 'https://api.maxelpay.com/api/v1';

export type MaxelPayTier = Exclude<Tier, 'free'>;
export type MaxelPayPeriod = 'monthly' | 'annual';

export const MAXELPAY_SESSION_STATUS = {
  Pending: 'pending',
  Paid: 'paid',
  Failed: 'failed',
  Partial: 'partial',
  Overpaid: 'overpaid',
  Expired: 'expired',
} as const;

export interface MaxelPaySessionRequest {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}

export interface MaxelPayWebhookPayload {
  event?: string;
  timestamp?: string;
  data?: {
    sessionId?: string;
    orderId?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
    paidAmount?: number | string;
    totalPaidUsd?: number | string;
    txHash?: string;
    network?: string;
    tokenSymbol?: string;
    customerEmail?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export interface MaxelPaySessionResponse {
  sessionId?: string;
  checkoutUrl?: string;
  paymentUrl?: string;
  url?: string;
  success?: boolean;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MaxelPaySessionStatusResponse {
  sessionId?: string;
  orderId?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  paidAmount?: number | string;
  totalPaidUsd?: number | string;
  txHash?: string;
  network?: string;
  tokenSymbol?: string;
  customerEmail?: string;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export function getMaxelPayApiKey(): string | null {
  return process.env.MAXELPAY_API_KEY?.trim() || null;
}

export function getMaxelPayWebhookSecret(): string | null {
  return process.env.MAXELPAY_WEBHOOK_SECRET?.trim() || null;
}

export function getMaxelPayAmount(tier: MaxelPayTier, period: MaxelPayPeriod): number {
  return period === 'annual' ? TIER_PRICE_ANNUAL[tier] : TIER_PRICE_MONTHLY[tier];
}

export function buildMaxelPayOrderId(): string {
  return `ih_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function buildMaxelPaySuccessUrl(baseUrl: string, params: Record<string, string | number | null | undefined>): string {
  const url = new URL('/billing/maxelpay/return', baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function buildMaxelPayDescription(tier: MaxelPayTier, period: MaxelPayPeriod): string {
  return `InfoHub ${tier} ${period} subscription`;
}

export function buildMaxelPayMetadata(data: {
  userId: string;
  email: string | null;
  tier: MaxelPayTier;
  period: MaxelPayPeriod;
  amountUsd: number;
}): Record<string, string> {
  return {
    userId: data.userId,
    email: data.email ?? '',
    tier: data.tier,
    period: data.period,
    amountUsd: data.amountUsd.toFixed(2),
  };
}

function parseMaxelPayResponse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as T;
  }
}

async function fetchMaxelPay(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyMaxelPaySignature(rawBody: string, signature: string | null, secret: string | null): boolean {
  if (!signature || !secret) return false;
  const normalized = signature.trim().replace(/^sha256=/i, '');
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const candidates = [expectedHex, expectedHex.toUpperCase(), expectedBase64];
  return candidates.some((candidate) => {
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(normalized, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export function parseMaxelPayStatus(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  return null;
}

export function isMaxelPayFinalStatus(status: string): boolean {
  return status === MAXELPAY_SESSION_STATUS.Paid
    || status === MAXELPAY_SESSION_STATUS.Overpaid;
}

export async function createMaxelPaySession(body: MaxelPaySessionRequest): Promise<MaxelPaySessionResponse> {
  const apiKey = getMaxelPayApiKey();
  if (!apiKey) throw new Error('MAXELPAY_API_KEY is not configured');

  const res = await fetchMaxelPay(`${MAXELPAY_API_BASE}/payments/sessions`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  }, 8000);

  const text = await res.text();
  const parsed = parseMaxelPayResponse<MaxelPaySessionResponse>(text);
  return parsed;
}

export async function getMaxelPaySessionStatus(sessionId: string): Promise<MaxelPaySessionStatusResponse> {
  const apiKey = getMaxelPayApiKey();
  if (!apiKey) throw new Error('MAXELPAY_API_KEY is not configured');

  const res = await fetchMaxelPay(`${MAXELPAY_API_BASE}/payments/sessions/${encodeURIComponent(sessionId)}/status`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  }, 6000);

  const text = await res.text();
  return parseMaxelPayResponse<MaxelPaySessionStatusResponse>(text);
}
