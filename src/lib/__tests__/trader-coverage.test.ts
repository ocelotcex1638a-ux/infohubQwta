import { describe, expect, it } from 'vitest';
import { formatCoverageLabel, formatVenueCoverageDetails, getCoverageKind } from '../trader-coverage';

describe('trader coverage helpers', () => {
  it('classifies single-family coverage explicitly', () => {
    expect(getCoverageKind(['hyperliquid'])).toBe('hl-only');
    expect(getCoverageKind(['gmx-arbitrum', 'gmx-avalanche'])).toBe('gmx-only');
    expect(getCoverageKind(['gtrade'])).toBe('gtrade-only');
  });

  it('classifies mixed venue families as cross-platform', () => {
    expect(getCoverageKind(['hyperliquid', 'gmx-arbitrum'])).toBe('cross-platform');
    expect(formatCoverageLabel(['gtrade', 'gmx-avalanche'])).toBe('Cross-platform');
  });

  it('builds readable venue detail labels', () => {
    expect(formatVenueCoverageDetails(['hyperliquid', 'gmx-arbitrum', 'gtrade'])).toBe('HL + GMX Arb + gTrade');
  });
});
