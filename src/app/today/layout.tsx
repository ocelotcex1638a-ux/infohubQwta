import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Today's Market Digest | InfoHub",
  description: 'Daily snapshot of crypto market conditions — prices, sentiment, funding extremes, liquidations, and top movers.',
  alternates: { canonical: 'https://info-hub.io/today' },
  openGraph: {
    title: "Today's Market Digest",
    description: 'Daily snapshot of crypto market conditions — prices, sentiment, funding extremes, liquidations.',
    images: [{ url: 'https://info-hub.io/api/og?v=screener&title=Today%27s+Market+Digest', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Today's Market Digest · InfoHub",
    description: 'Daily snapshot of crypto market conditions — prices, sentiment, funding extremes, liquidations.',
    images: ['https://info-hub.io/api/og?v=screener&title=Today%27s+Market+Digest'],
  },
};

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
