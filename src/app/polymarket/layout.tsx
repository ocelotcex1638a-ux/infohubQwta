import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prediction Markets — Polymarket vs Manifold Odds Comparison | InfoHub',
  description:
    'Cross-platform prediction market comparison. Compare Polymarket and Manifold odds on the same events, surface arbitrage gaps of 5%+. Sorted by volume, liquidity, and expiry.',
  openGraph: {
    title: 'Prediction Markets · Polymarket × Manifold | InfoHub',
    description: 'Cross-platform odds comparison — spot 5%+ arb gaps between Polymarket and Manifold in real time.',
    type: 'website',
  },
  alternates: {
    canonical: 'https://info-hub.io/polymarket',
  },
};

export default function PolymarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
