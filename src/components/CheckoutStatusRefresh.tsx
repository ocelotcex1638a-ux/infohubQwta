'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function CheckoutStatusRefresh({
  enabled,
  orderId,
  initialFinal,
}: {
  enabled: boolean;
  orderId: string;
  initialFinal: boolean;
}) {
  const router = useRouter();
  const { status, update } = useSession();

  useEffect(() => {
    if (!enabled || !orderId || initialFinal || status !== 'authenticated') return;

    let cancelled = false;
    let inFlight = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/billing/maxelpay/status?orderId=${encodeURIComponent(orderId)}`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({} as { verified?: boolean }));
        if (!cancelled && res.ok && json.verified) {
          await update();
          router.refresh();
          cancelled = true;
          clearInterval(intervalId);
        }
      } catch {
        // Silent retry — webhook confirmation can briefly race the redirect.
      } finally {
        inFlight = false;
        attempts += 1;
        if (attempts >= 24) {
          clearInterval(intervalId);
        }
      }
    };

    const intervalId = window.setInterval(poll, 5000);
    const initialTimeoutId = window.setTimeout(poll, 1500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(initialTimeoutId);
    };
  }, [enabled, initialFinal, orderId, router, status, update]);

  return null;
}
