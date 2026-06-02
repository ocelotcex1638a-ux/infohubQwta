import { describe, it, expect } from 'vitest';
import {
  sma,
  rsiWilder,
  donchianChannel,
  signalPositions,
  simulateSignalCore,
  type SignalConfig,
} from '../backtest';

describe('sma', () => {
  it('is null until the window fills, then the trailing mean', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
});

describe('rsiWilder', () => {
  it('warms up with nulls then stays in [0,100]', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const r = rsiWilder(closes, 14);
    expect(r.slice(0, 14).every((v) => v === null)).toBe(true);
    for (const v of r.slice(14)) {
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(100);
    }
  });
  it('reads ~100 for a monotonically rising series', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = rsiWilder(rising, 14);
    expect(r[29] as number).toBeGreaterThan(99);
  });
});

describe('donchianChannel', () => {
  it('uses the prior `period` bars (excludes current) — no lookahead', () => {
    const v = [1, 2, 3, 4, 10];
    const { hi, lo } = donchianChannel(v, 3);
    // At i=4, channel is over closes[1..3] = [2,3,4] → hi 4, lo 2 (NOT the 10).
    expect(hi[4]).toBe(4);
    expect(lo[4]).toBe(2);
    expect(hi[2]).toBeNull(); // warm-up
  });
});

describe('signalPositions', () => {
  it('ma-cross goes long once fast > slow on a rising series', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const pos = signalPositions(closes, { asset: 'x', lookbackDays: 40, signal: 'ma-cross', fast: 5, slow: 20 });
    expect(pos[pos.length - 1]).toBe(1);
    expect(pos[0]).toBe(0); // warm-up flat
  });
  it('breakout enters long on a fresh high and exits on a fresh low', () => {
    const closes = [10, 10, 10, 10, 10, 20, 20, 5];
    const pos = signalPositions(closes, { asset: 'x', lookbackDays: 8, signal: 'breakout', channel: 4 });
    expect(pos[5]).toBe(1); // 20 > prior-4 high (10)
    expect(pos[7]).toBe(0); // 5 < prior-4 low → flat
  });
});

describe('simulateSignalCore', () => {
  const daily = [100, 110, 121].map((price, i) => ({ date: `2026-06-0${i + 1}`, price }));

  it('flat the whole time → value never moves, no trades', () => {
    const { series, trades } = simulateSignalCore(daily, [0, 0, 0], 1000);
    expect(trades).toBe(0);
    expect(series.every((p) => p.valueUsd === 1000)).toBe(true);
  });

  it('long from day 0 → tracks the asset, one entry trade', () => {
    const { series, trades } = simulateSignalCore(daily, [1, 1, 1], 1000);
    expect(trades).toBe(1);
    expect(series[2].valueUsd).toBeCloseTo(1210, 6); // 1000 × 121/100
    expect(series[2].roiPct).toBeCloseTo(21, 6);
  });

  it('enter then exit books the move and returns to cash', () => {
    const { series, trades } = simulateSignalCore(daily, [1, 1, 0], 1000);
    expect(trades).toBe(2); // buy day0, sell day2
    expect(series[2].valueUsd).toBeCloseTo(1210, 6);
  });
});
