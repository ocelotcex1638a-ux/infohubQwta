import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Tape',
  description:
    'Live Binance Futures trade tape with configurable size filter ($10K–$500K+). Real-time buy/sell flow, CVD, VWAP, and whale trade highlighting.',
  alternates: { canonical: 'https://info-hub.io/tape' },
  openGraph: {
    title: 'Trade Tape · InfoHub',
    description: 'Live BTC/ETH/SOL trade tape — filter by size, watch whale flow in real time.',
    url: 'https://info-hub.io/tape',
    images: [{ url: 'https://info-hub.io/api/og?v=tape&title=Trade+Tape', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trade Tape · InfoHub',
    description: 'Live BTC/ETH/SOL trade tape — filter by size, watch whale flow in real time.',
    images: ['https://info-hub.io/api/og?v=tape&title=Trade+Tape'],
  },
};

export default function TapeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
