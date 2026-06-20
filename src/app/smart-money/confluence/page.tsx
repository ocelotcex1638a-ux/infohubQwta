'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Folded into the unified /smart-money hub (Jun 2026)
export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace('/smart-money?tab=confluence'); }, [router]);
  return null;
}
