import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Signals',
  description:
    'Real-time market signals: extreme funding rates, OI surges, momentum-carry setups, and deleveraging events across 30+ crypto perp venues.',
  alternates: { canonical: 'https://info-hub.io/signals' },
  openGraph: {
    title: 'Live Signals · InfoHub',
    description: 'Extreme carry, OI surges, momentum + carry setups — live alpha derived from funding rates and open interest.',
    url: 'https://info-hub.io/signals',
    images: [{ url: 'https://info-hub.io/api/og?title=Live+Signals&v=funding', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Live Signals · InfoHub',
    description: 'Extreme carry, OI surges, momentum + carry setups — live alpha derived from funding rates and open interest.',
    images: ['https://info-hub.io/api/og?title=Live+Signals&v=funding'],
  },
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
