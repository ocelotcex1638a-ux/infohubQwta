import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DEX Whale Tracker — Live Hyperliquid Large Trades | InfoHub',
  description:
    'Real-time whale trade feed from Hyperliquid perpetuals. Filter by coin and minimum size ($50K–$1M+). Live WebSocket data — no delays.',
  openGraph: {
    title: 'DEX Whale Tracker | InfoHub',
    description: 'Live $100K+ trades on Hyperliquid perps — real-time feed.',
    type: 'website',
  },
};

export default function WhalesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
