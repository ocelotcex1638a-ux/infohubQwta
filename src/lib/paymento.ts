import crypto from 'crypto';
import { TIER_PRICE_ANNUAL, TIER_PRICE_MONTHLY, type Tier } from '@/lib/constants/tiers';

export const PAYMENTO_API_BASE = 'https://api.paymento.io/v1';
export const PAYMENTO_GATEWAY_BASE = 'https://app.paymento.io/gateway';

export type PaymentoTier = Exclude<Tier, 'free'>;
export type PaymentoPeriod = 'monthly' | 'annual';

export const PAYMENTO_ORDER_STATUS = {
  Initialize: 0,
  Pending: 1,
  PartialPaid: 2,
  WaitingToConfirm: 3,
  Timeout: 4,
  UserCanceled: 5,
  Paid: 7,
  Approve: 8,
  Reject: 9,
} as const;

export interface PaymentoAdditionalDatum {
  key: string;
  value: string;
}

export interface PaymentoCheckoutRequest {
  fiatAmount: string;
  fiatCurrency: string;
  ReturnUrl: string;
  orderId: string;
  Speed?: number;
  cryptoAmount?: Array<{ coinName: string; amount: string }>;
  additionalData?: PaymentoAdditionalDatum[];
  EmailAddress?: string;
}

export interface PaymentoCallbackPayload {
  Token?: string;
  PaymentId?: number | string;
  OrderId?: string;
  OrderStatus?: number | string;
  AdditionalData?: PaymentoAdditionalDatum[] | Record<string, string> | string | null;
}

export interface PaymentoApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  body?: T;
  error?: string;
}

export function getPaymentoApiKey(): string | null {
  return process.env.PAYMENTO_API_KEY?.trim() || null;
}

export function getPaymentoSecretKey(): string | null {
  return process.env.PAYMENTO_WEBHOOK_SECRET?.trim()
    || process.env.PAYMENTO_SECRET_KEY?.trim()
    || null;
}

export function getPaymentoAmount(tier: PaymentoTier, period: PaymentoPeriod): number {
  return period === 'annual' ? TIER_PRICE_ANNUAL[tier] : TIER_PRICE_MONTHLY[tier];
}

export function formatPaymentoAmount(amount: number): string {
  return amount.toFixed(2);
}

export function buildPaymentoOrderId(): string {
  return `ih_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function buildPaymentoGatewayUrl(token: string): string {
  return `${PAYMENTO_GATEWAY_BASE}?token=${encodeURIComponent(token)}`;
}

export function buildPaymentoReturnUrl(baseUrl: string, params: Record<string, string | number | null | undefined>): string {
  const url = new URL('/billing/paymento/return', baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function buildPaymentoAdditionalData(data: {
  userId: string;
  email: string | null;
  tier: PaymentoTier;
  period: PaymentoPeriod;
  currency: string;
  amountUsd: number;
}): PaymentoAdditionalDatum[] {
  return [
    { key: 'userId', value: data.userId },
    { key: 'email', value: data.email ?? '' },
    { key: 'tier', value: data.tier },
    { key: 'period', value: data.period },
    { key: 'currency', value: data.currency },
    { key: 'amountUsd', value: formatPaymentoAmount(data.amountUsd) },
  ];
}

export function paymentoAdditionalDataToObject(
  additionalData: PaymentoCallbackPayload['AdditionalData'],
): Record<string, string> {
  if (!additionalData) return {};
  if (typeof additionalData === 'string') {
    try {
      const parsed = JSON.parse(additionalData);
      return paymentoAdditionalDataToObject(parsed);
    } catch {
      return {};
    }
  }
  if (Array.isArray(additionalData)) {
    return additionalData.reduce<Record<string, string>>((acc, item) => {
      if (item && typeof item.key === 'string') {
        acc[item.key] = typeof item.value === 'string' ? item.value : String(item.value ?? '');
      }
      return acc;
    }, {});
  }
  if (typeof additionalData === 'object') {
    return Object.fromEntries(
      Object.entries(additionalData).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')]),
    );
  }
  return {};
}

export function parsePaymentoOrderStatus(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isPaymentoFinalStatus(status: number): boolean {
  return status === PAYMENTO_ORDER_STATUS.Paid || status === PAYMENTO_ORDER_STATUS.Approve;
}

export function verifyPaymentoSignature(rawBody: string, signature: string | null, secret: string | null): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').toUpperCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toUpperCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function parsePaymentoResponse<T>(res: Response): Promise<PaymentoApiResponse<T>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as PaymentoApiResponse<T>;
  } catch {
    return { body: text as unknown as T };
  }
}

export async function createPaymentoRequest(
  body: PaymentoCheckoutRequest,
): Promise<PaymentoApiResponse<string>> {
  const apiKey = getPaymentoApiKey();
  if (!apiKey) {
    throw new Error('PAYMENTO_API_KEY is not configured');
  }

  const res = await fetch(`${PAYMENTO_API_BASE}/payment/request`, {
    method: 'POST',
    headers: {
      'Api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'text/plain',
    },
    body: JSON.stringify(body),
  });

  return parsePaymentoResponse<string>(res);
}

export async function verifyPaymentoRequest(token: string): Promise<PaymentoApiResponse<Record<string, unknown>>> {
  const apiKey = getPaymentoApiKey();
  if (!apiKey) {
    throw new Error('PAYMENTO_API_KEY is not configured');
  }

  const res = await fetch(`${PAYMENTO_API_BASE}/payment/verify`, {
    method: 'POST',
    headers: {
      'Api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'text/plain',
    },
    body: JSON.stringify({ token }),
  });

  return parsePaymentoResponse<Record<string, unknown>>(res);
}

export async function setPaymentoIpnUrl(ipnUrl: string): Promise<PaymentoApiResponse<Record<string, unknown>>> {
  const apiKey = getPaymentoApiKey();
  if (!apiKey) {
    throw new Error('PAYMENTO_API_KEY is not configured');
  }

  const res = await fetch(`${PAYMENTO_API_BASE}/payment/settings`, {
    method: 'POST',
    headers: {
      'Api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'text/plain',
    },
    body: JSON.stringify({
      IPN_Url: ipnUrl,
      IPN_Method: 1,
    }),
  });

  return parsePaymentoResponse<Record<string, unknown>>(res);
}

