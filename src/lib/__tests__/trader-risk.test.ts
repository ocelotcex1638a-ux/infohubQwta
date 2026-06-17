import { describe, expect, it } from 'vitest';
import { computeOpenRiskPct, computeRoiPct, computeTruePnlUsd, summariseLiveRisk } from '../trader-risk';

describe('trader risk helpers', () => {
  it('summarises open notional and positive/negative unrealized pnl separately', () => {
    expect(summariseLiveRisk([
      { symbol: 'btc', sizeUsd: 50_000, unrealizedPnl: 2_500 },
      { symbol: 'eth', sizeUsd: 20_000, unrealizedPnl: -1_200 },
      { symbol: 'btc', sizeUsd: 10_000, unrealizedPnl: -300 },
    ])).toEqual({
      activeAssets: ['BTC', 'ETH'],
      openNotionalUsd: 80_000,
      liveUnrealizedPnlUsd: 1_000,
      livePositiveUnrealizedPnlUsd: 2_500,
      liveNegativeUnrealizedPnlUsd: -1_500,
    });
  });

  it('computes true pnl and nav-relative percentages', () => {
    expect(computeTruePnlUsd(10_000, -1_500)).toBe(8_500);
    expect(computeRoiPct(8_500, 100_000)).toBeCloseTo(8.5, 4);
    expect(computeOpenRiskPct(80_000, 100_000)).toBeCloseTo(80, 4);
  });

  it('returns null percentages when nav is absent or invalid', () => {
    expect(computeRoiPct(1_000, 0)).toBeNull();
    expect(computeOpenRiskPct(1_000, null)).toBeNull();
  });
});
