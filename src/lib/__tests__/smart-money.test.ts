import { describe, it, expect } from 'vitest';
import { classifySignalTier, classifyTraderType, summariseFills } from '../smart-money';
import type { NormalizedTrade } from '../wallet-clients/types';

const NOW = new Date('2026-05-17T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK = 90 * DAY;

let _tradeIdCounter = 0;
function fill(o: Partial<NormalizedTrade>): NormalizedTrade {
  return {
    symbol: 'BTC',
    side: 'buy',
    size: 1,
    price: 50_000,
    valueUsd: 50_000,
    feeUsd: 0,
    realizedPnlUsd: null, // opens default to null
    venueTradeId: `test-${++_tradeIdCounter}`,
    ts: new Date(NOW - DAY),
    ...o,
  };
}

describe('summariseFills', () => {
  it('returns zero-state for empty input', () => {
    expect(summariseFills([], LOOKBACK, NOW)).toEqual({
      realised: 0, closing: 0, wins: 0,
      biggestWin: 0, biggestLoss: 0, topSymbols: [], lastTs: null,
      losses: 0, avgWinUsd: 0, avgLossUsd: 0, rr: null,
      maxDrawdownUsd: 0, medianHoursBetweenFills: null, dcaOpenRatio: 0,
      assetBreakdown: [],
    });
  });

  it('sums realized PnL across closing fills', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: 1000 }),
      fill({ realizedPnlUsd: -200 }),
      fill({ realizedPnlUsd: 500 }),
    ], LOOKBACK, NOW);
    expect(out.realised).toBe(1300);
    expect(out.closing).toBe(3);
  });

  it('counts wins as STRICTLY > 0 PnL (breakeven not a win)', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: 100 }),    // win
      fill({ realizedPnlUsd: 0 }),      // breakeven, NOT a win
      fill({ realizedPnlUsd: -50 }),    // loss
    ], LOOKBACK, NOW);
    expect(out.wins).toBe(1);
    expect(out.closing).toBe(3);
  });

  it('skips fills with null realizedPnl from closing/wins (those are opens)', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: 100 }),    // close
      fill({ realizedPnlUsd: null }),   // open — NOT counted in closing
    ], LOOKBACK, NOW);
    expect(out.closing).toBe(1);
    expect(out.realised).toBe(100);
  });

  it('biggestWin defaults to 0 when there are no wins', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: -50 }),
      fill({ realizedPnlUsd: -100 }),
    ], LOOKBACK, NOW);
    expect(out.biggestWin).toBe(0);
  });

  it('biggestLoss defaults to 0 when there are no losses', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: 50 }),
      fill({ realizedPnlUsd: 100 }),
    ], LOOKBACK, NOW);
    expect(out.biggestLoss).toBe(0);
  });

  it('tracks the most-negative loss as biggestLoss', () => {
    const out = summariseFills([
      fill({ realizedPnlUsd: -50 }),
      fill({ realizedPnlUsd: -500 }),
      fill({ realizedPnlUsd: -100 }),
    ], LOOKBACK, NOW);
    expect(out.biggestLoss).toBe(-500);
  });

  it('filters fills outside the lookback window', () => {
    const tooOld = new Date(NOW - 100 * DAY); // older than 90d lookback
    const recent = new Date(NOW - 10 * DAY);
    const out = summariseFills([
      fill({ realizedPnlUsd: 9999, ts: tooOld }),
      fill({ realizedPnlUsd: 100, ts: recent }),
    ], LOOKBACK, NOW);
    expect(out.realised).toBe(100); // old fill excluded
    expect(out.closing).toBe(1);
  });

  it('lastTs is the max ts within the window (opens count too)', () => {
    const t1 = NOW - 10 * DAY;
    const t2 = NOW - 5 * DAY;
    const t3 = NOW - 1 * DAY;
    const out = summariseFills([
      fill({ realizedPnlUsd: 100, ts: new Date(t1) }),
      fill({ realizedPnlUsd: null, ts: new Date(t3) }), // open is most-recent
      fill({ realizedPnlUsd: -50,  ts: new Date(t2) }),
    ], LOOKBACK, NOW);
    expect(out.lastTs).toBe(t3);
  });

  it('topSymbols sorts by total valueUsd across ALL fills (not realized PnL)', () => {
    const out = summariseFills([
      fill({ symbol: 'BTC', valueUsd: 100 }),
      fill({ symbol: 'BTC', valueUsd: 200 }),
      fill({ symbol: 'ETH', valueUsd: 500 }),
      fill({ symbol: 'SOL', valueUsd: 50 }),
    ], LOOKBACK, NOW);
    expect(out.topSymbols).toEqual(['ETH', 'BTC', 'SOL']);
  });

  it('topSymbols caps at 5', () => {
    const fills = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) =>
      fill({ symbol: s, valueUsd: 100 - i }),
    );
    const out = summariseFills(fills, LOOKBACK, NOW);
    expect(out.topSymbols).toHaveLength(5);
    expect(out.topSymbols).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('does not crash on a fill with valueUsd = 0', () => {
    const out = summariseFills([fill({ valueUsd: 0 })], LOOKBACK, NOW);
    expect(out.topSymbols).toEqual(['BTC']);
  });

  it('computes RR, drawdown, and per-asset contribution', () => {
    const out = summariseFills([
      fill({ symbol: 'BTC', realizedPnlUsd: 1000, valueUsd: 20_000, ts: new Date(NOW - 4 * DAY) }),
      fill({ symbol: 'BTC', realizedPnlUsd: -500, valueUsd: 10_000, ts: new Date(NOW - 3 * DAY) }),
      fill({ symbol: 'ETH', realizedPnlUsd: 250, valueUsd: 5_000, ts: new Date(NOW - 2 * DAY) }),
    ], LOOKBACK, NOW);

    expect(out.losses).toBe(1);
    expect(out.avgWinUsd).toBe(625);
    expect(out.avgLossUsd).toBe(500);
    expect(out.rr).toBeCloseTo(1.25, 2);
    expect(out.maxDrawdownUsd).toBe(500);
    expect(out.assetBreakdown[0]).toMatchObject({
      symbol: 'BTC',
      realizedPnlUsd: 500,
      closingTrades: 2,
      winRatePct: 50,
    });
  });

  it('classifies signal tiers by win rate and sample size', () => {
    expect(classifySignalTier(90, 25)).toBe('A');
    expect(classifySignalTier(80, 20)).toBe('B');
    expect(classifySignalTier(65, 10)).toBe('C');
    expect(classifySignalTier(95, 5)).toBe('Watch');
  });

  it('classifies trader type from cadence and DCA profile', () => {
    expect(classifyTraderType({ closing: 2, medianHoursBetweenFills: 120, dcaOpenRatio: 0.2 })).toBe('hodler');
    expect(classifyTraderType({ closing: 10, medianHoursBetweenFills: 120, dcaOpenRatio: 0.8 })).toBe('dca-heavy');
    expect(classifyTraderType({ closing: 150, medianHoursBetweenFills: 2, dcaOpenRatio: 0.1 })).toBe('algo');
    expect(classifyTraderType({ closing: 40, medianHoursBetweenFills: 5, dcaOpenRatio: 0.1 })).toBe('scalper');
    expect(classifyTraderType({ closing: 40, medianHoursBetweenFills: 20, dcaOpenRatio: 0.1 })).toBe('day');
    expect(classifyTraderType({ closing: 40, medianHoursBetweenFills: 80, dcaOpenRatio: 0.1 })).toBe('swing');
  });

  it('handles a single closing fill at the cutoff boundary', () => {
    // Edge case: a fill exactly at the cutoff should be EXCLUDED
    // (the filter uses strict <, so equality fails) — but lookback
    // is approximate, so this is informational. We just check it
    // doesn't crash.
    const at = NOW - LOOKBACK;
    const out = summariseFills([
      fill({ realizedPnlUsd: 100, ts: new Date(at - 1) }), // before cutoff
      fill({ realizedPnlUsd: 100, ts: new Date(at + 1) }), // after cutoff
    ], LOOKBACK, NOW);
    expect(out.closing).toBe(1); // only the post-cutoff fill counts
  });
});
