'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useFundingRates, useOIChanges, useTickers } from '@/hooks/useSWRApi';
import { getExchangeTradeUrl } from '@/lib/constants';
import type { FundingRateData } from '@/lib/api/types';
import {
  Zap, TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Activity, RefreshCw, ExternalLink, Filter,
} from 'lucide-react';

// ── Signal types ──────────────────────────────────────────────────────────────

type SignalType =
  | 'extreme_carry'   // 8h funding > 0.3% — longs paying enormous rate
  | 'negative_carry'  // 8h funding < -0.05% — rare, longs collect
  | 'oi_surge'        // 24h OI +25%+
  | 'oi_dump'         // 24h OI -25%+
  | 'momentum_carry'  // price +8% AND funding > 0.05% (overheated long)
  | 'cheap_carry';    // high APR with low fee exchange (best carry setup)

type Severity = 'critical' | 'high' | 'medium';

interface Signal {
  id: string;
  type: SignalType;
  severity: Severity;
  symbol: string;
  exchange?: string;
  headline: string;
  detail: string;
  metric: string;
  metric2?: string;
  tradeUrl?: string | null;
}

const SIGNAL_META: Record<SignalType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}> = {
  extreme_carry:  { label: 'Extreme carry', icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25' },
  negative_carry: { label: 'Negative carry', icon: DollarSign,   color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25' },
  oi_surge:       { label: 'OI surge',       icon: TrendingUp,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  oi_dump:        { label: 'OI dump',        icon: TrendingDown, color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/25' },
  momentum_carry: { label: 'Momentum + carry', icon: Zap,        color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
  cheap_carry:    { label: 'Best carry setup', icon: Activity,   color: 'text-hub-yellow',  bg: 'bg-hub-yellow/10',  border: 'border-hub-yellow/25' },
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MED',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'text-red-300 bg-red-500/15',
  high:     'text-amber-300 bg-amber-500/15',
  medium:   'text-neutral-400 bg-white/[0.05]',
};

// ── Signal derivation ─────────────────────────────────────────────────────────

function settleHrs(fr: FundingRateData): number {
  if (fr.fundingIntervalHours) return fr.fundingIntervalHours;
  if (fr.fundingInterval === '1h') return 1;
  if (fr.fundingInterval === '4h') return 4;
  return 8;
}

function toApr(rate: number, h: number) {
  return rate * (8760 / h) * 100;
}

function fmtApr(apr: number) {
  const abs = Math.abs(apr);
  if (abs >= 10000) return `${(apr / 1000).toFixed(0)}k%`;
  if (abs >= 1000)  return `${(apr / 1000).toFixed(1)}k%`;
  return `${apr.toFixed(0)}%`;
}

function fmtRate(r: number) {
  return `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
}

function deriveSignals(
  funding: FundingRateData[],
  oiChanges: any[],
  tickers: any[],
): Signal[] {
  const signals: Signal[] = [];

  // ── Index tickers by symbol for fast lookup ──────────────────────────────
  const tickerMap = new Map<string, { change: number; price: number }>();
  for (const t of tickers) {
    const sym = t.symbol as string;
    const change = (t.priceChangePercent24h ?? t.change24h ?? 0) as number;
    const price = (t.lastPrice ?? 0) as number;
    if (!tickerMap.has(sym) || price > (tickerMap.get(sym)!.price ?? 0)) {
      tickerMap.set(sym, { change, price });
    }
  }

  // ── Index best funding per symbol ─────────────────────────────────────────
  const bestBySymbol = new Map<string, FundingRateData>();
  for (const fr of funding) {
    const rate = fr.fundingRate ?? 0;
    const prev = bestBySymbol.get(fr.symbol);
    if (!prev || Math.abs(rate) > Math.abs(prev.fundingRate ?? 0)) {
      bestBySymbol.set(fr.symbol, fr);
    }
  }

  // ── Extreme positive carry ────────────────────────────────────────────────
  const sortedPos = Array.from(bestBySymbol.values())
    .filter(fr => (fr.fundingRate ?? 0) >= 0.003) // 0.3% per 8h
    .sort((a, b) => (b.fundingRate ?? 0) - (a.fundingRate ?? 0))
    .slice(0, 10);

  for (const fr of sortedPos) {
    const h = settleHrs(fr);
    const rate = fr.fundingRate ?? 0;
    const apr = toApr(rate, h);
    signals.push({
      id: `extreme-${fr.symbol}-${fr.exchange}`,
      type: 'extreme_carry',
      severity: rate >= 0.01 ? 'critical' : rate >= 0.005 ? 'high' : 'medium',
      symbol: fr.symbol,
      exchange: fr.exchange,
      headline: `${fr.symbol} longs paying ${fmtRate(rate)} per 8h`,
      detail: `Annualized carry of ${fmtApr(apr)} APR on ${fr.exchange}. Potential long squeeze if rate stays elevated.`,
      metric: `${fmtApr(apr)} APR`,
      metric2: `${fmtRate(rate)} / 8h`,
      tradeUrl: getExchangeTradeUrl(fr.exchange, fr.symbol),
    });
  }

  // ── Negative carry (rare — longs collect) ─────────────────────────────────
  const negCarry = Array.from(bestBySymbol.values())
    .filter(fr => (fr.fundingRate ?? 0) <= -0.0005)
    .sort((a, b) => (a.fundingRate ?? 0) - (b.fundingRate ?? 0))
    .slice(0, 5);

  for (const fr of negCarry) {
    const h = settleHrs(fr);
    const rate = fr.fundingRate ?? 0;
    const apr = toApr(rate, h);
    signals.push({
      id: `negcarry-${fr.symbol}-${fr.exchange}`,
      type: 'negative_carry',
      severity: rate <= -0.002 ? 'high' : 'medium',
      symbol: fr.symbol,
      exchange: fr.exchange,
      headline: `${fr.symbol} longs collecting ${fmtRate(Math.abs(rate))} per 8h`,
      detail: `Rare negative funding — shorts paying longs. ${fmtApr(Math.abs(apr))} APR for long carry on ${fr.exchange}.`,
      metric: `${fmtApr(Math.abs(apr))} APR`,
      metric2: `${fmtRate(rate)} / 8h`,
      tradeUrl: getExchangeTradeUrl(fr.exchange, fr.symbol),
    });
  }

  // ── OI surge / dump ───────────────────────────────────────────────────────
  const oiSorted = [...oiChanges].filter(o => typeof o.pct24h === 'number');
  const surges = oiSorted.filter(o => (o.pct24h ?? 0) >= 25).sort((a, b) => b.pct24h - a.pct24h).slice(0, 5);
  const dumps  = oiSorted.filter(o => (o.pct24h ?? 0) <= -25).sort((a, b) => a.pct24h - b.pct24h).slice(0, 5);

  for (const o of surges) {
    const fundEntry = bestBySymbol.get(o.symbol);
    signals.push({
      id: `oisurge-${o.symbol}`,
      type: 'oi_surge',
      severity: o.pct24h >= 50 ? 'high' : 'medium',
      symbol: o.symbol,
      headline: `${o.symbol} OI surged +${o.pct24h.toFixed(0)}% in 24h`,
      detail: `Open interest rising fast — new positions opening. ${fundEntry ? `Funding at ${fmtRate(fundEntry.fundingRate ?? 0)} (${fmtApr(toApr(fundEntry.fundingRate ?? 0, settleHrs(fundEntry)))} APR).` : ''}`,
      metric: `+${o.pct24h.toFixed(0)}% OI (24h)`,
      metric2: fundEntry ? `Funding ${fmtRate(fundEntry.fundingRate ?? 0)}` : undefined,
    });
  }

  for (const o of dumps) {
    signals.push({
      id: `oidump-${o.symbol}`,
      type: 'oi_dump',
      severity: o.pct24h <= -50 ? 'high' : 'medium',
      symbol: o.symbol,
      headline: `${o.symbol} OI dropped ${o.pct24h.toFixed(0)}% in 24h`,
      detail: `Significant deleveraging event — positions being closed. Watch for continued price action.`,
      metric: `${o.pct24h.toFixed(0)}% OI (24h)`,
    });
  }

  // ── Momentum + high carry (overheated long) ───────────────────────────────
  const momentumCarry = Array.from(bestBySymbol.values())
    .filter(fr => {
      const rate = fr.fundingRate ?? 0;
      if (rate < 0.0005) return false;
      const t = tickerMap.get(fr.symbol);
      return t && t.change >= 8;
    })
    .sort((a, b) => (b.fundingRate ?? 0) - (a.fundingRate ?? 0))
    .slice(0, 5);

  for (const fr of momentumCarry) {
    const ticker = tickerMap.get(fr.symbol)!;
    const rate = fr.fundingRate ?? 0;
    const h = settleHrs(fr);
    const apr = toApr(rate, h);
    signals.push({
      id: `momcarry-${fr.symbol}`,
      type: 'momentum_carry',
      severity: ticker.change >= 20 && rate >= 0.003 ? 'high' : 'medium',
      symbol: fr.symbol,
      exchange: fr.exchange,
      headline: `${fr.symbol} up ${ticker.change.toFixed(0)}% with ${fmtRate(rate)} funding`,
      detail: `Price pump + elevated funding = overheated longs. ${fmtApr(apr)} APR carry cost — squeeze risk rising.`,
      metric: `+${ticker.change.toFixed(0)}% price`,
      metric2: `${fmtApr(apr)} APR carry`,
      tradeUrl: getExchangeTradeUrl(fr.exchange, fr.symbol),
    });
  }

  // Sort: critical first, then high, then medium; within each group by signal strength
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  signals.sort((a, b) => order[a.severity] - order[b.severity]);

  return signals;
}

// ── Filter options ────────────────────────────────────────────────────────────

const ALL_FILTER = 'all';
type FilterVal = SignalType | typeof ALL_FILTER;

const FILTERS: { id: FilterVal; label: string }[] = [
  { id: 'all',            label: 'All' },
  { id: 'extreme_carry',  label: 'Extreme carry' },
  { id: 'negative_carry', label: 'Negative carry' },
  { id: 'oi_surge',       label: 'OI surge' },
  { id: 'oi_dump',        label: 'OI dump' },
  { id: 'momentum_carry', label: 'Momentum + carry' },
];

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({ sig }: { sig: Signal }) {
  const meta = SIGNAL_META[sig.type];
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${SEVERITY_COLOR[sig.severity]}`}>
            {SEVERITY_LABEL[sig.severity]}
          </span>
          {sig.exchange && (
            <span className="text-[10px] text-neutral-500">{sig.exchange}</span>
          )}
        </div>
      </div>

      <div>
        <div className="text-sm font-bold text-white leading-snug">{sig.headline}</div>
        <div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">{sig.detail}</div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono font-semibold ${meta.color}`}>{sig.metric}</span>
          {sig.metric2 && (
            <span className="text-xs font-mono text-neutral-500">{sig.metric2}</span>
          )}
        </div>
        {sig.tradeUrl && (
          <a
            href={sig.tradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.color} hover:opacity-80`}
          >
            Trade <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const [filter, setFilter] = useState<FilterVal>('all');

  const { data: fundingRaw, isLoading: fLoad, lastUpdate: fTs, refresh: rFunding } = useFundingRates('crypto');
  const { data: oiChangesRaw, isLoading: oLoad, refresh: rOI } = useOIChanges();
  const { data: tickersRaw, isLoading: tLoad, refresh: rTickers } = useTickers();

  const isLoading = fLoad || oLoad || tLoad;

  const signals = useMemo(() => {
    if (!fundingRaw?.length) return [];
    return deriveSignals(fundingRaw, oiChangesRaw ?? [], tickersRaw ?? []);
  }, [fundingRaw, oiChangesRaw, tickersRaw]);

  const visible = filter === 'all' ? signals : signals.filter(s => s.type === filter);

  const counts = useMemo(() => {
    const c: Partial<Record<FilterVal, number>> = { all: signals.length };
    for (const s of signals) c[s.type] = (c[s.type] ?? 0) + 1;
    return c;
  }, [signals]);

  const handleRefresh = () => { rFunding(); rOI(); rTickers(); };

  const critCount = signals.filter(s => s.severity === 'critical').length;
  const highCount = signals.filter(s => s.severity === 'high').length;

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main id="main-content" className="max-w-[1400px] mx-auto px-4 py-6">

        {/* ── Title ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-hub-yellow" />
              <h1 className="text-xl font-bold text-white">Live Signals</h1>
              {!isLoading && signals.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-hub-yellow/10 border border-hub-yellow/25 text-hub-yellow text-[10px] font-bold tabular-nums">
                  {signals.length}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-400">
              Real-time market signals derived from funding rates, open interest, and price action — updated every 30s.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {critCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/25 text-red-300 text-[11px] font-bold">
                {critCount} critical
              </span>
            )}
            {highCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[11px] font-bold">
                {highCount} high
              </span>
            )}
            {fTs && (
              <span className="text-[11px] text-neutral-500">{fTs.toLocaleTimeString()}</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs text-neutral-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <Filter className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          {FILTERS.map(f => {
            const count = counts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === f.id
                    ? 'bg-white/[0.08] border-white/20 text-white'
                    : 'border-white/[0.06] bg-white/[0.02] text-neutral-500 hover:text-neutral-200 hover:border-white/[0.12]'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Signal grid ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <RefreshCw className="w-5 h-5 text-neutral-600 animate-spin" />
            <span className="text-sm text-neutral-500">Scanning markets…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <Activity className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
            <div className="text-sm text-neutral-500">No signals for this filter right now.</div>
            <div className="text-xs text-neutral-600 mt-1">Markets are quiet — check back in a few minutes.</div>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3 space-y-3">
            {visible.map(sig => (
              <div key={sig.id} className="break-inside-avoid">
                <SignalCard sig={sig} />
              </div>
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <p className="text-[11px] text-neutral-600 mt-6">
            Signals are derived algorithmically from live funding, OI and price data. Not financial advice.
            Extreme carry signals flag elevated funding rates, not necessarily trading opportunities.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
