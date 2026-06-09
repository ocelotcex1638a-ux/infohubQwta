'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function SessionRefresh({ enabled }: { enabled: boolean }) {
  const { status, update } = useSession();

  useEffect(() => {
    if (!enabled || status !== 'authenticated') return;
    void update();
  }, [enabled, status, update]);

  return null;
}
