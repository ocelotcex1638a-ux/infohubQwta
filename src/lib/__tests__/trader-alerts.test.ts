import { describe, expect, it } from 'vitest';
import {
  diffTrackedPositions,
  shouldEmitSmartAlert,
  type PositionChange,
  type TrackedPosition,
} from '../trader-alerts';

function position(partial: Partial<TrackedPosition>): TrackedPosition {
  return {
    key: 'hyperliquid:BTC',
    venue: 'hyperliquid',
    coin: 'BTC',
    isLong: true,
    sizeUsd: 10_000,
    ...partial,
  };
}

function resizeChange(deltaPct: number): PositionChange {
  return {
    kind: deltaPct >= 0 ? 'increased' : 'decreased',
    venue: 'hyperliquid',
    coin: 'BTC',
    isLong: true,
    sizeUsd: 10_000 * (1 + deltaPct),
    prevSizeUsd: 10_000,
    deltaPct,
  };
}

describe('diffTrackedPositions', () => {
  it('treats the same asset on different venues as separate positions', () => {
    const previous = [
      position({ key: 'hyperliquid:BTC', venue: 'hyperliquid', coin: 'BTC' }),
    ];
    const current = [
      position({ key: 'hyperliquid:BTC', venue: 'hyperliquid', coin: 'BTC' }),
      position({ key: 'gmx-arbitrum:BTC', venue: 'gmx-arbitrum', coin: 'BTC' }),
    ];

    expect(diffTrackedPositions(previous, current)).toEqual([
      expect.objectContaining({
        kind: 'opened',
        venue: 'gmx-arbitrum',
        coin: 'BTC',
      }),
    ]);
  });

  it('detects side flips on the same venue/asset key', () => {
    const previous = [
      position({ key: 'hyperliquid:ETH', coin: 'ETH', isLong: true, sizeUsd: 8_000 }),
    ];
    const current = [
      position({ key: 'hyperliquid:ETH', coin: 'ETH', isLong: false, sizeUsd: 7_500 }),
    ];

    expect(diffTrackedPositions(previous, current)).toEqual([
      expect.objectContaining({
        kind: 'flipped',
        venue: 'hyperliquid',
        coin: 'ETH',
        isLong: false,
        prevSizeUsd: 8_000,
      }),
    ]);
  });
});

describe('shouldEmitSmartAlert', () => {
  it('always emits opened, closed, and flipped alerts', () => {
    expect(shouldEmitSmartAlert({ kind: 'opened', venue: 'hyperliquid', coin: 'BTC', isLong: true, sizeUsd: 10_000 }, null)).toBe(true);
    expect(shouldEmitSmartAlert({ kind: 'closed', venue: 'hyperliquid', coin: 'BTC', isLong: true, sizeUsd: 10_000 }, null)).toBe(true);
    expect(shouldEmitSmartAlert({ kind: 'flipped', venue: 'hyperliquid', coin: 'BTC', isLong: false, sizeUsd: 10_000 }, null)).toBe(true);
  });

  it('suppresses generic resize noise below the default 25% threshold', () => {
    expect(shouldEmitSmartAlert(resizeChange(0.2), { traderType: 'day' })).toBe(false);
    expect(shouldEmitSmartAlert(resizeChange(0.3), { traderType: 'day' })).toBe(true);
  });

  it('allows lower resize thresholds for specialist assets', () => {
    expect(shouldEmitSmartAlert(resizeChange(0.2), { traderType: 'day', bestAsset: 'BTC' })).toBe(true);
  });

  it('keeps non-specialist scalpers stricter', () => {
    expect(shouldEmitSmartAlert(resizeChange(0.34), { traderType: 'scalper', bestAsset: 'ETH' })).toBe(false);
    expect(shouldEmitSmartAlert(resizeChange(0.35), { traderType: 'scalper', bestAsset: 'ETH' })).toBe(true);
  });

  it('keeps watch-tier wallets quiet unless the resize is very large', () => {
    expect(shouldEmitSmartAlert(resizeChange(0.49), { tier: 'Watch', traderType: 'swing', bestAsset: 'ETH' })).toBe(false);
    expect(shouldEmitSmartAlert(resizeChange(0.5), { tier: 'Watch', traderType: 'swing', bestAsset: 'ETH' })).toBe(true);
  });
});
