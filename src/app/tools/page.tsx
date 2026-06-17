'use client';

/**
 * /tools — "Tools by trader type" hub.
 *
 * InfoHub started life heavy on funding/arb tooling, so directional, intraday,
 * spot, and options traders couldn't easily tell the terminal was built for
 * them too. This page is a persona-first entry point: it re-surfaces tools that
 * already exist, grouped by *how you trade* rather than by data category (which
 * is how the main nav is organised). Pure links — no new data.
 *
 * Hrefs intentionally mirror the nav registry in TerminalHeader; if a route is
 * renamed, update both. Kept as a self-contained list here (rather than
 * importing the nav array) so this marketing/discovery surface can't destabilise
 * the central nav component.
 */

import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Compass, TrendingUp, Zap, PiggyBank, Sigma, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Tool { label: string; href: string; hint: string }
interface QuickStart { goal: string; href: string; primary: string; secondary: string; tone: string }
interface Persona {
  key: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** Tailwind text colour for the persona's icon + hover accent. */
  tone: string;
  tools: Tool[];
}

const PERSONAS: Persona[] = [
  {
    key: 'directional',
    title: 'Directional & swing',
    blurb: 'Trend, breakout and support/resistance trades held hours to days.',
    icon: TrendingUp,
    tone: 'text-emerald-400',
    tools: [
      { label: 'Chart', href: '/chart', hint: 'Candles · indicators · book + tape' },
      { label: 'Screener', href: '/screener', hint: 'Filter & rank every market' },
      { label: 'Breakouts', href: '/breakouts', hint: 'Range breaks & setups' },
      { label: 'Momentum', href: '/momentum', hint: 'Trend strength ranking' },
      { label: 'RSI Heatmap', href: '/rsi-heatmap', hint: 'Overbought / oversold grid' },
      { label: 'Backtest Lab', href: '/backtest', hint: 'Test a strategy on history' },
      { label: 'Position Sizer', href: '/position-size', hint: 'Risk-based size · R:R · Kelly' },
      { label: 'Liq Heatmap', href: '/liquidation-heatmap', hint: 'Magnet levels above/below' },
      { label: 'Correlation', href: '/correlation', hint: 'What moves together' },
      { label: 'Alerts', href: '/alerts', hint: 'Price / level / % triggers' },
    ],
  },
  {
    key: 'intraday',
    title: 'Intraday & scalpers',
    blurb: 'Fast, microstructure-driven trades — flow, levels, momentum bursts.',
    icon: Zap,
    tone: 'text-amber-400',
    tools: [
      { label: 'Scalper Cockpit', href: '/scalper', hint: 'Chart + flow + positioning, one screen' },
      { label: 'Order Flow', href: '/orderflow', hint: 'Tape + aggressor side' },
      { label: 'CVD', href: '/cvd', hint: 'Cumulative volume delta' },
      { label: 'OB Imbalance', href: '/orderbook-imbalance', hint: 'Bid vs ask depth ratio' },
      { label: 'Liquidations', href: '/liquidations', hint: 'Live rekt feed' },
      { label: 'Liq Levels', href: '/liquidation-levels', hint: 'Imminent squeeze zones' },
      { label: 'Long / Short', href: '/longshort', hint: 'Crowd positioning' },
      { label: 'Top Movers', href: '/top-movers', hint: 'Biggest gainers / losers' },
      { label: 'Chart', href: '/chart', hint: 'Fast multi-timeframe' },
    ],
  },
  {
    key: 'spot',
    title: 'Spot investors & HODLers',
    blurb: 'Longer horizon — accumulation, allocation, cycle & valuation context.',
    icon: PiggyBank,
    tone: 'text-sky-400',
    tools: [
      { label: 'Portfolio', href: '/portfolio', hint: 'Manual holdings + P&L' },
      { label: 'Dashboard', href: '/dashboard', hint: 'Your live overview' },
      { label: 'Watchlist', href: '/watchlist', hint: 'Pinned coins' },
      { label: 'DCA Backtest', href: '/backtest', hint: 'What if you’d DCA’d?' },
      { label: 'Market Cycle', href: '/market-cycle', hint: 'Where we are in the cycle' },
      { label: 'Cycle Phase', href: '/cycle-phase', hint: 'Composite of 5 signals' },
      { label: 'On-Chain', href: '/onchain', hint: 'MVRV · NUPL · network health' },
      { label: 'Dominance', href: '/dominance', hint: 'BTC / ETH / alt share' },
      { label: 'Altseason', href: '/altseason', hint: 'Rotation index' },
      { label: 'Sectors', href: '/sectors', hint: 'Where capital is rotating' },
      { label: 'ETF Flows', href: '/etf-flows', hint: 'Daily net inflows' },
      { label: 'Token Unlocks', href: '/token-unlocks', hint: 'Vesting cliffs ahead' },
    ],
  },
  {
    key: 'options',
    title: 'Options traders',
    blurb: 'Volatility, positioning and pin risk across the options market.',
    icon: Sigma,
    tone: 'text-violet-400',
    tools: [
      { label: 'Options', href: '/options', hint: 'Max pain · OI by strike · IV smile' },
      { label: 'Strategy Builder', href: '/options/builder', hint: 'Multi-leg payoff + Greeks' },
      { label: 'RV vs IV', href: '/rv-iv', hint: 'Realized vs implied vol' },
      { label: 'Skew', href: '/skew', hint: '25-delta put/call skew' },
      { label: 'Max Pain', href: '/max-pain', hint: 'Expiry pin levels' },
      { label: 'Chart', href: '/chart', hint: 'Underlying TA' },
      { label: 'Funding Rates', href: '/funding', hint: 'Perp vol / carry context' },
    ],
  },
  {
    key: 'arb',
    title: 'Funding & arbitrage',
    blurb: 'The original InfoHub edge — cross-venue carry, basis and spreads.',
    icon: ArrowLeftRight,
    tone: 'text-hub-yellow',
    tools: [
      { label: 'Funding Rates', href: '/funding', hint: 'Live across all venues' },
      { label: 'Funding Arb', href: '/spread-scanner', hint: 'Long/short pair grader A→D' },
      { label: 'Spreads', href: '/spreads', hint: 'Cross-venue · net of fees' },
      { label: 'Funding Heatmap', href: '/funding-heatmap', hint: 'Asset × venue grid' },
      { label: 'Basis', href: '/basis', hint: 'Spot-perp premium' },
      { label: 'Premiums', href: '/premiums', hint: 'Perp premiums' },
      { label: 'Trade Optimizer', href: '/trade-optimizer', hint: 'Cheapest venue per trade' },
      { label: 'Execution Costs', href: '/execution-costs', hint: 'Slippage + fees' },
      { label: 'Funding Paid · 30d', href: '/funding-paid', hint: 'Most expensive longs' },
    ],
  },
];

const QUICK_STARTS: QuickStart[] = [
  {
    goal: 'I need a trade idea now',
    href: '/spread-scanner',
    primary: 'Start with actionable spreads',
    secondary: 'Fee-adjusted, liquidity-gated setups first.',
    tone: 'from-hub-yellow/20 to-emerald-500/10',
  },
  {
    goal: 'I scalp intraday',
    href: '/scalper',
    primary: 'Open the scalper cockpit',
    secondary: 'Chart, flow, positioning, and liquidation magnets.',
    tone: 'from-orange-500/20 to-red-500/10',
  },
  {
    goal: 'I want market context',
    href: '/dashboard',
    primary: 'Use the command center',
    secondary: 'Portfolio, alerts, watched wallets, and daily brief.',
    tone: 'from-sky-500/20 to-cyan-500/10',
  },
  {
    goal: 'I build with the data',
    href: '/developers',
    primary: 'Go to the API workbench',
    secondary: 'Funding, liquidations, spreads, and webhooks.',
    tone: 'from-neutral-400/15 to-white/[0.03]',
  },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[1400px] mx-auto w-full px-4 py-6">
        <PageHero
          icon={Compass}
          eyebrow="Tools · by trader type"
          title="Find your"
          accentNoun="toolkit"
          accent="hub-yellow"
          description={
            <>Whatever you trade — directional swings, intraday scalps, spot
              bags, options, or funding carry — there&apos;s a workbench here for
              it. Jump to your style:</>
          }
          className="mb-4"
        />

        <section className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">Not sure where to start?</div>
              <div className="text-sm font-semibold text-white">Pick the job. InfoHub will take you to the right bench.</div>
            </div>
            <Link href="/spread-scanner" className="rounded-full border border-hub-yellow/25 bg-hub-yellow/10 px-3 py-1.5 text-xs font-bold text-hub-yellow hover:bg-hub-yellow/15">
              Most actionable first
            </Link>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {QUICK_STARTS.map((item) => (
              <Link
                key={item.goal}
                href={item.href}
                className={`group rounded-xl border border-white/[0.07] bg-gradient-to-br ${item.tone} p-3 transition hover:-translate-y-0.5 hover:border-hub-yellow/30`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{item.goal}</div>
                <div className="mt-1 text-sm font-bold text-white group-hover:text-hub-yellow">{item.primary}</div>
                <div className="mt-1 text-[11px] leading-snug text-neutral-500">{item.secondary}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Jump-to persona chips */}
        <nav aria-label="Jump to trader type" className="flex flex-wrap gap-2 mb-7">
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            return (
              <a
                key={p.key}
                href={`#${p.key}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:text-white hover:border-white/20 transition-colors"
              >
                <Icon className={`w-3.5 h-3.5 ${p.tone}`} />
                {p.title}
              </a>
            );
          })}
        </nav>

        {PERSONAS.map((p) => {
          const Icon = p.icon;
          return (
            <section key={p.key} id={p.key} className="mb-8 scroll-mt-20">
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] ${p.tone}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">{p.title}</h2>
                  <p className="text-[11px] text-neutral-500 leading-snug">{p.blurb}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {p.tools.map((t) => (
                  <Link
                    key={`${p.key}-${t.href}`}
                    href={t.href}
                    className="card-premium p-3 block hover:border-hub-yellow/30 transition-colors group"
                  >
                    <div className="text-[13px] font-semibold text-white group-hover:text-hub-yellow transition-colors">
                      {t.label}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{t.hint}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-[11px] text-neutral-600 mt-2">
          New here? <Link href="/signup" className="text-hub-yellow hover:underline">Create a free account</Link> — no card required —
          or <Link href="/pricing" className="text-hub-yellow hover:underline">see what each tier unlocks</Link>.
        </p>
      </main>
      <Footer />
    </div>
  );
}
