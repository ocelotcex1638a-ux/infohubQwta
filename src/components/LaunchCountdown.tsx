'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import {
  LAUNCH_CUTOVER_DAY_LABEL,
  LAUNCH_CUTOVER_LABEL,
  getLaunchCountdown,
  isLaunchAccessWindow,
} from '@/lib/launch';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export default function LaunchCountdown({ compact = false }: { compact?: boolean }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (nowMs === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200 ${compact ? '' : 'sm:text-[11px]'}`}
        title={`Launch access ends ${LAUNCH_CUTOVER_LABEL}`}
      >
        <Clock3 className="h-3 w-3" aria-hidden />
        Ends {LAUNCH_CUTOVER_DAY_LABEL}
      </span>
    );
  }

  if (!isLaunchAccessWindow(nowMs)) {
    return null;
  }

  const countdown = getLaunchCountdown(nowMs);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200 ${compact ? '' : 'sm:text-[11px]'}`}
      title={`Launch access ends ${LAUNCH_CUTOVER_LABEL}`}
    >
      <Clock3 className="h-3 w-3" aria-hidden />
      {countdown.days}d {pad(countdown.hours)}h {pad(countdown.minutes)}m {pad(countdown.seconds)}s left
    </span>
  );
}
