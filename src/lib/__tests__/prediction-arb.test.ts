import { describe, it, expect } from 'vitest';
import {
  resolveNearDate,
  parsePolymarketCryptoQuestion,
  parseKalshiCryptoFields,
  matchCryptoLegs,
  parsePolymarketFedQuestion,
  parseKalshiFed,
  matchFedLegs,
  sortTrackedPairs,
  type CryptoLeg,
  type FedLeg,
} from '../prediction-arb';

const NOW = new Date('2026-06-24T12:00:00Z');

describe('resolveNearDate', () => {
  it('resolves a near-future month/day to the current year', () => {
    expect(resolveNearDate('June', 26, NOW)).toBe('2026-06-26');
  });
  it('rolls to next year when the date is well in the past', () => {
    // January is >60d behind June 24 → next year's January
    expect(resolveNearDate('January', 5, NOW)).toBe('2027-01-05');
  });
  it('rejects an unknown month', () => {
    expect(resolveNearDate('Smarch', 3, NOW)).toBeNull();
  });
});

describe('parsePolymarketCryptoQuestion', () => {
  it('parses a BTC above-strike question', () => {
    expect(parsePolymarketCryptoQuestion('Will the price of Bitcoin be above $58,000 on June 26?', NOW))
      .toEqual({ asset: 'BTC', strike: 58000, date: '2026-06-26' });
  });
  it('parses an ETH question', () => {
    expect(parsePolymarketCryptoQuestion('Will the price of Ethereum be above $2,100 on June 26?', NOW))
      .toEqual({ asset: 'ETH', strike: 2100, date: '2026-06-26' });
  });
  it('returns null for "dip to" (touch) markets — a different contract', () => {
    expect(parsePolymarketCryptoQuestion('Will Bitcoin dip to $57,500 in June?', NOW)).toBeNull();
  });
  it('returns null for unrelated questions', () => {
    expect(parsePolymarketCryptoQuestion('Will Croatia win the 2026 FIFA World Cup?', NOW)).toBeNull();
  });
});

describe('parseKalshiCryptoFields', () => {
  it('rounds the floor_strike (57999.99 → 58000) and slices the date', () => {
    expect(parseKalshiCryptoFields(57999.99, '2026-06-26T21:00:00Z', 'BTC'))
      .toEqual({ asset: 'BTC', strike: 58000, date: '2026-06-26' });
  });
  it('returns null without a floor strike (range / non-above market)', () => {
    expect(parseKalshiCryptoFields(null, '2026-06-26T21:00:00Z', 'BTC')).toBeNull();
  });
});

describe('matchCryptoLegs (phantom-arb guards)', () => {
  const base = (over: Partial<CryptoLeg>): CryptoLeg => ({
    asset: 'BTC', strike: 60000, date: '2026-06-26', yesOdds: 0.6,
    url: 'https://polymarket.com/x', closeIso: '2026-06-26T16:00:00Z', ...over,
  });

  it('matches identical asset+strike+date and computes the gap', () => {
    const poly = [base({ yesOdds: 0.60 })];
    const kal = [base({ yesOdds: 0.55, url: 'https://kalshi.com/markets/kxbtcd', closeIso: '2026-06-26T21:00:00Z' })];
    const pairs = matchCryptoLegs(poly, kal);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].gap).toBeCloseTo(0.05, 6);
    expect(pairs[0].label).toBe('BTC ≥ $60,000');
    expect(pairs[0].kalshiUrl).toContain('kalshi.com');
  });

  it('does NOT match different resolution dates (the classic phantom arb)', () => {
    const poly = [base({ date: '2026-06-26', yesOdds: 0.60 })];
    const kal = [base({ date: '2026-06-27', yesOdds: 0.88 })]; // would look like 28% "arb"
    expect(matchCryptoLegs(poly, kal)).toHaveLength(0);
  });

  it('does NOT match different strikes', () => {
    const poly = [base({ strike: 60000 })];
    const kal = [base({ strike: 62000 })];
    expect(matchCryptoLegs(poly, kal)).toHaveLength(0);
  });

  it('does NOT cross assets (BTC vs ETH)', () => {
    const poly = [base({ asset: 'BTC' })];
    const kal = [base({ asset: 'ETH' })];
    expect(matchCryptoLegs(poly, kal)).toHaveLength(0);
  });

  it('adds a settlement-offset note when the venues close >=2h apart', () => {
    const poly = [base({ closeIso: '2026-06-26T16:00:00Z' })];
    const kal = [base({ url: 'https://kalshi.com/x', closeIso: '2026-06-26T21:00:00Z' })];
    expect(matchCryptoLegs(poly, kal)[0].note).toMatch(/settles? ~5h apart/i);
  });
});

describe('parsePolymarketFedQuestion', () => {
  const cases: Array<[string, string]> = [
    ['Will there be no change in Fed interest rates after the July 2026 meeting?', 'none'],
    ['Will the Fed decrease interest rates by 25 bps after the July 2026 meeting?', 'cut25'],
    ['Will the Fed increase interest rates by 25 bps after the July 2026 meeting?', 'hike25'],
    ['Will the Fed decrease interest rates by 50+ bps after the July 2026 meeting?', 'cut50plus'],
    ['Will the Fed increase interest rates by 50+ bps after the July 2026 meeting?', 'hike50plus'],
  ];
  for (const [q, move] of cases) {
    it(`parses "${move}"`, () => {
      expect(parsePolymarketFedQuestion(q, NOW)).toEqual({ meeting: '2026-07', move });
    });
  }
  it('returns null for non-Fed questions', () => {
    expect(parsePolymarketFedQuestion('Will Bitcoin be above $60,000 on June 26?', NOW)).toBeNull();
  });
});

describe('parseKalshiFed', () => {
  const ev = 'Fed decision in Jul 2026?';
  it('maps "Fed maintains rate" → none', () => {
    expect(parseKalshiFed(ev, 'Fed maintains rate', NOW)).toEqual({ meeting: '2026-07', move: 'none' });
  });
  it('maps "Cut 25bps" → cut25', () => {
    expect(parseKalshiFed(ev, 'Cut 25bps', NOW)).toEqual({ meeting: '2026-07', move: 'cut25' });
  });
  it('maps "Cut >25bps" → cut50plus', () => {
    expect(parseKalshiFed(ev, 'Cut >25bps', NOW)).toEqual({ meeting: '2026-07', move: 'cut50plus' });
  });
  it('maps "Hike 25bps" → hike25', () => {
    expect(parseKalshiFed(ev, 'Hike 25bps', NOW)).toEqual({ meeting: '2026-07', move: 'hike25' });
  });
});

describe('matchFedLegs', () => {
  const poly = (over: Partial<FedLeg>): FedLeg => ({
    meeting: '2026-07', move: 'cut25', yesOdds: 0.23, url: 'https://polymarket.com/f', ...over,
  });
  const kal = (over: Partial<FedLeg>): FedLeg => ({
    meeting: '2026-07', move: 'cut25', yesOdds: 0.27, url: 'https://kalshi.com/markets/kxfeddecision', ...over,
  });

  it('matches same meeting + move and computes the gap', () => {
    const pairs = matchFedLegs([poly({})], [kal({})]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].gap).toBeCloseTo(0.04, 6);
    expect(pairs[0].label).toBe('Fed cuts 25 bps');
    expect(pairs[0].subLabel).toBe('Jul 2026 meeting');
  });
  it('does NOT match different meetings', () => {
    expect(matchFedLegs([poly({ meeting: '2026-07' })], [kal({ meeting: '2026-09' })])).toHaveLength(0);
  });
  it('does NOT match different moves', () => {
    expect(matchFedLegs([poly({ move: 'cut25' })], [kal({ move: 'hike25' })])).toHaveLength(0);
  });
});

describe('sortTrackedPairs', () => {
  it('orders by gap descending', () => {
    const pairs = matchFedLegs(
      [{ meeting: '2026-07', move: 'none', yesOdds: 0.6, url: 'p' }, { meeting: '2026-07', move: 'cut25', yesOdds: 0.2, url: 'p' }],
      [{ meeting: '2026-07', move: 'none', yesOdds: 0.62, url: 'k' }, { meeting: '2026-07', move: 'cut25', yesOdds: 0.35, url: 'k' }],
    );
    const sorted = sortTrackedPairs(pairs);
    expect(sorted[0].gap).toBeGreaterThanOrEqual(sorted[1].gap);
  });
});
