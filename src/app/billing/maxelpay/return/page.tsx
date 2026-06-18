import Link from 'next/link';
import { ArrowRight, BadgeCheck, Clock3 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { auth } from '@/lib/auth';
import { initDB, isDBConfigured, getSQL } from '@/lib/db';
import { TIER_BRANDING } from '@/lib/constants/tiers';
import { type MaxelPayTier } from '@/lib/maxelpay';
import SessionRefresh from './SessionRefresh';
import CheckoutStatusRefresh from '@/components/CheckoutStatusRefresh';

type SearchParams = Record<string, string | string[] | undefined>;

interface CheckoutRecord {
  order_id: string;
  tier: MaxelPayTier | null;
  period: 'monthly' | 'annual' | null;
  amount_usd: string | number;
  currency: string;
  status: string;
  verified_at: string | Date | null;
  expires_at: string | Date | null;
}

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function MaxelPayReturnPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await auth();
  const orderId = readParam(searchParams?.orderId);

  let checkout: CheckoutRecord | null = null;

  if (session?.user?.id && orderId && isDBConfigured()) {
    await initDB();
    const db = getSQL();
    const rows = await db`
      SELECT order_id, tier, period, amount_usd, currency, status, verified_at, expires_at
      FROM maxelpay_checkouts
      WHERE order_id = ${orderId}
        AND user_id = ${session.user.id}
      LIMIT 1
    ` as CheckoutRecord[];
    checkout = rows[0] ?? null;
  }

  const requestedStatus = readParam(searchParams?.status);
  const status = checkout?.status || requestedStatus || 'processing';
  const tier = checkout?.tier ?? null;
  const branding = tier ? TIER_BRANDING[tier] : null;
  const isFinal = Boolean(checkout?.verified_at) || ['paid', 'overpaid'].includes(status);
  const amountLabel = checkout
    ? `${Number(checkout.amount_usd ?? 0).toFixed(2)} ${checkout.currency ?? 'USD'}`
    : null;
  const nextRenewal = checkout?.expires_at
    ? new Date(checkout.expires_at).toISOString().slice(0, 10)
    : null;

  return (
    <div className="min-h-screen bg-hub-black text-white">
      <SessionRefresh enabled={Boolean(session?.user?.id)} />
      <CheckoutStatusRefresh
        enabled={Boolean(session?.user?.id && orderId)}
        orderId={orderId}
        initialFinal={isFinal}
      />
      <Header />
      <main className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-3xl items-center justify-center px-4 py-10">
        <section className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${isFinal ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {isFinal ? <BadgeCheck className="h-6 w-6" aria-hidden /> : <Clock3 className="h-6 w-6" aria-hidden />}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">MaxelPay checkout</p>
              <h1 className="text-2xl font-bold text-white">
                {isFinal ? 'Payment confirmed' : 'Payment received, confirming on-chain'}
              </h1>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Order" value={orderId || 'Pending'} />
            <InfoRow label="Status" value={status.replace(/_/g, ' ')} />
            <InfoRow label="Tier" value={branding?.label ?? 'Unknown'} />
            <InfoRow label="Amount" value={amountLabel ?? 'Pending'} />
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            {isFinal ? (
              <p className="text-sm leading-6 text-neutral-300">
                {branding ? (
                  <>
                    Your <span className={branding.textColor}>{branding.label}</span> access is live.
                    {nextRenewal ? <> Access is active through <span className="text-white font-medium">{nextRenewal}</span>.</> : null}
                  </>
                ) : (
                  'Your paid access is live.'
                )}
              </p>
            ) : (
              <p className="text-sm leading-6 text-neutral-300">
                We have your checkout and are waiting for MaxelPay to finish confirming the blockchain transaction.
                This usually settles within a minute or two. You can safely leave this page and return to your dashboard.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/profile?tab=billing"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
            >
              Open billing <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]"
            >
              Back to pricing
            </Link>
          </div>

          {!session?.user?.id && (
            <p className="mt-4 text-xs text-neutral-500">
              If you opened this outside the account that started checkout, sign in and check the billing tab in your profile.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
