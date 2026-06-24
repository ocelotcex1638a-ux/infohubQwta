import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DEX Whale Tracker — Live Large Trades Across 4 Venues | InfoHub',
  description:
    'Real-time whale trade feed across Hyperliquid, dYdX, Aevo and Backpack perps. Filter by coin and minimum size ($50K–$1M+). Live data — no delays.',
  openGraph: {
    title: 'DEX Whale Tracker | InfoHub',
    description: 'Live $100K+ trades on HL · dYdX · Aevo · Backpack — 4-venue real-time feed.',
    type: 'website',
    images: [{ url: 'https://info-hub.io/api/og?v=tape&title=DEX+Whale+Tracker', width: 1200, height: 630 }],
  },
};

export default function WhalesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
