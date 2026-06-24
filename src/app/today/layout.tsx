import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Today's Market Digest | InfoHub",
  description: 'Daily snapshot of crypto market conditions — prices, sentiment, funding extremes, liquidations, and top movers.',
  openGraph: {
    title: "Today's Market Digest",
    description: 'Daily snapshot of crypto market conditions — prices, sentiment, funding extremes, liquidations.',
    images: [{ url: '/api/og?v=screener&title=Today%27s+Market+Digest', width: 1200, height: 630 }],
  },
};

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
