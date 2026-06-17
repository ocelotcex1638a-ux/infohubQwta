import { describe, expect, it } from 'vitest';
import { buildConfluenceSignals, type ConfluenceCandidate } from '../smart-money-confluence';

function candidate(overrides: {
  entry?: Partial<ConfluenceCandidate['entry']>;
  positions?: ConfluenceCandidate['positions'];
} = {}): ConfluenceCandidate {
  const defaultEntry = {
    rank: 1,
    address: '0x1111111111111111111111111111111111111111',
    label: 'alpha',
    accountValueUsd: 500_000,
    allTimePnlUsd: 1_000_000,
    allTimeRoiPct: 120,
    realised90dUsd: 250_000,
    realised30dUsd: 100_000,
    closingTrades90d: 30,
    winRatePct: 88,
    biggestWinUsd: 50_000,
    biggestLossUsd: -10_000,
    topSymbols: ['BTC'],
    lastTradeTs: Date.now(),
    daysSinceLastTrade: 1,
    tier: 'A' as const,
    traderType: 'swing' as const,
    signalScore: 92,
    rr: 2.5,
    maxDrawdownUsd: 20_000,
    maxDrawdownPct: 4,
    assetBreakdown: [
      { symbol: 'BTC', realizedPnlUsd: 150_000, volumeUsd: 1_000_000, closingTrades: 20, wins: 16, winRatePct: 80 },
    ],
  };

  return {
    entry: { ...defaultEntry, ...(overrides.entry ?? {}) },
    positions: (overrides.positions as ConfluenceCandidate['positions']) ?? [
      {
        symbol: 'BTC',
        side: 'long',
        size: 1,
        entryPrice: 100_000,
        markPrice: 101_000,
        positionValue: 101_000,
        unrealizedPnl: 1_000,
        leverage: 3,
        marginUsed: 30_000,
        liquidationPrice: 80_000,
        tpPrice: null,
        slPrice: null,
        cumulativeFunding: null,
      },
    ],
  };
}

describe('buildConfluenceSignals', () => {
  it('groups multiple traders into the same symbol and side signal', () => {
    const signals = buildConfluenceSignals([
      candidate(),
      candidate({
        entry: {
          address: '0x2222222222222222222222222222222222222222',
          label: 'bravo',
          tier: 'B',
          signalScore: 81,
          traderType: 'day',
          assetBreakdown: [
            { symbol: 'BTC', realizedPnlUsd: 90_000, volumeUsd: 800_000, closingTrades: 14, wins: 10, winRatePct: 71.4 },
          ],
        },
        positions: [
          {
            symbol: 'BTC',
            side: 'long',
            size: 0.5,
            entryPrice: 100_000,
            markPrice: 101_000,
            positionValue: 50_500,
            unrealizedPnl: 500,
            leverage: 2,
            marginUsed: 20_000,
            liquidationPrice: 85_000,
            tpPrice: null,
            slPrice: null,
            cumulativeFunding: null,
          },
        ],
      }),
    ], { minTier: 'B', minWallets: 2, minPositionUsd: 25_000 });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      symbol: 'BTC',
      side: 'long',
      walletCount: 2,
      specialistCount: 2,
      avgSignalScore: 87,
    });
    expect(signals[0].tierCounts.A).toBe(1);
    expect(signals[0].tierCounts.B).toBe(1);
    expect(signals[0].traders[0].label).toBe('alpha');
  });

  it('filters out low-tier and undersized positions', () => {
    const signals = buildConfluenceSignals([
      candidate({
        entry: { tier: 'Watch', signalScore: 45 },
      }),
      candidate({
        entry: {
          address: '0x3333333333333333333333333333333333333333',
          label: 'charlie',
          tier: 'A',
        },
        positions: [
          {
            symbol: 'ETH',
            side: 'short',
            size: 0.01,
            entryPrice: 2_000,
            markPrice: 1_990,
            positionValue: 20,
            unrealizedPnl: 0.1,
            leverage: 5,
            marginUsed: 5,
            liquidationPrice: 2_400,
            tpPrice: null,
            slPrice: null,
            cumulativeFunding: null,
          },
        ],
      }),
    ], { minTier: 'B', minWallets: 1, minPositionUsd: 25_000 });

    expect(signals).toEqual([]);
  });

  it('counts one wallet once per symbol and side even with multiple fills', () => {
    const signals = buildConfluenceSignals([
      candidate({
        positions: [
          {
            symbol: 'SOL',
            side: 'long',
            size: 100,
            entryPrice: 150,
            markPrice: 160,
            positionValue: 16_000,
            unrealizedPnl: 1_000,
            leverage: 4,
            marginUsed: 4_000,
            liquidationPrice: 100,
            tpPrice: null,
            slPrice: null,
            cumulativeFunding: null,
          },
          {
            symbol: 'SOL',
            side: 'long',
            size: 200,
            entryPrice: 150,
            markPrice: 160,
            positionValue: 32_000,
            unrealizedPnl: 2_000,
            leverage: 4,
            marginUsed: 8_000,
            liquidationPrice: 100,
            tpPrice: null,
            slPrice: null,
            cumulativeFunding: null,
          },
        ],
      }),
    ], { minTier: 'C', minWallets: 1, minPositionUsd: 10_000 });

    expect(signals).toHaveLength(1);
    const solLong = signals.find((signal) => signal.symbol === 'SOL' && signal.side === 'long');
    expect(solLong?.walletCount).toBe(1);
  });
});
