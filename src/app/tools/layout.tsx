import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Trading Tools by Trader Type | InfoHub',
  description:
    'InfoHub tools organised by how you trade — directional & swing, intraday & scalping, carry & arb, spot & on-chain, options, and portfolio. One-click access to 50+ live data tools.',
  openGraph: {
    title: 'Crypto Trading Tools | InfoHub',
    description: '50+ real-time crypto tools grouped by trader type — directional, scalper, carry, options, and more.',
    type: 'website',
  },
  alternates: {
    canonical: 'https://info-hub.io/tools',
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
