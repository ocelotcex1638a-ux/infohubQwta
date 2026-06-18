'use client';

/**
 * Site-wide banner announcing "Trader + Pro + Whale tiers free during launch".
 * Dismissible — persists in localStorage so once a returning user has
 * closed the X they don't get re-yelled-at on every subsequent visit.
 *
 * Previously sessionStorage, which meant the banner came back on every
 * new browser session. Daily/weekly returning users (i.e. the entire
 * target audience) saw an "annoying ad bar" they couldn't stop. Now
 * localStorage so dismiss = permanent until we ship a new banner key.
 * Bump STORAGE_KEY when the message materially changes (e.g. launch
 * ends, prices change, annual discount callout changes) so the banner
 * re-surfaces for everyone.
 *
 * Shown to EVERY user including admins. Admins were previously hidden
 * (rationale: "already Whale, no upsell") but that meant the team
 * running the site never saw the launch announcement they shipped,
 * which makes /pricing QA blind. The dismiss-X handles the "I don't
 * need to see this every page" case for any user including admins.
 *
 * Renders above the rest of the chrome inside TerminalShell so it
 * spans the full viewport width.
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import LaunchCountdown from '@/components/LaunchCountdown';
import { isLaunchAccessWindow, LAUNCH_CUTOVER_LABEL } from '@/lib/launch';

// Bump when the banner message materially changes so the new copy
// re-surfaces for users who'd dismissed the previous one.
const STORAGE_KEY = 'launch-banner-dismissed-v3';

export default function LaunchBanner() {
  const { status } = useSession();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  // Restore dismissed state from localStorage on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setDismissed(true);
    } catch { /* localStorage unavailable — show anyway */ }
  }, []);

  // Don't show on /pricing itself (redundant). Uses usePathname so it
  // updates correctly on client-side navigation, not just initial mount.
  if (pathname === '/pricing') return null;

  if (!isLaunchAccessWindow()) return null;

  // Don't render while session is resolving — avoids a flash before the
  // dismissed-state hydrates from localStorage.
  if (status === 'loading') return null;

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div
      role="banner"
      className="relative w-full border-b border-amber-400/30 bg-gradient-to-r from-amber-500/[0.14] via-orange-500/[0.10] to-amber-500/[0.14] shadow-[0_1px_24px_-10px_rgba(255,170,0,0.55)]"
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] sm:text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0 animate-pulse" aria-hidden />
          <p className="text-neutral-200 min-w-0">
            <span className="inline-flex items-center rounded-full bg-amber-400 px-2 py-[1px] font-extrabold uppercase tracking-wide text-black shadow-[0_0_16px_rgba(255,193,7,0.75)]">
              Free during launch!
            </span>
            <span className="text-neutral-300">
              {' '}Trader, Pro + Whale tiers unlocked for everyone until {LAUNCH_CUTOVER_LABEL}.
            </span>
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-400/15 px-2 py-[1px] font-extrabold uppercase tracking-wide text-emerald-300 border border-emerald-400/30">
              Annual -17%
            </span>
          </p>
          <LaunchCountdown compact />
          <Link
            href="/pricing"
            className="hidden sm:inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 font-semibold whitespace-nowrap"
          >
            Upgrade now <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <Link
          href="/pricing"
          className="sm:hidden text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 whitespace-nowrap"
        >
          Upgrade →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss launch banner"
          className="text-neutral-500 hover:text-neutral-300 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
