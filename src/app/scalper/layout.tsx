import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/scalper');

export default function ScalperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
