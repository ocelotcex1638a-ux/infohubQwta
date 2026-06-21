'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useRealtimeTrades } from '@/hooks/useRealtimeTrades';
import type { RealtimeTrade } from '@/hooks/useRealtimeTrades';
import { Activity, List, Table2, RefreshCw } from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────────

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX', 'LINK', 'ARB', 'SUI'];

const MIN_SIZES = [
  { label: '$10K',  value: 10_000  },
  { label: '$25K',  value: 25_000  },
  { label: '$50K',  value: 50_000  },
  { label: '$100K', value: 100_000 },
  { label: '$250K', value: 250_000 },
  { label: '$500K', value: 500_000 },
];

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 100)    return n.toFixed(2);
  if (n >= 1)      return n.toFixed(4);
  return n.toFixed(6);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Trade row highlight by size ────────────────────────────────────────────────

function rowBg(quoteQty: number, isBuy: boolean): string {
  if (quoteQty >= 1_000_000) return isBuy ? 'bg-emerald-400/15 border-l-2 border-l-emerald-400' : 'bg-red-400/15 border-l-2 border-l-red-400';
  if (quoteQty >= 250_000)   return isBuy ? 'bg-emerald-400/10' : 'bg-red-400/10';
  if (quoteQty >= 100_000)   return isBuy ? 'bg-emerald-400/06' : 'bg-red-400/06';
  return '';
}

function sideColor(isBuy: boolean): string {
  return isBuy ? 'text-emerald-400' : 'text-red-400';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <span className="text-[9px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className={`text-sm font-bold font-mono ${tone}`}>{value}</span>
    </div>
  );
}

// ── Tape view ──────────────────────────────────────────────────────────────────

function TapeView({ trades, minSize }: { trades: RealtimeTrade[]; minSize: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll to top (newest) unless user has scrolled down
  useEffect(() => {
    if (!userScrolledRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [trades]);

  const filtered = useMemo(
    () => trades.filter((t) => t.quoteQty >= minSize),
    [trades, minSize],
  );

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto font-mono text-xs"
      onScroll={(e) => {
        userScrolledRef.current = (e.currentTarget.scrollTop > 40);
      }}
    >
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-neutral-500 text-xs">
          <Activity className="w-4 h-4 mb-2 opacity-50" />
          Waiting for trades ≥ {fmtUsd(minSize)}…
        </div>
      )}
      {filtered.map((t, i) => (
        <div
          key={`${t.time}-${i}`}
          className={`flex items-center px-3 py-[5px] border-b border-white/[0.03] transition-colors ${rowBg(t.quoteQty, t.isBuy)}`}
        >
          <span className={`w-9 font-bold text-[11px] uppercase ${sideColor(t.isBuy)}`}>
            {t.isBuy ? 'BUY' : 'SELL'}
          </span>
          <span className="w-24 text-neutral-200 tabular-nums">{fmtPrice(t.price)}</span>
          <span className={`w-20 tabular-nums font-semibold ${sideColor(t.isBuy)}`}>{fmtUsd(t.quoteQty)}</span>
          <span className="text-neutral-500 tabular-nums">{fmtTime(t.time)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Table view (retains all big trades for the session) ───────────────────────

function TableView({ trades, minSize }: { trades: RealtimeTrade[]; minSize: number }) {
  const [sortDesc, setSortDesc] = useState(true);

  const filtered = useMemo(
    () => trades
      .filter((t) => t.quoteQty >= minSize)
      .sort((a, b) => sortDesc ? b.quoteQty - a.quoteQty : a.quoteQty - b.quoteQty),
    [trades, minSize, sortDesc],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-xs font-mono">
        <thead className="sticky top-0 z-10 bg-hub-black border-b border-white/[0.07]">
          <tr>
            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-neutral-500">Time</th>
            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-neutral-500">Side</th>
            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-neutral-500">Price</th>
            <th className="text-right py-2 px-3 text-[10px] uppercase tracking-widest text-neutral-500 cursor-pointer hover:text-neutral-300"
              onClick={() => setSortDesc(!sortDesc)}>
              Size {sortDesc ? '↓' : '↑'}
            </th>
            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-neutral-500">Qty</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t, i) => (
            <tr
              key={`${t.time}-${i}`}
              className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${rowBg(t.quoteQty, t.isBuy)}`}
            >
              <td className="py-2 px-3 text-neutral-500 tabular-nums">{fmtTime(t.time)}</td>
              <td className={`py-2 px-3 font-bold uppercase ${sideColor(t.isBuy)}`}>{t.isBuy ? 'BUY' : 'SELL'}</td>
              <td className="py-2 px-3 text-neutral-200 tabular-nums">{fmtPrice(t.price)}</td>
              <td className={`py-2 px-3 text-right tabular-nums font-semibold ${sideColor(t.isBuy)}`}>{fmtUsd(t.quoteQty)}</td>
              <td className="py-2 px-3 text-neutral-400 tabular-nums">{t.qty.toFixed(4)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-neutral-500">
                No trades ≥ {fmtUsd(minSize)} yet in this session.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TapePage() {
  const [symbol, setSymbol] = useState('BTC');
  const [minSize, setMinSize] = useState(50_000);
  const [view, setView] = useState<'tape' | 'table'>('tape');

  const { trades, stats, connected } = useRealtimeTrades(symbol);

  const buyPct = stats.buyVolume + stats.sellVolume > 0
    ? (stats.buyVolume / (stats.buyVolume + stats.sellVolume) * 100)
    : 50;

  return (
    <div className="min-h-screen bg-hub-black flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col max-w-[1200px] mx-auto w-full px-4 py-6">

        {/* ── Title bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-hub-yellow" />
              <h1 className="text-xl font-bold text-white">Trade Tape</h1>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className={`text-xs font-semibold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                {connected ? 'streaming' : 'connecting'}
              </span>
            </div>
            <p className="text-sm text-neutral-400">
              Live Binance Futures trades — filtered by size, newest first
            </p>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Symbol */}
          <div className="flex gap-1 flex-wrap">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  symbol === s
                    ? 'bg-hub-yellow/20 text-hub-yellow border border-hub-yellow/40'
                    : 'border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/[0.07] hidden sm:block" />

          {/* Min size */}
          <div className="flex gap-1">
            {MIN_SIZES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setMinSize(value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  minSize === value
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setView('tape')}
              className={`p-2 rounded-lg border text-xs transition-colors ${
                view === 'tape'
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-white'
              }`}
              title="Tape view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-2 rounded-lg border text-xs transition-colors ${
                view === 'table'
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-white'
              }`}
              title="Table view"
            >
              <Table2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <StatChip label="Buy Vol" value={fmtUsd(stats.buyVolume)} tone="text-emerald-400" />
          <StatChip label="Sell Vol" value={fmtUsd(stats.sellVolume)} tone="text-red-400" />
          <StatChip label="Net Delta" value={`${stats.netDelta >= 0 ? '+' : ''}${fmtUsd(Math.abs(stats.netDelta))}`}
            tone={stats.netDelta >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <StatChip label="Buy %" value={`${buyPct.toFixed(1)}%`}
            tone={buyPct > 55 ? 'text-emerald-400' : buyPct < 45 ? 'text-red-400' : 'text-white'} />
          <StatChip label="CVD" value={`${stats.cvd >= 0 ? '+' : ''}${stats.cvd.toFixed(2)}`}
            tone={stats.cvd >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <StatChip label="Trades/s" value={stats.tradeSpeed.toFixed(1)} />
          <StatChip label="VWAP" value={`$${fmtPrice(stats.vwap)}`} tone="text-neutral-200" />

          {/* Buy/sell bar */}
          <div className="flex-1 min-w-[120px] flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${buyPct}%`,
                  background: 'linear-gradient(90deg, #34d399, #10b981)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Main tape / table panel ── */}
        <div className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.01] overflow-hidden flex flex-col min-h-[500px]">
          {/* Column headers for tape */}
          {view === 'tape' && (
            <div className="flex items-center px-3 py-2 border-b border-white/[0.07] bg-white/[0.02]">
              <span className="w-9 text-[10px] uppercase tracking-widest text-neutral-500">Side</span>
              <span className="w-24 text-[10px] uppercase tracking-widest text-neutral-500">Price</span>
              <span className="w-20 text-[10px] uppercase tracking-widest text-neutral-500">Size</span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">Time</span>
            </div>
          )}

          {view === 'tape'
            ? <TapeView trades={trades} minSize={minSize} />
            : <TableView trades={trades} minSize={minSize} />
          }
        </div>

        <p className="text-[11px] text-neutral-600 mt-3">
          Source: Binance Futures WebSocket · {symbol}USDT · trades ≥ {fmtUsd(minSize)} shown ·{' '}
          Big trades ≥$1M highlighted
        </p>
      </main>
      <Footer />
    </div>
  );
}
