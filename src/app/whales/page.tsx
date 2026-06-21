'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useHLTrades, type HLTrade } from '@/hooks/useHLTrades';
import { Activity, TrendingUp, TrendingDown, Zap } from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────────

const COINS = ['BTC', 'ETH', 'SOL', 'ARB', 'SUI', 'DOGE', 'AVAX', 'LINK'];

const MIN_SIZES = [
  { label: '$50K',  value: 50_000  },
  { label: '$100K', value: 100_000 },
  { label: '$250K', value: 250_000 },
  { label: '$500K', value: 500_000 },
  { label: '$1M',   value: 1_000_000 },
];

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtPrice(n: number): string {
  if (n >= 10_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 100)    return n.toFixed(2);
  if (n >= 1)      return n.toFixed(4);
  return n.toFixed(6);
}

// ── Row styling ────────────────────────────────────────────────────────────────

function rowStyle(valueUsd: number, isBuy: boolean): string {
  if (valueUsd >= 1_000_000) return isBuy
    ? 'bg-emerald-400/[0.12] border-l-[3px] border-l-emerald-400'
    : 'bg-red-400/[0.12] border-l-[3px] border-l-red-400';
  if (valueUsd >= 500_000) return isBuy ? 'bg-emerald-400/[0.07]' : 'bg-red-400/[0.07]';
  if (valueUsd >= 250_000) return isBuy ? 'bg-emerald-400/[0.04]' : 'bg-red-400/[0.04]';
  return '';
}

function sizeEmoji(valueUsd: number): string {
  if (valueUsd >= 5_000_000) return '🔥🔥🔥';
  if (valueUsd >= 1_000_000) return '🔥🔥';
  if (valueUsd >= 500_000)   return '🔥';
  return '';
}

// ── Stats chip ─────────────────────────────────────────────────────────────────

function Stat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <span className="text-[9px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className={`text-sm font-bold font-mono ${tone}`}>{value}</span>
    </div>
  );
}

// ── Feed component ─────────────────────────────────────────────────────────────

function WhaleFeed({ coin, minSize }: { coin: string; minSize: number }) {
  const { trades, connected } = useHLTrades(coin);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to top (newest first) unless user scrolled down
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [trades]);

  const filtered = useMemo(
    () => trades.filter((t) => t.valueUsd >= minSize),
    [trades, minSize],
  );

  // Rolling stats for filtered + all trades
  const stats = useMemo(() => {
    const all = trades.slice(0, 500);
    const bigBuys = all.filter((t) => t.side === 'buy' && t.valueUsd >= minSize);
    const bigSells = all.filter((t) => t.side === 'sell' && t.valueUsd >= minSize);
    const buyVol = bigBuys.reduce((s, t) => s + t.valueUsd, 0);
    const sellVol = bigSells.reduce((s, t) => s + t.valueUsd, 0);
    const total = buyVol + sellVol;
    const buyPct = total > 0 ? (buyVol / total) * 100 : 50;
    return { buyVol, sellVol, total, buyPct, bigBuys: bigBuys.length, bigSells: bigSells.length };
  }, [trades, minSize]);

  return (
    <div className="flex flex-col gap-3">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-red-400 animate-pulse'}`}
        />
        <span className="text-[10px] text-neutral-500 font-medium">
          {connected ? `Hyperliquid · ${coin}-PERP live` : 'Connecting…'}
        </span>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2">
        <Stat label="Buy vol" value={fmtUsd(stats.buyVol)} tone="text-emerald-400" />
        <Stat label="Sell vol" value={fmtUsd(stats.sellVol)} tone="text-red-400" />
        <Stat
          label="Net"
          value={fmtUsd(Math.abs(stats.buyVol - stats.sellVol))}
          tone={stats.buyVol >= stats.sellVol ? 'text-emerald-400' : 'text-red-400'}
        />
        <Stat label="Buy %" value={`${stats.buyPct.toFixed(0)}%`}
          tone={stats.buyPct >= 60 ? 'text-emerald-400' : stats.buyPct <= 40 ? 'text-red-400' : 'text-white'} />
        <Stat label="Whale buys" value={String(stats.bigBuys)} tone="text-emerald-400" />
        <Stat label="Whale sells" value={String(stats.bigSells)} tone="text-red-400" />
      </div>

      {/* Buy/sell balance bar */}
      {stats.total > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.buyPct}%`,
              background: 'linear-gradient(90deg, #34d399, #10b981)',
            }}
          />
        </div>
      )}

      {/* Trade feed */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden"
        style={{
          height: 520,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          autoScrollRef.current = el.scrollTop < 40;
        }}
      >
        {/* Table header */}
        <div
          className="sticky top-0 z-10 grid gap-x-3 px-3 py-2"
          style={{
            gridTemplateColumns: '70px 1fr auto auto auto',
            background: 'rgba(15,15,18,0.95)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Time</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Side</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right">Price</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right">Size</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right">Value</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-neutral-600">
            <Activity className="w-8 h-8 opacity-20" />
            <p className="text-sm">
              {connected
                ? `Waiting for ${fmtUsd(minSize)}+ trades on ${coin}…`
                : 'Connecting to Hyperliquid…'}
            </p>
          </div>
        ) : (
          filtered.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))
        )}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: HLTrade }) {
  const isBuy = trade.side === 'buy';
  const emoji = sizeEmoji(trade.valueUsd);

  return (
    <div
      className={`grid gap-x-3 px-3 py-[7px] text-[12px] font-mono border-b border-white/[0.03] hover:brightness-110 transition-colors ${rowStyle(trade.valueUsd, isBuy)}`}
      style={{ gridTemplateColumns: '70px 1fr auto auto auto' }}
    >
      <span className="text-neutral-600 text-[10px] tabular-nums">{fmtTime(trade.time)}</span>

      <div className="flex items-center gap-1.5">
        {isBuy ? (
          <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
        )}
        <span className={`font-bold text-[11px] ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBuy ? 'BUY' : 'SELL'}
        </span>
        {emoji && <span className="text-[11px]">{emoji}</span>}
      </div>

      <span className="text-right text-neutral-400 tabular-nums">{fmtPrice(trade.price)}</span>

      <span className="text-right text-neutral-400 tabular-nums">
        {trade.size >= 1 ? trade.size.toFixed(2) : trade.size.toFixed(4)} {trade.coin}
      </span>

      <span className={`text-right font-bold tabular-nums ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtUsd(trade.valueUsd)}
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WhalesPage() {
  const [coin, setCoin] = useState('BTC');
  const [minSize, setMinSize] = useState(100_000);

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />

      <main id="main-content" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
                DEX Whale <span className="text-amber-400">Tracker</span>
              </h1>
              <p className="text-[12px] text-neutral-500 mt-1">
                Real-time large trades from Hyperliquid · Live WebSocket feed
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Coin tabs */}
          <div className="flex flex-wrap gap-1.5">
            {COINS.map((c) => (
              <button
                key={c}
                onClick={() => setCoin(c)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-150 ${
                  coin === c
                    ? 'bg-amber-400 text-black'
                    : 'text-neutral-500 hover:text-white border border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-white/[0.07] hidden sm:block" />

          {/* Min size filter */}
          <div className="flex rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {MIN_SIZES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setMinSize(value)}
                className={`px-3 py-[7px] text-[11px] font-bold font-mono transition-all duration-150 ${
                  minSize === value
                    ? 'bg-amber-400 text-black'
                    : 'text-neutral-500 hover:text-neutral-200'
                }`}
              >
                {label}+
              </button>
            ))}
          </div>
        </div>

        {/* Feed */}
        <WhaleFeed coin={coin} minSize={minSize} />

        <p className="text-[11px] text-neutral-700 mt-4 text-center">
          Data from Hyperliquid public WebSocket · No API key required ·{' '}
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-600 hover:text-neutral-400 transition-colors underline-offset-2"
          >
            hyperliquid.xyz
          </a>
        </p>
      </main>

      <Footer />
    </div>
  );
}
