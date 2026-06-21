import type { Tier } from '@/lib/constants/tiers';

export interface PromoDiscount {
  pct: number;
  freeTier: Exclude<Tier, 'free' | 'whale'> | null;
  label: string;
}

/** Parse a Lucky Wheel promo code: IH-{SEGID}-{RANDOM6} */
export function parsePromoDiscount(code: string | null): PromoDiscount | null {
  if (!code) return null;
  const parts = code.toUpperCase().split('-');
  if (parts.length < 3 || parts[0] !== 'IH') return null;
  const key = parts[1];
  if (key === '5OFF')               return { pct: 5,   freeTier: null,     label: '5% off your first month' };
  if (key === '10OFF' || key === '10OFFB') return { pct: 10, freeTier: null, label: '10% off your first month' };
  if (key === '15OFF')              return { pct: 15,  freeTier: null,     label: '15% off your first month' };
  if (key === '20OFF')              return { pct: 20,  freeTier: null,     label: '20% off your first month' };
  if (key === '30OFF')              return { pct: 30,  freeTier: null,     label: '30% off your first month' };
  if (key === 'TRADER')             return { pct: 100, freeTier: 'trader', label: '1 month Trader FREE' };
  if (key === 'PRO')                return { pct: 100, freeTier: 'pro',    label: '1 month Pro FREE' };
  return null;
}

/** Apply a percentage discount, rounding to cents. Returns 0 for 100% promos. */
export function applyPromoDiscount(amountUsd: number, pct: number): number {
  if (pct >= 100) return 0;
  return Math.max(0, Math.round(amountUsd * (1 - pct / 100) * 100) / 100);
}
