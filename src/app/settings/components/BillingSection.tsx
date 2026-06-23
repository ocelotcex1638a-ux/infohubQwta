'use client';

import Link from 'next/link';
import { CreditCard, ArrowUpRight, Clock, CheckCircle2, Gift } from 'lucide-react';
import type { Session } from 'next-auth';

interface Props {
  session: Session;
}

const TIER_META: Record<string, { label: string; color: string; badge: string }> = {
  free:   { label: 'Free',   color: 'text-neutral-300',  badge: 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30' },
  trader: { label: 'Trader', color: 'text-sky-300',      badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  pro:    { label: 'Pro',    color: 'text-emerald-300',  badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  whale:  { label: 'Whale',  color: 'text-amber-300',    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

const NEXT_TIER: Record<string, string | null> = {
  free: 'trader', trader: 'pro', pro: 'whale', whale: null,
};

export default function BillingSection({ session }: Props) {
  const tier = (session.user as any)?.billingTier ?? 'free';
  const expiresAt: string | null = (session.user as any)?.billingExpiresAt ?? null;
  const meta = TIER_META[tier] ?? TIER_META.free;
  const nextTier = NEXT_TIER[tier];
  const nextMeta = nextTier ? TIER_META[nextTier] : null;

  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresDate
    ? Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / 86_400_000))
    : null;
  const expiring = daysLeft !== null && daysLeft <= 14;

  return (
    <div className="card-premium p-4 mb-4" id="billing">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
        <CreditCard className="w-4 h-4 text-hub-yellow" />
        Plan &amp; Billing
      </h2>

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-neutral-500 mb-1">Current plan</p>
          <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-2.5 py-0.5 rounded-full border ${meta.badge}`}>
            <CheckCircle2 className="w-3 h-3" />
            {meta.label}
          </span>
        </div>

        {expiresDate && (
          <div className="text-right">
            <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" /> Renews / expires
            </p>
            <p className={`text-sm font-mono font-semibold ${expiring ? 'text-amber-400' : 'text-neutral-300'}`}>
              {expiresDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {daysLeft !== null && (
                <span className={`ml-1.5 text-xs font-normal ${expiring ? 'text-amber-400' : 'text-neutral-500'}`}>
                  ({daysLeft}d left)
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {expiring && expiresDate && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          Your plan expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}. Renew on <Link href="/pricing" className="underline hover:text-amber-100">the pricing page</Link> to keep access.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {nextTier && nextMeta && (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-hub-yellow text-hub-black hover:bg-hub-yellow/90 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Upgrade to {nextMeta.label}
          </Link>
        )}
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors"
        >
          View all plans
        </Link>
        <Link
          href="/settings/referrals"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors"
        >
          <Gift className="w-3.5 h-3.5" />
          Referrals &amp; earnings
        </Link>
      </div>
    </div>
  );
}
