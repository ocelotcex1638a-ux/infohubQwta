'use client';

/**
 * <TierGate> â€” paywall component for tier-restricted features.
 *
 * Two modes:
 *   - 'soft' (default): renders the children but overlays a paywall card
 *     when the user doesn't meet the required tier. Good for SEO + lower
 *     friction â€” the chrome is visible, the data is gated.
 *   - 'hard': replaces children entirely with the paywall card. Use for
 *     features that would consume real backend resources for a Free user
 *     even if rendered (e.g. heavy API endpoints, paid integrations).
 *
 * Gating is LIVE (2026-06-22): LAUNCH_GATING_ENABLED evaluates to true
 * via isLaunchCutoverReached(). All TierGate boundaries are enforced.
 * Checkout via Maxelpay.
 *
 * Admin role is grandfathered (resolveUserTier already returns 'whale'),
 * so admins never see the paywall regardless of mode.
 */

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Sparkles, Compass, Zap, Crown, ArrowRight, Lock } from 'lucide-react';
import { resolveUserTier, tierAtLeast, TIER_BRANDING, type Tier } from '@/lib/constants/tiers';
import { isLaunchCutoverReached } from '@/lib/launch';

/**
 * Master switch for tier gating. Stays `false` during the "free during
 * launch" window so every signed-in user has full access. Flip to true
 * the day MaxelPay checkout ships.
 *
 * Even when `false`, the <TierGate> component still renders a visual
 * "Pro tier" / "Whale tier" hint chip so users see which features will
 * eventually require an upgrade.
 */
export const LAUNCH_GATING_ENABLED = isLaunchCutoverReached();

interface TierGateProps {
  requires: Exclude<Tier, 'free'>;
  /** Soft = render children + overlay paywall. Hard = replace children. */
  mode?: 'soft' | 'hard';
  /** When `LAUNCH_GATING_ENABLED` is false, optionally hide the hint chip
   *  on pages where it would crowd the layout. */
  hideLaunchHint?: boolean;
  children: React.ReactNode;
}

function tierIconFor(name: 'Sparkles' | 'Compass' | 'Zap' | 'Crown') {
  if (name === 'Sparkles') return Sparkles;
  if (name === 'Compass') return Compass;
  if (name === 'Zap') return Zap;
  return Crown;
}

export default function TierGate({ requires, mode = 'soft', hideLaunchHint = false, children }: TierGateProps) {
  const { data: session, status } = useSession();
  const userTier = resolveUserTier({
    role: (session?.user as { role?: string } | undefined)?.role,
    billingTier: (session?.user as { billingTier?: string } | undefined)?.billingTier ?? null,
  });

  // Loading the session â€” render children to avoid layout flicker. Backend
  // routes still enforce tier checks separately so this isn't a security gap.
  if (status === 'loading') return <>{children}</>;

  const meetsTier = tierAtLeast(userTier, requires);

  // Launch-mode override: gating disabled, everyone gets through. Optionally
  // surface a small upgrade-hint chip at the top of the page so users see
  // which tier this would normally require.
  if (!LAUNCH_GATING_ENABLED) {
    if (hideLaunchHint || meetsTier) return <>{children}</>;
    return (
      <>
        <LaunchHintChip requires={requires} />
        {children}
      </>
    );
  }

  // Gating enabled, user has access â†’ just render.
  if (meetsTier) return <>{children}</>;

  // Gating enabled, user does NOT have access â†’ paywall.
  if (mode === 'hard') return <Paywall requires={requires} />;
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none filter blur-sm opacity-40 select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <Paywall requires={requires} />
      </div>
    </div>
  );
}

/**
 * Small inline chip rendered above content during the launch window.
 * Tells the user "this is a Pro feature, free while we onboard early
 * users". Sets expectations without blocking access.
 */
function LaunchHintChip({ requires }: { requires: Exclude<Tier, 'free'> }) {
  const b = TIER_BRANDING[requires];
  const Icon = tierIconFor(b.iconName);
  const bgClass =
    requires === 'whale' ? 'bg-amber-500/[0.06] border-amber-400/30'
    : requires === 'pro' ? 'bg-emerald-500/[0.06] border-emerald-400/30'
    : 'bg-sky-500/[0.06] border-sky-400/30';
  return (
    <div className={`mb-4 rounded-lg border ${bgClass} px-3 py-2 flex items-center gap-2 text-[12px]`}>
      <Icon className={`w-3.5 h-3.5 ${b.textColor} flex-shrink-0`} aria-hidden />
      <span className="text-neutral-300">
        <strong className={b.textColor}>{b.label} tier</strong> feature.{' '}
        <Link href="/pricing" className="text-emerald-300 hover:underline">See pricing -&gt;</Link>
      </span>
    </div>
  );
}

/**
 * Full paywall card. Shown when LAUNCH_GATING_ENABLED + user is below
 * the required tier. Hard mode shows this as the entire page; soft mode
 * shows it floating over a blurred preview of the gated content.
 */
function Paywall({ requires }: { requires: Exclude<Tier, 'free'> }) {
  const b = TIER_BRANDING[requires];
  const Icon = tierIconFor(b.iconName);
  const ctaClass =
    requires === 'whale'
      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400'
      : requires === 'pro'
      ? 'bg-emerald-500 text-black hover:bg-emerald-400'
      : 'bg-sky-500 text-black hover:bg-sky-400';
  return (
    <div className={`max-w-sm w-full rounded-xl border ${b.borderTint} ${b.bgTint} p-5 text-center shadow-xl backdrop-blur-md`}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <Lock className="w-3.5 h-3.5 text-neutral-500" aria-hidden />
        <Icon className={`w-4 h-4 ${b.textColor}`} aria-hidden />
        <h3 className={`text-[13px] font-bold uppercase tracking-wider ${b.textColor}`}>{b.label} tier</h3>
      </div>
      <p className="text-[12px] text-neutral-300 mb-4 leading-relaxed">{b.tagline}</p>
      <Link
        href="/pricing"
        className={`inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors ${ctaClass}`}
      >
        See {b.label} tier <ArrowRight className="w-3 h-3" aria-hidden />
      </Link>
    </div>
  );
}
