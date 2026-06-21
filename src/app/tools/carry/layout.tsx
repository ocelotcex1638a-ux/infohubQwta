import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Funding Carry Calculator',
  description:
    'Find the best funding-rate carry opportunities across 30+ crypto perp venues. Net-of-fee APR, break-even days, and live venue comparison — updated every 30 seconds.',
  alternates: { canonical: 'https://info-hub.io/tools/carry' },
  openGraph: {
    title: 'Funding Carry Calculator · InfoHub',
    description:
      'Best funding carry trades across 30+ venues — APR, round-trip fees, break-even days. Live data, updated every 30s.',
    url: 'https://info-hub.io/tools/carry',
    images: [{ url: 'https://info-hub.io/api/og?title=Carry+Calculator&v=funding', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Funding Carry Calculator · InfoHub',
    description: 'Best funding carry trades across 30+ venues — APR, round-trip fees, break-even days.',
    images: ['https://info-hub.io/api/og?title=Carry+Calculator&v=funding'],
  },
};

export default function CarryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
