import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vol Surface',
  description:
    'Implied volatility surface for BTC and ETH options — IV term structure, 25-delta skew curve, and moneyness × expiry heatmap. Data from Deribit.',
  alternates: { canonical: 'https://info-hub.io/vol-surface' },
  openGraph: {
    title: 'Vol Surface · InfoHub',
    description: 'BTC & ETH IV surface — term structure, 25Δ skew, and moneyness heatmap from Deribit options.',
    url: 'https://info-hub.io/vol-surface',
    images: [{ url: 'https://info-hub.io/api/og?title=Vol+Surface&v=options', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vol Surface · InfoHub',
    description: 'BTC & ETH IV surface — term structure, 25Δ skew, and moneyness heatmap from Deribit options.',
    images: ['https://info-hub.io/api/og?title=Vol+Surface&v=options'],
  },
};

export default function VolSurfaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
