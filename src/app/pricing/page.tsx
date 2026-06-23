'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import LaunchCountdown from '@/components/LaunchCountdown';
import { Sparkles, Compass, Zap, Crown, Check, X as XIcon, ArrowRight, CreditCard, Loader2, Gift } from 'lucide-react';
import {
  PRICING_CARD_ORDER,
  TIER_LIMITS,
  TIER_PRICE_MONTHLY,
  TIER_PRICE_ANNUAL,
  TIER_BRANDING,
  FEATURE_MATRIX,
  TOOLS_BY_TIER,
  ANNUAL_DISCOUNT_PCT,
  MOST_POPULAR_TIER,
  annualSavingsUsd,
  resolveUserTier,
  type Tier,
  type TierToolList,
} from '@/lib/constants/tiers';
import { LAUNCH_CUTOVER_LABEL, LAUNCH_CUTOVER_DAY_LABEL } from '@/lib/launch';
import { parsePromoDiscount, type PromoDiscount } from '@/lib/promo';

type Period = 'monthly' | 'annual';

function calcDiscountedPrice(price: number, pct: number): string {
  const d = price * (1 - pct / 100);
  return Number.isInteger(d) ? d.toString() : d.toFixed(2);
}

function tierIcon(name: 'Sparkles' | 'Compass' | 'Zap' | 'Crown') {
  if (name === 'Sparkles') return Sparkles;
  if (name === 'Compass') return Compass;
  if (name === 'Zap') return Zap;
  return Crown;
}

function formatLimit(value: number): string {
  if (!Number.isFinite(value)) return 'Unlimited';
  return value.toLocaleString();
}

const TOOLS_BY_TIER_MAP = Object.fromEntries(
  TOOLS_BY_TIER.map((entry) => [entry.tier, entry]),
) as Record<Tier, TierToolList>;

// Feature breakdown shows the tier ladder (Free → Trader → Pro → Whale).
// Pricing cards use PRICING_CARD_ORDER (Pro first for conversion anchoring).
const TOOLS_CARD_ORDER: Tier[] = ['free', 'trader', 'pro', 'whale'];

export default function PricingPage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState<Period>('monthly');
  const [showCheckoutModal, setShowCheckoutModal] = useState<Tier | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoCopied, setPromoCopied] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('promo');
    if (code && /^IH-[A-Z0-9]+-[A-Z0-9]+$/.test(code)) setPromoCode(code);
  }, []);

  const promoDiscount = parsePromoDiscount(promoCode);

  const isSignedIn = !!session;
  const userTier = resolveUserTier({
    role: (session?.user as { role?: string } | undefined)?.role,
    billingTier: (session?.user as { billingTier?: string } | undefined)?.billingTier ?? null,
  });
  const currentTier: Tier | null = isSignedIn ? userTier : null;

  async function startCheckout(tier: Tier) {
    if (tier === 'free') return;
    setCheckoutError(null);
    setCheckoutTier(tier);
    try {
      const res = await fetch('/api/maxelpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, period, ...(promoCode ? { promoCode } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Checkout failed (HTTP ${res.status})`);
      }
      if (typeof json.paymentUrl !== 'string' || !json.paymentUrl) {
        throw new Error('MaxelPay did not return a checkout URL');
      }
      window.location.assign(json.paymentUrl);
    } catch (error) {
      setCheckoutTier(null);
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout');
    }
  }

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main id="main-content" className="max-w-[1100px] mx-auto w-full px-4 sm:px-6 py-6">
        <PageHero
          icon={CreditCard}
          eyebrow="Pricing"
          title="Pick your"
          accentNoun="tier"
          accent="hub-yellow"
        />

        {/* Lucky Wheel promo banner */}
        {promoCode && promoDiscount && (
          <div className="relative rounded-2xl border-2 border-emerald-400/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 mb-6 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(52,211,153,0.07),transparent_60%)] pointer-events-none" />
            <div className="relative flex flex-wrap items-center gap-5 justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-400/15 border border-emerald-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Gift className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-[15px] font-black text-white leading-tight">
                    {promoDiscount.freeTier
                      ? `1 month ${promoDiscount.freeTier.charAt(0).toUpperCase() + promoDiscount.freeTier.slice(1)} tier — FREE`
                      : `${promoDiscount.pct}% OFF applied to your first month`}
                  </p>
                  <p className="text-[12px] text-emerald-300/80 mt-0.5">
                    Your Lucky Wheel prize is active — discounted prices are shown on the cards below.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-emerald-600 mb-1 font-semibold">Promo code</p>
                  <span className="font-mono font-bold text-white bg-black/30 border border-emerald-400/30 rounded-lg px-3 py-1.5 tracking-widest text-[13px] select-all">
                    {promoCode}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(promoCode); } catch {}
                    setPromoCopied(true);
                    setTimeout(() => setPromoCopied(false), 2000);
                  }}
                  className="text-[11px] font-bold px-3 py-2 rounded-lg border transition-all"
                  style={promoCopied
                    ? { borderColor: '#34d399', color: '#34d399', background: 'rgba(52,211,153,0.12)' }
                    : { borderColor: 'rgba(52,211,153,0.3)', color: '#6ee7b7', background: 'rgba(52,211,153,0.05)' }}
                >
                  {promoCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Billing-live notice + Monthly/Annual toggle */}
        <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.04] px-4 py-3 mb-5 text-center">
          <p className="text-[12px] sm:text-[13px] text-emerald-200">
            <Sparkles className="inline w-3.5 h-3.5 -mt-0.5 mr-1.5 text-emerald-300" aria-hidden />
            <span className="font-semibold text-emerald-300">Billing is live.</span>{' '}
            Pay in crypto via MaxelPay — USDT/USDC, BTC, ETH across 5 chains. No card needed. /
            <span className="inline-flex items-center rounded-full bg-emerald-400/15 px-2 py-[1px] mx-1 font-bold uppercase tracking-wide text-emerald-300 border border-emerald-400/30">
              Annual -{ANNUAL_DISCOUNT_PCT}%
            </span>
          </p>
        </section>

        <div className="flex justify-center mb-7">
          <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.02] p-1 gap-1">
            <button
              type="button"
              aria-pressed={period === 'monthly'}
              onClick={() => setPeriod('monthly')}
              className={`px-5 py-1.5 rounded-full text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hub-yellow/50 ${
                period === 'monthly'
                  ? 'bg-hub-yellow/15 text-hub-yellow border border-hub-yellow/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={period === 'annual'}
              onClick={() => setPeriod('annual')}
              className={`px-5 py-1.5 rounded-full text-[12px] font-semibold transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hub-yellow/50 ${
                period === 'annual'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Annual
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
                Save {ANNUAL_DISCOUNT_PCT}%
              </span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 items-stretch">
          {PRICING_CARD_ORDER.map((t) => (
            <TierCard
              key={t}
              tier={t}
              period={period}
              isCurrentTier={currentTier === t}
              isMostPopular={t === MOST_POPULAR_TIER}
              promoDiscount={promoDiscount}
              onSubscribe={() => setShowCheckoutModal(t)}
            />
          ))}
        </section>

        {/* What's in each tier */}
        <section className="mb-12">
          <h2 className="text-base font-bold text-white mb-4 px-1">
            What&apos;s in each tier
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
            {TOOLS_CARD_ORDER.map((t) => (
              <TierToolListCard key={t} tierList={TOOLS_BY_TIER_MAP[t]} />
            ))}
          </div>
          <p className="text-[11px] text-neutral-500 mt-4 px-1">
            Plus public API access on every tier /{' '}
            <Link href="/developers/docs" className="text-emerald-300 hover:underline">
              see API docs
            </Link>
            . Full nav menu in the side bar.
          </p>
        </section>

        {/* Comparison table */}
        <section className="mb-12">
          <h2 className="text-base font-bold text-white mb-3 px-1">Compare all features</h2>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th scope="col" className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold sticky left-0 bg-hub-darker">
                      Feature
                    </th>
                    {PRICING_CARD_ORDER.map((t) => {
                      const b = TIER_BRANDING[t];
                      const Icon = tierIcon(b.iconName);
                      const featured = t === 'pro';
                      return (
                        <th scope="col" key={t} className={`px-4 py-3 text-center ${featured ? 'bg-emerald-500/[0.06]' : ''}`}>
                          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold">
                            <Icon className={`w-3 h-3 ${b.textColor}`} aria-hidden />
                            <span className={b.textColor}>{b.label}</span>
                          </div>
                          {featured && (
                            <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-400">Most popular</div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((row, i) => {
                    const stripe = i % 2 === 0;
                    const newGroup = i === 0 || FEATURE_MATRIX[i - 1].group !== row.group;
                    return (
                      <Fragment key={row.label}>
                        {newGroup && (
                          <tr className="bg-hub-darker">
                            <th
                              scope="colgroup"
                              colSpan={1 + PRICING_CARD_ORDER.length}
                              className="px-4 pt-4 pb-1.5 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-hub-yellow/80 sticky left-0 bg-hub-darker"
                            >
                              {row.group}
                            </th>
                          </tr>
                        )}
                        <tr className={`border-b border-white/[0.04] ${stripe ? '' : 'bg-white/[0.01]'}`}>
                          <th
                            scope="row"
                            className={`px-4 py-2.5 text-neutral-300 font-normal text-left sticky left-0 ${stripe ? 'bg-hub-black' : 'bg-hub-dark'}`}
                          >
                            {row.label}
                          </th>
                          {PRICING_CARD_ORDER.map((t) => (
                            <td key={t} className={`px-4 py-2.5 text-center ${t === 'pro' ? 'bg-emerald-500/[0.04]' : ''}`}>
                              <FeatureCell value={row.values[t]} />
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-base font-bold text-white mb-3 px-1">Pricing FAQ</h2>
          <div className="space-y-2">
            <FaqItem
              q="Can I still use InfoHub for free?"
              a="Yes — Free tier is free forever with no card required. It covers 100 req/min API, 5 price alerts, and 10 watched wallets. Trader, Pro, and Whale tiers unlock higher limits and advanced features."
            />
            <FaqItem
              q="How does payment work?"
              a="Crypto via MaxelPay - pay in USDT/USDC on Ethereum, Solana, Arbitrum, Base, plus BTC and ETH. Hosted checkout, takes <60s. No card needed, no signup form."
            />
            <FaqItem
              q="Can I cancel anytime?"
              a="Each MaxelPay payment unlocks access through the paid-through date shown in Billing. If you do not renew before that date, your account automatically drops back to Free. No hidden auto-renew and no surprise charges."
            />
            <FaqItem
              q="What's the difference between Trader, Pro, and Whale?"
              a={`Trader ($${TIER_PRICE_MONTHLY.trader}) is active retail - every venue real-time, ${TIER_LIMITS.trader.maxAlerts} alerts, ${TIER_LIMITS.trader.maxWatchedWallets} wallets, ${TIER_LIMITS.trader.apiPerMinute}/min API. Pro ($${TIER_PRICE_MONTHLY.pro}) is "trade for a living" - adds Tax CSV export + Custom dashboards + Setup scanner, plus ${TIER_LIMITS.pro.maxAlerts} alerts, ${TIER_LIMITS.pro.maxWatchedWallets} wallets, ${TIER_LIMITS.pro.apiPerMinute}/min API. Whale ($${TIER_PRICE_MONTHLY.whale}) is funds + desks - adds priority alert delivery (dedicated queue), custom alert webhooks, unlimited alerts, unlimited watched wallets, and a 1:1 Telegram channel with the team.`}
            />
            <FaqItem
              q="Do you charge based on usage?"
              a="No. Flat monthly or annual price - no overage fees, no surprise bills, no metered billing. If you hit a tier limit, the page tells you and offers an upgrade. Nothing breaks silently."
            />
            <FaqItem
              q="Is there a free trial?"
              a="No traditional trial, but the Free tier (no card, no time limit) lets you use the full data terminal and all free-tier features indefinitely. If you want to test Trader/Pro/Whale features before committing, reach out on Telegram and we can set up a short comp window."
            />
            <FaqItem
              q="Earn 20% commission as an affiliate?"
              a="Yes - every signed-in user gets a referral code at /settings/referrals. Share it; people who sign up via your link get 10% off forever, and you earn 20% of every paid month they pay, for the life of the account. Payouts in USDT to your wallet (Solana, Arbitrum, or Base) with a $25 minimum. Public details on /referrals."
            />
          </div>
        </section>

        {/* Final CTA */}
        <section className="text-center pb-12">
          <p className="text-[12px] text-neutral-500">
            Questions?{' '}
            <Link href="/faq" className="text-emerald-300 hover:underline">See the full FAQ</Link>
            {' '}or DM us on{' '}
            <a
              href="https://t.me/info_hub69"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 hover:underline"
            >
              Telegram
            </a>
            .
          </p>
        </section>
      </main>

      {/* Checkout modal */}
      {showCheckoutModal && (
        <CheckoutModal
          tier={showCheckoutModal}
          period={period}
          promoDiscount={promoDiscount}
          promoCode={promoCode}
          isLoading={checkoutTier === showCheckoutModal}
          error={checkoutError}
          onStartCheckout={startCheckout}
          onClose={() => {
            setShowCheckoutModal(null);
            setCheckoutError(null);
            setCheckoutTier(null);
          }}
        />
      )}

      <Footer />
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

interface TierCardProps {
  tier: Tier;
  period: Period;
  isCurrentTier: boolean;
  isMostPopular: boolean;
  promoDiscount: PromoDiscount | null;
  onSubscribe: () => void;
}

function TierCard({
  tier,
  period,
  isCurrentTier,
  isMostPopular,
  promoDiscount,
  onSubscribe,
}: TierCardProps) {
  const b = TIER_BRANDING[tier];
  const limits = TIER_LIMITS[tier];
  const Icon = tierIcon(b.iconName);
  const monthly = TIER_PRICE_MONTHLY[tier];
  const annual = TIER_PRICE_ANNUAL[tier];
  const displayMonthlyRaw = period === 'monthly' ? monthly : annual / 12;
  const displayMonthly = Number.isInteger(displayMonthlyRaw)
    ? displayMonthlyRaw.toString()
    : displayMonthlyRaw.toFixed(2);
  const isPaid = monthly > 0;

  // Is this the specific free tier from the promo?
  const isFreeTierPromo = promoDiscount?.freeTier === tier;
  // Does a percentage promo apply to this paid card?
  const pctPromo = isPaid && promoDiscount && !promoDiscount.freeTier ? promoDiscount.pct : null;

  return (
    <div
      className={`relative rounded-xl border-2 flex flex-col h-full transition-shadow ${b.borderTint} ${b.bgTint} p-5 ${
        isMostPopular ? 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-hub-black shadow-glow-md' : ''
      } ${isFreeTierPromo ? 'ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-hub-black' : ''}`}
    >
      {/* Badges */}
      {isMostPopular && !isFreeTierPromo && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.15em] px-2.5 py-0.5 rounded-full bg-emerald-400 text-black shadow-glow-md whitespace-nowrap">
          Most popular
        </span>
      )}
      {isFreeTierPromo && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.15em] px-2.5 py-0.5 rounded-full bg-emerald-400 text-black shadow-glow-md whitespace-nowrap">
          🎡 1 month FREE
        </span>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${b.textColor}`} aria-hidden />
        <h3 className={`text-lg font-bold ${b.textColor}`}>{b.label}</h3>
        {isCurrentTier && (
          <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1] text-neutral-300">
            Current
          </span>
        )}
      </div>

      <p className="text-[12px] text-neutral-400 mb-4 min-h-[2.5rem]">{b.tagline}</p>

      {/* Price block */}
      <div className="mb-5">
        {!isPaid ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-white">$0</span>
              <span className="text-[12px] text-neutral-500">forever</span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">No card required</p>
          </>
        ) : isFreeTierPromo ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400">FREE</span>
              <span className="text-[12px] text-neutral-400">first month</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[12px] text-neutral-500">then</span>
              <span className="text-[12px] text-neutral-300 font-semibold">${displayMonthly}/mo</span>
              {period === 'annual' && (
                <span className="text-[10px] text-neutral-500">billed annually</span>
              )}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1.5">Lucky Wheel reward</p>
          </>
        ) : pctPromo ? (
          <>
            {/* Discounted price prominent */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-black text-white">
                ${calcDiscountedPrice(displayMonthlyRaw, pctPromo)}
              </span>
              <span className="text-[12px] text-neutral-400">/mo</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 uppercase tracking-wider">
                {pctPromo}% OFF
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[12px] text-neutral-600 line-through">${displayMonthly}/mo</span>
              <span className="text-[11px] text-emerald-300">· {pctPromo}% off applied</span>
            </div>
            {period === 'annual' && (
              <p className="text-[10px] text-neutral-500 mt-1">
                ${calcDiscountedPrice(annual, pctPromo)}/yr first year · ${annual}/yr after
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">${displayMonthly}</span>
              <span className="text-[12px] text-neutral-500">/mo{period === 'annual' ? ' · billed annually' : ''}</span>
            </div>
            {period === 'annual' && (
              <p className="text-[10px] text-neutral-500 mt-1">
                ${annual}/yr · save ${annualSavingsUsd(tier)}/yr vs monthly
              </p>
            )}
          </>
        )}
      </div>

      {/* Key bullets */}
      <ul className="space-y-1.5 mb-5 text-[12px] text-neutral-300 flex-1">
        <Bullet>
          API: <strong>{formatLimit(limits.apiPerMinute)}/min</strong>
          {Number.isFinite(limits.apiPerDay) && (
            <>, {formatLimit(limits.apiPerDay)}/day</>
          )}
        </Bullet>
        <Bullet>
          <strong>{formatLimit(limits.maxAlerts)}</strong> custom alerts
        </Bullet>
        <Bullet>
          <strong>{formatLimit(limits.maxWatchedWallets)}</strong> watched wallets
        </Bullet>
        {tier === 'whale' && (
          <>
            <Bullet>Priority alert delivery (dedicated queue)</Bullet>
            <Bullet>Custom alert webhooks (HTTPS)</Bullet>
            <Bullet>1:1 Telegram channel with the team</Bullet>
          </>
        )}
        {tier === 'pro' && (
          <>
            <Bullet>Tax CSV + Dashboards + Setup scanner</Bullet>
            <Bullet>Priority email + DM support / 12h response</Bullet>
          </>
        )}
        {tier === 'trader' && <Bullet>Priority email + DM support</Bullet>}
      </ul>

      {/* CTA */}
      <TierCta
        tier={tier}
        isPaid={isPaid}
        isCurrentTier={isCurrentTier}
        promoDiscount={promoDiscount}
        displayMonthlyRaw={displayMonthlyRaw}
        onSubscribe={onSubscribe}
      />
    </div>
  );
}

function TierCta({
  tier,
  isPaid,
  isCurrentTier,
  promoDiscount,
  displayMonthlyRaw,
  onSubscribe,
}: {
  tier: Tier;
  isPaid: boolean;
  isCurrentTier: boolean;
  promoDiscount: PromoDiscount | null;
  displayMonthlyRaw: number;
  onSubscribe: () => void;
}) {
  const { data: session } = useSession();
  const isSignedIn = !!session;
  const b = TIER_BRANDING[tier];

  if (isCurrentTier) {
    return (
      <button
        type="button"
        disabled
        className="w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider text-center bg-white/[0.04] border border-white/[0.06] text-neutral-500 cursor-default"
      >
        Your current tier
      </button>
    );
  }

  if (!isPaid) {
    if (isSignedIn) {
      return (
        <button
          type="button"
          disabled
          className="w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider text-center bg-white/[0.04] border border-white/[0.06] text-neutral-500 cursor-default"
        >
          Always available
        </button>
      );
    }
    return (
      <Link
        href="/signup"
        className="w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider text-center bg-white/[0.06] border border-white/[0.1] text-white hover:bg-white/[0.1] transition-colors inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      >
        Sign up free <ArrowRight className="w-3 h-3" aria-hidden />
      </Link>
    );
  }

  const ctaColorClass =
    tier === 'whale'
      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 focus-visible:ring-amber-400/60'
      : tier === 'pro'
      ? 'bg-gradient-to-r from-hub-yellow to-hub-yellow-dark text-black hover:opacity-90 focus-visible:ring-hub-yellow/60'
      : 'bg-sky-500 text-black hover:bg-sky-400 focus-visible:ring-sky-400/60';

  // Build the CTA label — show the discounted price when a promo is active
  const isFreeTierPromo = promoDiscount?.freeTier === tier;
  const pctPromo = promoDiscount && !promoDiscount.freeTier ? promoDiscount.pct : null;
  const ctaLabel = isFreeTierPromo
    ? `Get 1 month ${b.label} FREE`
    : pctPromo
    ? `Subscribe at $${calcDiscountedPrice(displayMonthlyRaw, pctPromo)}/mo`
    : `Get ${b.label}`;

  if (!isSignedIn) {
    return (
      <Link
        href={`/signup?callbackUrl=${encodeURIComponent('/pricing')}`}
        className={`w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider text-center inline-flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-hub-black ${ctaColorClass}`}
      >
        Sign up to get {b.label} <ArrowRight className="w-3 h-3" aria-hidden />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onSubscribe}
      className={`w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-hub-black ${ctaColorClass}`}
    >
      {ctaLabel}
    </button>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function TierToolListCard({ tierList }: { tierList: TierToolList }) {
  const branding = TIER_BRANDING[tierList.tier];
  const Icon = tierIcon(branding.iconName);

  const borderClass =
    tierList.tier === 'whale' ? 'border-amber-400/30'
    : tierList.tier === 'pro' ? 'border-emerald-400/30'
    : tierList.tier === 'trader' ? 'border-sky-400/30'
    : 'border-white/[0.08]';
  const bgClass =
    tierList.tier === 'whale' ? 'bg-amber-500/[0.03]'
    : tierList.tier === 'pro' ? 'bg-emerald-500/[0.03]'
    : tierList.tier === 'trader' ? 'bg-sky-500/[0.03]'
    : 'bg-white/[0.02]';

  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-4 flex flex-col h-full`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${branding.textColor}`} aria-hidden />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white">
          {tierList.heading}
        </h3>
      </div>
      <p className="text-[11px] text-neutral-500 mb-3 leading-snug">{tierList.description}</p>
      <ul className="space-y-2 flex-1">
        {tierList.items.map((item, i) => {
          const content = (
            <span className="flex flex-col gap-0.5">
              <span className={`${branding.textColor} font-semibold text-[12px] leading-tight`}>
                {item.label}
              </span>
              {item.hint && (
                <span className="text-[10px] text-neutral-500 leading-snug">
                  {item.hint}
                </span>
              )}
            </span>
          );
          return (
            <li key={item.href ?? `${tierList.tier}-${i}`}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="block hover:bg-white/[0.03] -mx-1.5 px-1.5 py-1 rounded transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div className="-mx-1.5 px-1.5 py-1">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <Check className="w-4 h-4 mx-auto text-emerald-400" aria-label="Included" />;
  }
  if (value === false) {
    return <XIcon className="w-4 h-4 mx-auto text-neutral-700" aria-label="Not included" />;
  }
  return <span className="text-neutral-200">{value}</span>;
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 group">
      <summary className="text-[13px] font-semibold text-white cursor-pointer list-none flex items-center justify-between">
        <span>{q}</span>
        <span className="text-neutral-500 group-open:rotate-45 transition-transform duration-150">+</span>
      </summary>
      <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">{a}</p>
    </details>
  );
}

function CheckoutModal({
  tier,
  period,
  promoDiscount,
  promoCode,
  isLoading,
  error,
  onStartCheckout,
  onClose,
}: {
  tier: Tier;
  period: Period;
  promoDiscount: PromoDiscount | null;
  promoCode: string | null;
  isLoading: boolean;
  error: string | null;
  onStartCheckout: (tier: Tier) => Promise<void>;
  onClose: () => void;
}) {
  const b = TIER_BRANDING[tier];
  const Icon = tierIcon(b.iconName);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const monthly = TIER_PRICE_MONTHLY[tier];
  const displayRaw = period === 'monthly' ? monthly : TIER_PRICE_ANNUAL[tier] / 12;
  const isFreeTierPromo = promoDiscount?.freeTier === tier;
  const pctPromo = promoDiscount && !promoDiscount.freeTier ? promoDiscount.pct : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dismissRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-xl border border-white/[0.1] bg-hub-black p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className={`w-10 h-10 mx-auto mb-3 ${b.textColor}`} aria-hidden />
        <h3 id="checkout-modal-title" className="text-base font-bold text-white mb-2">
          Continue to {b.label} checkout
        </h3>

        {/* Show promo summary in the modal */}
        {(isFreeTierPromo || pctPromo) && promoCode && (
          <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2.5 text-left">
            <p className="text-[11px] font-bold text-emerald-300 mb-1">
              {isFreeTierPromo ? '🎡 1 month FREE applied' : `🎡 ${pctPromo}% OFF applied`}
            </p>
            {pctPromo && (
              <p className="text-[11px] text-neutral-400">
                Your price: <span className="text-white font-bold">${calcDiscountedPrice(displayRaw, pctPromo)}/mo</span>
                {' '}<span className="line-through text-neutral-600">${Number.isInteger(displayRaw) ? displayRaw : displayRaw.toFixed(2)}/mo</span>
              </p>
            )}
            <p className="text-[10px] text-neutral-500 mt-1">Code <span className="font-mono text-neutral-300">{promoCode}</span> will be applied at checkout.</p>
          </div>
        )}

        <p className="text-[12px] text-neutral-400 mb-4 leading-relaxed">
          You&apos;ll be redirected to MaxelPay&apos;s hosted crypto checkout to
          complete your {period} subscription. MaxelPay will return you here
          once the transaction is submitted, and InfoHub activates access after
          the blockchain confirmation clears.
        </p>
        {error && (
          <p className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-left text-[12px] text-rose-200">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            ref={dismissRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-white/[0.06] border border-white/[0.1] text-neutral-300 hover:bg-white/[0.1] transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={() => onStartCheckout(tier)}
            disabled={isLoading}
            className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {isLoading ? 'Redirecting…' : 'Continue to MaxelPay'}
          </button>
        </div>
      </div>
    </div>
  );
}
