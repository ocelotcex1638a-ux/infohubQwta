import type { Metadata } from 'next';
import WheelClient from './WheelClient';

export const metadata: Metadata = {
  title: 'Lucky Wheel — Spin to Win',
  description: 'Spin the InfoHub Lucky Wheel and win discounts on Pro, Whale, or Trader plans.',
  robots: { index: false, follow: false },
};

export default function WheelPage() {
  return <WheelClient />;
}
