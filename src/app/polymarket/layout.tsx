import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prediction Markets — Polymarket vs Kalshi Odds Comparison | InfoHub',
  description:
    'Cross-platform prediction market comparison. Compare Polymarket and Kalshi odds on the same events, surface arbitrage gaps of 5%+. Sorted by volume, liquidity, and expiry.',
  openGraph: {
    title: 'Prediction Markets · Polymarket × Kalshi | InfoHub',
    description: 'Cross-platform odds comparison — spot 5%+ arb gaps between Polymarket and Kalshi in real time.',
    type: 'website',
    images: [{ url: 'https://info-hub.io/api/og?v=spreads&title=Polymarket+%C3%97+Kalshi+Odds', width: 1200, height: 630 }],
  },
  alternates: {
    canonical: 'https://info-hub.io/polymarket',
  },
};

export default function PolymarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
