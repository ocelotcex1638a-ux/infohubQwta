'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { TokenIconSimple } from '@/components/TokenIcon';
import {
  Calendar, TrendingUp, TrendingDown, Zap, Activity, BarChart3,
  Flame, RefreshCw, Share2, Copy, Check, ExternalLink,
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ── Types ───────────────────────────────────────────────────────────── */

interface DigestData {
  prices: { symbol: string; price: number; change24h: number }[];
  sentiment: { fgValue: number | null; fgLabel: string | null; btcDom: number | null; totalMcap: number | null; mcapChange: number | null };
  liqs: { total: number; longs: number; shorts: number } | null;
  funding: { hot: { symbol: string; exchange: string; rate: number; apr: number } | null; cold: { symbol: string; exchange: string; rate: number; apr: number } | null };
  oi: { total: number; topSurge: { symbol: string; pct: number } | null; topDump: { symbol: string; pct: number } | null } | null;
  movers: { gainers: { symbol: string; price: number; change: number }[]; losers: { symbol: string; price: number; change: number }[] };
}

const EMPTY_DIGEST: DigestData = {
  prices: [],
  sentiment: { fgValue: null, fgLabel: null, btcDom: null, totalMcap: null, mcapChange: null },
  liqs: null,
  funding: { hot: null, cold: null },
  oi: null,
  movers: { gainers: [], losers: [] },
};

/* ── Section card ────────────────────────────────────────────────────── */

function DigestCard({ title, icon, children, accent = '#f59e0b' }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-300">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SkeletonBar({ w = '100%' }: { w?: string }) {
  return (
    <div style={{
      height: 14, width: w, borderRadius: 4,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  );
}

/* ── Sub-sections ────────────────────────────────────────────────────── */

const PRICE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'];

function PricesSection({ data, loading }: { data: DigestData['prices']; loading: boolean }) {
  const bySymbol = useMemo(() => {
    const m = new Map<string, { price: number; change: number }>();
    for (const p of data) m.set(p.symbol, { price: p.price, change: p.change24h });
    return m;
  }, [data]);

  return (
    <DigestCard title="Key Prices" icon={<Activity size={12} style={{ color: '#60a5fa' }} />} accent="#60a5fa">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRICE_SYMBOLS.map(sym => {
          const d = bySymbol.get(sym);
          const isPos = d && d.change >= 0;
          return (
            <Link key={sym} href={`/symbol/${sym}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/[0.04] transition-colors no-underline group">
              <TokenIconSimple symbol={sym} size={20} />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-neutral-400 uppercase">{sym}</div>
                {loading ? (
                  <SkeletonBar w="60px" />
                ) : d ? (
                  <>
                    <div className="text-xs font-bold text-white font-mono">{fmtPrice(d.price)}</div>
                    <div className="text-[10px] font-mono" style={{ color: isPos ? 'var(--pump-mild)' : 'var(--rekt-mild)' }}>
                      {fmtPct(d.change)}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-neutral-600">—</div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </DigestCard>
  );
}

function SentimentSection({ data, loading }: { data: DigestData['sentiment']; loading: boolean }) {
  const { fgValue, fgLabel, btcDom, totalMcap, mcapChange } = data;
  const fgColor = fgValue == null ? 'text-neutral-400'
    : fgValue >= 75 ? 'text-amber-400'
    : fgValue >= 55 ? 'text-emerald-400'
    : fgValue >= 45 ? 'text-neutral-300'
    : fgValue >= 25 ? 'text-orange-400'
    : 'text-red-400';

  return (
    <DigestCard title="Sentiment" icon={<Zap size={12} style={{ color: '#f59e0b' }} />} accent="#f59e0b">
      <div className="flex flex-col gap-2">
        {loading ? (
          <><SkeletonBar /><SkeletonBar w="80%" /><SkeletonBar w="60%" /></>
        ) : (
          <>
            {fgValue != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Fear & Greed</span>
                <span className={`text-xs font-bold font-mono ${fgColor}`}>
                  {fgValue}/100 · {fgLabel ?? ''}
                </span>
              </div>
            )}
            {btcDom != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">BTC Dominance</span>
                <span className="text-xs font-bold font-mono text-orange-400">{btcDom.toFixed(1)}%</span>
              </div>
            )}
            {totalMcap != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Total Market Cap</span>
                <span className="text-xs font-bold font-mono text-white">
                  {fmtUsd(totalMcap)}
                  {mcapChange != null && (
                    <span className="ml-1.5" style={{ color: mcapChange >= 0 ? 'var(--pump-mild)' : 'var(--rekt-mild)' }}>
                      {fmtPct(mcapChange)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </DigestCard>
  );
}

function LiquidationsSection({ data, loading }: { data: DigestData['liqs']; loading: boolean }) {
  if (!loading && !data) return null;
  const skew = data ? (() => {
    const total = data.longs + data.shorts;
    if (!total) return null;
    const longPct = (data.longs / total) * 100;
    if (longPct > 70) return { text: 'Longs nuked', color: 'var(--rekt-mild)' };
    if (longPct > 55) return { text: 'Long-heavy carnage', color: 'var(--rekt-mild)' };
    if (longPct < 30) return { text: 'Shorts wrecked', color: 'var(--pump-mild)' };
    if (longPct < 45) return { text: 'Short-heavy rinse', color: 'var(--pump-mild)' };
    return { text: 'Two-sided liquidation', color: 'var(--fg-muted)' };
  })() : null;

  return (
    <DigestCard title="24h Liquidations" icon={<Flame size={12} style={{ color: 'var(--rekt-mild)' }} />} accent="#ef4444">
      <div className="flex flex-col gap-2">
        {loading ? (
          <><SkeletonBar /><SkeletonBar w="70%" /></>
        ) : data ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Total</span>
              <span className="text-xs font-bold font-mono" style={{ color: 'var(--rekt-mild)' }}>{fmtUsd(data.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Longs liquidated</span>
              <span className="text-xs font-mono text-neutral-300">{fmtUsd(data.longs)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Shorts liquidated</span>
              <span className="text-xs font-mono text-neutral-300">{fmtUsd(data.shorts)}</span>
            </div>
            {skew && (
              <div className="mt-1 text-center text-[11px] italic font-mono" style={{ color: skew.color }}>
                {skew.text}
              </div>
            )}
          </>
        ) : null}
      </div>
    </DigestCard>
  );
}

function FundingSection({ data, loading }: { data: DigestData['funding']; loading: boolean }) {
  const { hot, cold } = data;
  const hasData = hot || cold;
  if (!loading && !hasData) return null;

  return (
    <DigestCard title="Funding Extremes" icon={<Activity size={12} style={{ color: 'var(--hub-yellow)' }} />} accent="#f59e0b">
      <div className="flex flex-col gap-2">
        {loading ? (
          <><SkeletonBar /><SkeletonBar w="80%" /></>
        ) : (
          <>
            {hot && (
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Flame size={10} style={{ color: 'var(--rekt-mild)' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Hot carry</span>
                    </div>
                    <span className="text-xs font-bold text-white">{hot.symbol}</span>
                    <span className="text-[10px] text-neutral-400 ml-1.5">on {hot.exchange}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold font-mono" style={{ color: 'var(--rekt-mild)' }}>
                      {hot.apr.toFixed(0)}% APR
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500">
                      {(hot.rate * 100).toFixed(4)}% / 8h
                    </div>
                  </div>
                </div>
              </div>
            )}
            {cold && (
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px]">❄️</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Free longs</span>
                    </div>
                    <span className="text-xs font-bold text-white">{cold.symbol}</span>
                    <span className="text-[10px] text-neutral-400 ml-1.5">on {cold.exchange}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold font-mono" style={{ color: 'var(--pump-mild)' }}>
                      {cold.apr.toFixed(0)}% APR
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500">
                      {(cold.rate * 100).toFixed(4)}% / 8h
                    </div>
                  </div>
                </div>
              </div>
            )}
            <Link href="/signals" className="text-[10px] font-semibold text-hub-yellow hover:text-white transition-colors text-center py-1 no-underline">
              View all signals →
            </Link>
          </>
        )}
      </div>
    </DigestCard>
  );
}

function OISection({ data, loading }: { data: DigestData['oi']; loading: boolean }) {
  if (!loading && !data) return null;
  return (
    <DigestCard title="Open Interest" icon={<BarChart3 size={12} style={{ color: '#a78bfa' }} />} accent="#a78bfa">
      <div className="flex flex-col gap-2">
        {loading ? (
          <><SkeletonBar /><SkeletonBar w="70%" /></>
        ) : data ? (
          <>
            {data.total > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Total OI</span>
                <span className="text-xs font-bold font-mono text-violet-400">{fmtUsd(data.total)}</span>
              </div>
            )}
            {data.topSurge && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Biggest surge (24h)</span>
                <div className="flex items-center gap-1.5">
                  <TokenIconSimple symbol={data.topSurge.symbol} size={14} />
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--pump-mild)' }}>
                    {data.topSurge.symbol} +{data.topSurge.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
            {data.topDump && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Biggest drop (24h)</span>
                <div className="flex items-center gap-1.5">
                  <TokenIconSimple symbol={data.topDump.symbol} size={14} />
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--rekt-mild)' }}>
                    {data.topDump.symbol} {data.topDump.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </DigestCard>
  );
}

function MoversSection({ data, loading }: { data: DigestData['movers']; loading: boolean }) {
  const { gainers, losers } = data;
  return (
    <DigestCard title="Top Movers (24h)" icon={<TrendingUp size={12} style={{ color: 'var(--pump-mild)' }} />} accent="var(--pump-mild)">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-2">Gainers</div>
          <div className="flex flex-col gap-1.5">
            {loading ? (
              [1, 2, 3].map(i => <SkeletonBar key={i} w={`${70 - i * 5}%`} />)
            ) : gainers.length === 0 ? (
              <span className="text-xs text-neutral-600">—</span>
            ) : (
              gainers.slice(0, 4).map((m, i) => (
                <Link key={m.symbol} href={`/symbol/${m.symbol}`} className="flex items-center gap-1.5 no-underline group">
                  <span className="text-[9px] text-neutral-600 font-mono w-3">#{i + 1}</span>
                  <TokenIconSimple symbol={m.symbol} size={14} />
                  <span className="text-[11px] font-semibold text-neutral-300 group-hover:text-white transition-colors">{m.symbol}</span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--pump-mild)' }}>{fmtPct(m.change)}</span>
                </Link>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-2">Losers</div>
          <div className="flex flex-col gap-1.5">
            {loading ? (
              [1, 2, 3].map(i => <SkeletonBar key={i} w={`${70 - i * 5}%`} />)
            ) : losers.length === 0 ? (
              <span className="text-xs text-neutral-600">—</span>
            ) : (
              losers.slice(0, 4).map((m, i) => (
                <Link key={m.symbol} href={`/symbol/${m.symbol}`} className="flex items-center gap-1.5 no-underline group">
                  <span className="text-[9px] text-neutral-600 font-mono w-3">#{i + 1}</span>
                  <TokenIconSimple symbol={m.symbol} size={14} />
                  <span className="text-[11px] font-semibold text-neutral-300 group-hover:text-white transition-colors">{m.symbol}</span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--rekt-mild)' }}>{fmtPct(m.change)}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </DigestCard>
  );
}

/* ── Trade Ideas ─────────────────────────────────────────────────────── */

interface TradeIdea {
  type: 'carry_short' | 'neg_carry_long' | 'momentum_caution' | 'deleveraging' | 'oi_surge';
  symbol: string;
  headline: string;
  rationale: string;
  risk: string;
  href: string;
  tone: 'red' | 'green' | 'amber' | 'violet';
}

function deriveTradeIdeas(digest: DigestData): TradeIdea[] {
  const ideas: TradeIdea[] = [];

  // Hot carry → short the perp to capture premium
  if (digest.funding.hot && digest.funding.hot.apr >= 50) {
    const h = digest.funding.hot;
    ideas.push({
      type: 'carry_short',
      symbol: h.symbol,
      headline: `Capture ${h.apr.toFixed(0)}% APR carry on ${h.symbol}`,
      rationale: `Longs on ${h.exchange} are paying ${h.apr.toFixed(0)}% APR (${(h.rate * 100).toFixed(4)}%/8h). Shorting the perp while hedging spot delta captures this as income.`,
      risk: 'Squeeze risk if price rips. Requires delta-neutral hedge and active rate monitoring.',
      href: '/signals',
      tone: 'red',
    });
  }

  // Negative carry → free to hold longs
  if (digest.funding.cold && digest.funding.cold.apr >= 20) {
    const c = digest.funding.cold;
    ideas.push({
      type: 'neg_carry_long',
      symbol: c.symbol,
      headline: `Free longs on ${c.symbol} — shorts paying ${c.apr.toFixed(0)}% APR`,
      rationale: `Shorts on ${c.exchange} are paying longs ${c.apr.toFixed(0)}% APR. Holding longs while this persists costs nothing and earns carry.`,
      risk: 'Funding can flip quickly. Rate normalizing would remove the edge.',
      href: '/signals',
      tone: 'green',
    });
  }

  // OI surge — fresh positioning signal
  if (digest.oi?.topSurge && digest.oi.topSurge.pct >= 20) {
    const s = digest.oi.topSurge;
    ideas.push({
      type: 'oi_surge',
      symbol: s.symbol,
      headline: `${s.symbol} OI surged +${s.pct.toFixed(0)}% — fresh positioning`,
      rationale: `Rapid open interest build suggests new money entering. Often precedes directional moves — confirm with price action and funding direction before entry.`,
      risk: 'High OI can mean crowded positioning — large moves possible in either direction.',
      href: '/open-interest',
      tone: 'violet',
    });
  }

  // OI dump — deleveraging caution
  if (digest.oi?.topDump && digest.oi.topDump.pct <= -20) {
    const d = digest.oi.topDump;
    ideas.push({
      type: 'deleveraging',
      symbol: d.symbol,
      headline: `${d.symbol} deleveraging — OI fell ${d.pct.toFixed(0)}%`,
      rationale: `Rapid position unwinding often signals a trend exhaustion or forced liquidations. Fade caution until OI stabilizes.`,
      risk: 'Deleveraging can create oversold bounces. Watch for reversal if price holds key support.',
      href: '/open-interest',
      tone: 'amber',
    });
  }

  return ideas.slice(0, 3);
}

const TONE_COLORS = {
  red:    { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.15)', label: 'var(--rekt-mild)', badge: 'bg-red-500/15 text-red-400' },
  green:  { bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.15)', label: 'var(--pump-mild)', badge: 'bg-emerald-500/15 text-emerald-400' },
  amber:  { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.15)', label: '#f59e0b', badge: 'bg-amber-500/15 text-amber-400' },
  violet: { bg: 'rgba(139,92,246,0.07)', border: 'rgba(139,92,246,0.15)', label: '#a78bfa', badge: 'bg-violet-500/15 text-violet-400' },
};

function TradeIdeasSection({ digest, loading }: { digest: DigestData; loading: boolean }) {
  const ideas = useMemo(() => deriveTradeIdeas(digest), [digest]);
  if (!loading && ideas.length === 0) return null;

  return (
    <div className="md:col-span-2">
      <DigestCard
        title={loading ? 'Trade Ideas' : `Trade Ideas · ${ideas.length} today`}
        icon={<Zap size={12} style={{ color: '#f59e0b' }} />}
        accent="#f59e0b"
      >
        {loading ? (
          <div className="flex flex-col gap-3"><SkeletonBar /><SkeletonBar w="80%" /><SkeletonBar w="60%" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {ideas.map((idea, i) => {
              const tc = TONE_COLORS[idea.tone];
              return (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{ background: tc.bg, border: `1px solid ${tc.border}` }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${tc.badge}`}>
                        {idea.type === 'carry_short' ? 'Carry trade' : idea.type === 'neg_carry_long' ? 'Free longs' : idea.type === 'oi_surge' ? 'OI surge' : idea.type === 'deleveraging' ? 'Deleverage' : 'Signal'}
                      </span>
                      <span className="text-xs font-bold text-white">{idea.headline}</span>
                    </div>
                    <Link href={idea.href} className="text-[10px] font-semibold shrink-0 no-underline" style={{ color: tc.label }}>
                      Details →
                    </Link>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-snug mb-1">{idea.rationale}</p>
                  <p className="text-[10px] text-neutral-600">⚠️ {idea.risk}</p>
                </div>
              );
            })}
            <p className="text-[10px] text-neutral-600 text-center">
              Not financial advice. Always manage risk and DYOR.
            </p>
          </div>
        )}
      </DigestCard>
    </div>
  );
}

/* ── Share button ────────────────────────────────────────────────────── */

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://info-hub.io/today';
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-neutral-300 hover:text-white hover:border-white/20 transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */

export default function TodayPage() {
  const [digest, setDigest] = useState<DigestData>(EMPTY_DIGEST);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const origin = typeof window !== 'undefined' ? '' : 'https://info-hub.io';

    const [tickersR, globalR, fgR, liqR, fundingR, oiR, moversR] = await Promise.allSettled([
      fetch(`${origin}/api/tickers`, { signal: AbortSignal.timeout(12_000) }),
      fetch(`${origin}/api/global-stats`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${origin}/api/fear-greed`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`${origin}/api/liquidations/aggregate`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`${origin}/api/funding`, { signal: AbortSignal.timeout(12_000) }),
      fetch(`${origin}/api/oi-delta`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${origin}/api/top-movers`, { signal: AbortSignal.timeout(10_000) }),
    ]);

    async function json(r: PromiseSettledResult<Response>, fallback: any): Promise<any> {
      if (r.status !== 'fulfilled' || !r.value.ok) return fallback;
      try { return await r.value.json(); } catch { return fallback; }
    }

    const [tickersData, globalData, fgData, liqData, fundingData, oiData, moversData]: any[] = await Promise.all([
      json(tickersR, null),
      json(globalR, null),
      json(fgR, null),
      json(liqR, null),
      json(fundingR, null),
      json(oiR, null),
      json(moversR, null),
    ]);

    // Prices — deduplicate by symbol, preferring Binance
    const tickerArr: any[] = Array.isArray(tickersData) ? tickersData
      : Array.isArray(tickersData?.data) ? tickersData.data : [];
    const priceMap = new Map<string, { price: number; change24h: number }>();
    for (const t of tickerArr) {
      const sym = (t.symbol ?? '') as string;
      const price = Number(t.lastPrice ?? t.price ?? 0);
      const change = Number(t.priceChangePercent24h ?? t.change24h ?? 0);
      if (!priceMap.has(sym) || t.exchange === 'Binance') {
        priceMap.set(sym, { price, change24h: change });
      }
    }
    const prices = Array.from(priceMap.entries())
      .map(([symbol, d]) => ({ symbol, ...d }));

    // Sentiment
    const fgValue = fgData?.current?.value ?? fgData?.value ?? fgData?.data?.value ?? null;
    const fgLabel = fgData?.current?.classification ?? fgData?.classification ?? fgData?.data?.classification ?? null;
    const btcDom = globalData?.market_cap_percentage?.btc ?? null;
    const totalMcap = globalData?.total_market_cap?.usd ?? null;
    const mcapChange = globalData?.marketCapChangePercentage24h ?? globalData?.market_cap_change_percentage_24h_usd ?? null;

    // Liquidations
    const liqTotals = liqData?.totals ?? null;
    const liqs = liqTotals ? {
      total: Number(liqTotals.totalValue ?? 0),
      longs: Number(liqTotals.longValue ?? 0),
      shorts: Number(liqTotals.shortValue ?? 0),
    } : null;

    // Funding extremes — find hot (most positive) and cold (most negative)
    const fundingArr: any[] = Array.isArray(fundingData?.data) ? fundingData.data
      : Array.isArray(fundingData) ? fundingData : [];

    let hot: DigestData['funding']['hot'] = null;
    let cold: DigestData['funding']['cold'] = null;
    let maxRate = -Infinity;
    let minRate = Infinity;

    for (const f of fundingArr) {
      const rate = Number(f.fundingRate ?? 0);
      if (!Number.isFinite(rate)) continue;
      const h = Number(f.fundingIntervalHours ?? (f.fundingInterval === '1h' ? 1 : f.fundingInterval === '4h' ? 4 : 8));
      const apr = (rate * 8760 / h) * 100;
      if (rate >= 0.003 && rate > maxRate) {
        maxRate = rate;
        hot = { symbol: f.symbol, exchange: f.exchange, rate, apr };
      }
      if (rate <= -0.0005 && rate < minRate) {
        minRate = rate;
        cold = { symbol: f.symbol, exchange: f.exchange, rate, apr: Math.abs(apr) };
      }
    }

    // OI
    const oiArr: any[] = Array.isArray(oiData?.data) ? oiData.data
      : Array.isArray(oiData?.coins) ? oiData.coins
      : Array.isArray(oiData) ? oiData : [];
    const totalOI = oiArr.reduce((s, c) => s + Number(c.oi ?? c.currentOI ?? c.openInterestValue ?? 0), 0);
    const withChange = oiArr.filter(c => typeof (c.pct24h ?? c.oiChange24hPct) === 'number');
    const sorted = [...withChange].sort((a, b) =>
      (b.pct24h ?? b.oiChange24hPct ?? 0) - (a.pct24h ?? a.oiChange24hPct ?? 0),
    );
    const topSurge = sorted[0] ? { symbol: sorted[0].symbol, pct: Number(sorted[0].pct24h ?? sorted[0].oiChange24hPct ?? 0) } : null;
    const topDump = sorted[sorted.length - 1] && (sorted[sorted.length - 1].pct24h ?? sorted[sorted.length - 1].oiChange24hPct ?? 0) < -5
      ? { symbol: sorted[sorted.length - 1].symbol, pct: Number(sorted[sorted.length - 1].pct24h ?? sorted[sorted.length - 1].oiChange24hPct ?? 0) }
      : null;
    const oi = { total: totalOI, topSurge, topDump };

    // Movers
    const gainsArr: any[] = moversData?.gainers ?? [];
    const lossArr: any[] = moversData?.losers ?? [];
    const mapMover = (m: any) => ({
      symbol: m.symbol ?? '',
      price: Number(m.price ?? 0),
      change: Number(m.change24h ?? m.priceChangePercent24h ?? 0),
    });
    const movers = {
      gainers: gainsArr.slice(0, 4).map(mapMover),
      losers: lossArr.slice(0, 4).map(mapMover),
    };

    setDigest({ prices, sentiment: { fgValue, fgLabel, btcDom, totalMcap, mcapChange }, liqs, funding: { hot, cold }, oi, movers });
    setLastUpdate(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLabel = lastUpdate
    ? lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[900px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-hub-yellow" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
              Market Digest
            </span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {todayLabel()}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                Daily snapshot of what&apos;s moving crypto markets.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {updateLabel && (
                <span className="text-[10px] text-neutral-600 font-mono">Updated {updateLabel}</span>
              )}
              <button
                onClick={() => load(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-neutral-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <ShareButton />
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-hub-yellow/30 bg-hub-yellow/[0.08] text-hub-yellow hover:bg-hub-yellow/15 transition-colors no-underline"
              >
                <ExternalLink size={12} />
                Dashboard
              </Link>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PricesSection data={digest.prices} loading={loading} />
          <SentimentSection data={digest.sentiment} loading={loading} />
          <LiquidationsSection data={digest.liqs} loading={loading} />
          <FundingSection data={digest.funding} loading={loading} />
          <OISection data={digest.oi} loading={loading} />
          <MoversSection data={digest.movers} loading={loading} />
          <TradeIdeasSection digest={digest} loading={loading} />
        </div>

        {/* Footer CTA */}
        <div className="mt-8 rounded-2xl border border-hub-yellow/20 bg-hub-yellow/[0.04] p-5 text-center">
          <p className="text-sm font-semibold text-white mb-1">
            Want daily briefings straight to Telegram?
          </p>
          <p className="text-xs text-neutral-400 mb-3">
            Link your account and get this digest + extreme signal alerts every morning at 08:00 UTC.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/settings" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-hub-yellow/15 border border-hub-yellow/30 text-hub-yellow hover:bg-hub-yellow/20 transition-colors no-underline">
              Connect Telegram
            </Link>
            <Link href="/alerts" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-white/[0.08] bg-white/[0.04] text-neutral-300 hover:text-white hover:border-white/20 transition-colors no-underline">
              Set price alerts
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
