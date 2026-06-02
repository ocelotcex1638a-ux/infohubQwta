import { describe, it, expect } from 'vitest';
import {
  normCdf,
  normPdf,
  bsPrice,
  bsGreeks,
  legPnLAtExpiry,
  strategyPnLAtExpiry,
  netPremium,
  payoffCurve,
  findBreakevens,
  netGreeks,
  type Leg,
} from '../payoff';

describe('normCdf / normPdf', () => {
  it('is 0.5 at the mean and symmetric', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(-1.25)).toBeCloseTo(1 - normCdf(1.25), 6);
  });
  it('matches known z-scores', () => {
    expect(normCdf(1.6448536)).toBeCloseTo(0.95, 4); // 95th percentile
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 4);
  });
  it('normPdf peaks at 0', () => {
    expect(normPdf(0)).toBeCloseTo(0.39894228, 6);
    expect(normPdf(2)).toBeLessThan(normPdf(1));
  });
});

describe('bsPrice', () => {
  const base = { spot: 100, strike: 100, t: 0.5, iv: 0.6 } as const;

  it('respects put-call parity: C - P = S - K·e^(-rT)', () => {
    const r = 0.03;
    const c = bsPrice({ ...base, type: 'call', r });
    const p = bsPrice({ ...base, type: 'put', r });
    expect(c - p).toBeCloseTo(base.spot - base.strike * Math.exp(-r * base.t), 6);
  });

  it('returns intrinsic value at expiry (t=0)', () => {
    expect(bsPrice({ type: 'call', spot: 110, strike: 100, t: 0, iv: 0.6 })).toBe(10);
    expect(bsPrice({ type: 'put', spot: 90, strike: 100, t: 0, iv: 0.6 })).toBe(10);
    expect(bsPrice({ type: 'call', spot: 90, strike: 100, t: 0, iv: 0.6 })).toBe(0);
  });

  it('a call is worth more with higher IV', () => {
    const lo = bsPrice({ ...base, type: 'call', iv: 0.3 });
    const hi = bsPrice({ ...base, type: 'call', iv: 0.9 });
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('bsGreeks', () => {
  const base = { spot: 100, strike: 100, t: 0.5, iv: 0.6 } as const;
  it('call delta in (0,1), put delta in (-1,0)', () => {
    expect(bsGreeks({ ...base, type: 'call' }).delta).toBeGreaterThan(0);
    expect(bsGreeks({ ...base, type: 'call' }).delta).toBeLessThan(1);
    expect(bsGreeks({ ...base, type: 'put' }).delta).toBeLessThan(0);
    expect(bsGreeks({ ...base, type: 'put' }).delta).toBeGreaterThan(-1);
  });
  it('gamma + vega are positive for a long option', () => {
    const g = bsGreeks({ ...base, type: 'call' });
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.vega).toBeGreaterThan(0);
  });
  it('call and put gamma/vega are equal (same strike)', () => {
    const c = bsGreeks({ ...base, type: 'call' });
    const p = bsGreeks({ ...base, type: 'put' });
    expect(c.gamma).toBeCloseTo(p.gamma, 8);
    expect(c.vega).toBeCloseTo(p.vega, 8);
  });
});

describe('legPnLAtExpiry', () => {
  const longCall: Leg = { side: 'long', type: 'call', strike: 100, qty: 1, premium: 5 };
  it('long call: pays premium, profits above strike', () => {
    expect(legPnLAtExpiry(longCall, 90)).toBe(-5); // expires worthless → lose premium
    expect(legPnLAtExpiry(longCall, 105)).toBe(0); // breakeven
    expect(legPnLAtExpiry(longCall, 115)).toBe(10);
  });
  it('short call: collects premium, loses above strike', () => {
    const shortCall: Leg = { ...longCall, side: 'short' };
    expect(legPnLAtExpiry(shortCall, 90)).toBe(5);
    expect(legPnLAtExpiry(shortCall, 115)).toBe(-10);
  });
  it('scales with qty', () => {
    expect(legPnLAtExpiry({ ...longCall, qty: 3 }, 115)).toBe(30);
  });
});

describe('strategy stats', () => {
  // Bull call spread: long 100 call @5, short 110 call @2 → net debit 3, max profit 7.
  const spread: Leg[] = [
    { side: 'long', type: 'call', strike: 100, qty: 1, premium: 5 },
    { side: 'short', type: 'call', strike: 110, qty: 1, premium: 2 },
  ];

  it('netPremium reflects the debit', () => {
    expect(netPremium(spread)).toBe(-3); // pay 5, collect 2
  });

  it('payoff caps at max profit above the upper strike', () => {
    expect(strategyPnLAtExpiry(spread, 90)).toBe(-3); // both worthless → lose net debit
    expect(strategyPnLAtExpiry(spread, 120)).toBe(7); // (20-5) + (2-10) = 15 - 8 = 7
    expect(strategyPnLAtExpiry(spread, 200)).toBe(7); // still capped
  });

  it('breakeven is at long strike + net debit', () => {
    const curve = payoffCurve(spread, 90, 120, 301);
    const bes = findBreakevens(curve);
    expect(bes.length).toBe(1);
    expect(bes[0]).toBeCloseTo(103, 1); // 100 + 3
  });

  it('netGreeks of a spread: long-strike delta minus short-strike delta > 0', () => {
    const g = netGreeks(spread, 105, 0.25, () => 0.6);
    // Long lower-strike call + short higher-strike call → net positive delta.
    expect(g.delta).toBeGreaterThan(0);
  });
});

describe('payoffCurve', () => {
  it('returns the requested number of points spanning the range', () => {
    const legs: Leg[] = [{ side: 'long', type: 'put', strike: 100, qty: 1, premium: 4 }];
    const curve = payoffCurve(legs, 80, 120, 41);
    expect(curve).toHaveLength(41);
    expect(curve[0].price).toBe(80);
    expect(curve[curve.length - 1].price).toBe(120);
  });
  it('is empty for a degenerate range', () => {
    expect(payoffCurve([], 100, 100)).toHaveLength(0);
  });
});
