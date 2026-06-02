/**
 * Options strategy payoff + Black-Scholes pricing — pure, dependency-free math
 * for the /options strategy builder (shortlist item 3).
 *
 * Premiums are ESTIMATED from the implied-vol smile InfoHub already surfaces
 * (Black-Scholes with the per-strike mark IV) rather than live bid/ask, so the
 * numbers are theoretical mid-prices — good for shape/breakeven/Greeks, not a
 * fill guarantee. The builder labels them as such.
 *
 * All functions are pure and unit-tested in __tests__/payoff.test.ts.
 */

export type OptionType = 'call' | 'put';
export type Side = 'long' | 'short';

export interface Leg {
  side: Side;
  type: OptionType;
  strike: number;
  /** Contracts (1 = one unit of underlying). */
  qty: number;
  /** Per-contract premium paid (long) or received (short), in quote currency. */
  premium: number;
}

// ── Normal distribution helpers ──────────────────────────────────────────────

/** Standard-normal PDF. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard-normal CDF via Abramowitz & Stegun 7.1.26 (max abs error ~7.5e-8).
 * Plenty accurate for option pricing display.
 */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x); // = normPdf(x)
  const p =
    d *
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

// ── Black-Scholes ─────────────────────────────────────────────────────────────

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per 1% change in IV. */
  vega: number;
  /** Per calendar day. */
  theta: number;
}

interface BsInput {
  type: OptionType;
  /** Spot price of the underlying. */
  spot: number;
  strike: number;
  /** Time to expiry in YEARS. */
  t: number;
  /** Implied volatility as a decimal (0.65 = 65%). */
  iv: number;
  /** Risk-free rate as a decimal (default 0). */
  r?: number;
}

/**
 * Black-Scholes theoretical price. At/after expiry (t<=0) or zero vol, returns
 * intrinsic value so the builder degrades gracefully.
 */
export function bsPrice({ type, spot, strike, t, iv, r = 0 }: BsInput): number {
  if (t <= 0 || iv <= 0 || spot <= 0 || strike <= 0) {
    return type === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  }
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * t) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const disc = Math.exp(-r * t);
  if (type === 'call') return spot * normCdf(d1) - strike * disc * normCdf(d2);
  return strike * disc * normCdf(-d2) - spot * normCdf(-d1);
}

/** Black-Scholes Greeks for a single (long, 1-contract) option. */
export function bsGreeks({ type, spot, strike, t, iv, r = 0 }: BsInput): Greeks {
  if (t <= 0 || iv <= 0 || spot <= 0 || strike <= 0) {
    // At expiry the option is all-or-nothing delta; other Greeks vanish.
    const itm = type === 'call' ? spot > strike : spot < strike;
    return { delta: itm ? (type === 'call' ? 1 : -1) : 0, gamma: 0, vega: 0, theta: 0 };
  }
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * t) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const pdf = normPdf(d1);
  const disc = Math.exp(-r * t);
  const delta = type === 'call' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (spot * iv * sqrtT);
  const vega = (spot * pdf * sqrtT) / 100; // per 1% IV
  // Theta per year, then /365 for per-day.
  const thetaYr =
    type === 'call'
      ? -(spot * pdf * iv) / (2 * sqrtT) - r * strike * disc * normCdf(d2)
      : -(spot * pdf * iv) / (2 * sqrtT) + r * strike * disc * normCdf(-d2);
  return { delta, gamma, vega, theta: thetaYr / 365 };
}

// ── Payoff ────────────────────────────────────────────────────────────────────

/** P/L of one leg at expiry for a given underlying settlement price. */
export function legPnLAtExpiry(leg: Leg, underlying: number): number {
  const intrinsic =
    leg.type === 'call' ? Math.max(0, underlying - leg.strike) : Math.max(0, leg.strike - underlying);
  const sign = leg.side === 'long' ? 1 : -1;
  return sign * (intrinsic - leg.premium) * leg.qty;
}

/** Net P/L of the whole strategy at expiry for a given underlying price. */
export function strategyPnLAtExpiry(legs: Leg[], underlying: number): number {
  return legs.reduce((sum, leg) => sum + legPnLAtExpiry(leg, underlying), 0);
}

export interface PayoffPoint { price: number; pnl: number }

/**
 * Sample the payoff curve across [minPrice, maxPrice] in `steps` points.
 * Used to draw the diagram.
 */
export function payoffCurve(legs: Leg[], minPrice: number, maxPrice: number, steps = 80): PayoffPoint[] {
  if (steps < 2 || maxPrice <= minPrice) return [];
  const out: PayoffPoint[] = [];
  const dx = (maxPrice - minPrice) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const price = minPrice + i * dx;
    out.push({ price, pnl: strategyPnLAtExpiry(legs, price) });
  }
  return out;
}

export interface StrategyStats {
  /** Net premium: <0 = net debit (you pay), >0 = net credit (you receive). */
  netPremium: number;
  /** Underlying prices where P/L crosses zero (sorted asc). */
  breakevens: number[];
  /** Max profit / loss within the sampled range; null when unbounded past the range edge. */
  maxProfit: number | null;
  maxLoss: number | null;
  /** Net Greeks across all legs (signed by side · qty). */
  greeks: Greeks;
}

/**
 * Net debit/credit of opening the strategy. Long legs cost premium (negative),
 * short legs collect it (positive).
 */
export function netPremium(legs: Leg[]): number {
  return legs.reduce((sum, leg) => {
    const sign = leg.side === 'long' ? -1 : 1;
    return sum + sign * leg.premium * leg.qty;
  }, 0);
}

/** Breakevens via linear interpolation of zero-crossings along the curve. */
export function findBreakevens(curve: PayoffPoint[]): number[] {
  const bes: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.pnl === 0) bes.push(a.price);
    else if ((a.pnl < 0 && b.pnl > 0) || (a.pnl > 0 && b.pnl < 0)) {
      const frac = a.pnl / (a.pnl - b.pnl);
      bes.push(a.price + frac * (b.price - a.price));
    }
  }
  // Dedupe near-equal crossings.
  return bes.filter((v, i) => i === 0 || Math.abs(v - bes[i - 1]) > 1e-6);
}

/**
 * Aggregate net Greeks for the strategy at the given spot/time. Each leg's
 * single-option Greeks are scaled by qty and negated for short legs.
 */
export function netGreeks(
  legs: Leg[],
  spot: number,
  tYears: number,
  ivByStrike: (leg: Leg) => number,
  r = 0,
): Greeks {
  return legs.reduce<Greeks>(
    (acc, leg) => {
      const g = bsGreeks({ type: leg.type, spot, strike: leg.strike, t: tYears, iv: ivByStrike(leg), r });
      const sign = leg.side === 'long' ? 1 : -1;
      const q = sign * leg.qty;
      return {
        delta: acc.delta + g.delta * q,
        gamma: acc.gamma + g.gamma * q,
        vega: acc.vega + g.vega * q,
        theta: acc.theta + g.theta * q,
      };
    },
    { delta: 0, gamma: 0, vega: 0, theta: 0 },
  );
}
