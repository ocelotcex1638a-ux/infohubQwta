'use client';

/**
 * /scalper — intraday / scalper cockpit (shortlist item 6).
 *
 * A single-symbol command center for fast traders: a live TradingView chart
 * (reusing the /chart embed) front-and-center, a live long/short positioning
 * card, and one-click deep-dives into the microstructure tools that already
 * exist (order flow, CVD, OB imbalance, liq levels) — so a scalper doesn't have
 * to hop between five pages to read one symbol.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Zap, Activity, Waves, BarChart2, Flame, Gauge, LineChart } from 'lucide-react';
import { TradingViewChart } from '@/app/chart/components/TradingViewChart';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE', 'SUI', 'LINK'];
const INTERVALS: { v: string; label: string }[] = [
  { v: '1', label: '1m' },
  { v: '5', label: '5m' },
  { v: '15', label: '15m' },
  { v: '60', label: '1h' },
];

interface LsState { longPct: number | null; ratio: number | null }

export default function ScalperPage() {
  const [symbol, setSymbol] = useState('BTC');
  const [interval, setInterval] = useState('15');
  const [ls, setLs] = useState<LsState>({ longPct: null, ratio: null });

  const loadLs = useCallback(async (sym: string) => {
    setLs({ longPct: null, ratio: null });
    try {
      const r = await fetch(`/api/longshort?symbol=${sym}USDT&period=5m&limit=1`, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) return;
      const json = await r.json();
      // Tolerate a few response shapes — read the last data point defensively.
      const points: any[] = json?.data ?? json?.points ?? (Array.isArray(json) ? json : []);
      const last = points[points.length - 1];
      if (!last) return;
      const longPct = typeof last.longRatio === 'number' ? last.longRatio : null;
      const ratio = typeof last.longShortRatio === 'number' ? last.longShortRatio : null;
      setLs({ longPct, ratio });
    } catch { /* leave as — */ }
  }, []);

  useEffect(() => {
    loadLs(symbol);
    const id = window.setInterval(() => loadLs(symbol), 30_000);
    return () => window.clearInterval(id);
  }, [symbol, loadLs]);

  const tvSymbol = `BINANCE:${symbol}USDT`;
  const longPct = ls.longPct;
  const shortPct = longPct != null ? 100 - longPct : null;

  const deepDives: { label: string; href: string; hint: string; icon: typeof Activity }[] = [
    { label: 'Order Flow', href: `/orderflow?symbol=${symbol}`, hint: 'Tape + aggressor side', icon: Waves },
    { label: 'CVD', href: `/cvd?symbol=${symbol}`, hint: 'Cumulative volume delta', icon: BarChart2 },
    { label: 'OB Imbalance', href: `/orderbook-imbalance?symbol=${symbol}`, hint: 'Bid vs ask depth', icon: Gauge },
    { label: 'Liq Levels', href: `/liquidation-levels?symbol=${symbol}`, hint: 'Imminent squeeze zones', icon: Flame },
    { label: 'Liq Heatmap', href: `/liquidation-heatmap?symbol=${symbol}`, hint: 'Magnet levels', icon: Flame },
    { label: 'Full Chart', href: `/chart?s=${symbol}`, hint: 'Indicators + drawings', icon: LineChart },
  ];

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[1400px] mx-auto w-full px-4 py-6">
        <PageHero
          icon={Zap}
          eyebrow="Intraday · scalper cockpit"
          title="Scalper"
          accentNoun="cockpit"
          accent="orange"
          description={
            <>One symbol, one screen — a live chart plus the microstructure read
              (positioning, flow, liquidation magnets) without hopping between
              five tabs. Pick a symbol and timeframe to start.</>
          }
          className="mb-4"
        />

        {/* Symbol + interval controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex flex-wrap gap-1">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${symbol === s ? 'bg-hub-yellow text-black' : 'bg-white/[0.03] text-neutral-400 hover:text-white border border-white/[0.06]'}`}
              >{s}</button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
            {INTERVALS.map((iv) => (
              <button
                key={iv.v}
                onClick={() => setInterval(iv.v)}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${interval === iv.v ? 'bg-white/[0.10] text-white' : 'bg-white/[0.02] text-neutral-500 hover:text-white'}`}
              >{iv.label}</button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Chart */}
          <div className="lg:col-span-2 card-premium p-0 overflow-hidden" style={{ height: 460 }}>
            <TradingViewChart tvSymbol={tvSymbol} interval={interval} hideSideToolbar />
          </div>

          {/* Side rail */}
          <div className="space-y-4">
            {/* Positioning */}
            <div className="card-premium p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Positioning · {symbol}</h2>
              </div>
              {longPct == null ? (
                <p className="text-xs text-neutral-500 py-2">Loading long/short…</p>
              ) : (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.05] mb-2">
                    <div className="bg-emerald-500/70" style={{ width: `${longPct}%` }} />
                    <div className="bg-rose-500/70" style={{ width: `${shortPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-emerald-400">{longPct.toFixed(1)}% long</span>
                    <span className="text-rose-400">{shortPct!.toFixed(1)}% short</span>
                  </div>
                  {ls.ratio != null && (
                    <div className="text-[10px] text-neutral-500 mt-1.5">
                      L/S ratio <span className="font-mono text-neutral-300">{ls.ratio.toFixed(2)}</span> · Binance global · 5m · auto-refresh 30s
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Deep dives */}
            <div className="card-premium p-4">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Read the flow</h2>
              <div className="grid grid-cols-2 gap-2">
                {deepDives.map((d) => {
                  const Icon = d.icon;
                  return (
                    <Link
                      key={d.label}
                      href={d.href}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 hover:border-hub-yellow/30 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-hub-yellow transition-colors" />
                        <span className="text-[12px] font-semibold text-white">{d.label}</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{d.hint}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-neutral-600 mt-3">
          Chart by TradingView. Positioning from Binance global long/short accounts. The deep-dive tools open prefilled with {symbol} where supported.
        </p>
      </main>
      <Footer />
    </div>
  );
}
