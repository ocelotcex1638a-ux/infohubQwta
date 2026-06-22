'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useHLTrades } from '@/hooks/useHLTrades';
import { Activity, TrendingUp, TrendingDown, Zap } from 'lucide-react';

// ── Config ─────────────────────────────────────────────────────────────────────

const COINS = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE', 'AVAX', 'LINK', 'SUI', 'OP', 'NEAR', 'APT', 'WIF', 'PEPE', 'TIA'];

// dYdX v4 market IDs for supported coins (others skip silently)
const DYDX_MARKETS: Record<string, string> = {
  BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', ARB: 'ARB-USD',
  DOGE: 'DOGE-USD', AVAX: 'AVAX-USD', LINK: 'LINK-USD',
  OP: 'OP-USD', NEAR: 'NEAR-USD', APT: 'APT-USD',
};

const MIN_SIZES = [
  { label: '$50K',  value: 50_000  },
  { label: '$100K', value: 100_000 },
  { label: '$250K', value: 250_000 },
  { label: '$500K', value: 500_000 },
  { label: '$1M',   value: 1_000_000 },
];

// Aevo instrument names (BTC-PERP, ETH-PERP, SOL-PERP, etc.)
const AEVO_MARKETS: Record<string, string> = {
  BTC: 'BTC-PERP', ETH: 'ETH-PERP', SOL: 'SOL-PERP', ARB: 'ARB-PERP',
  DOGE: 'DOGE-PERP', AVAX: 'AVAX-PERP', LINK: 'LINK-PERP', OP: 'OP-PERP',
  SUI: 'SUI-PERP', APT: 'APT-PERP', WIF: 'WIF-PERP', PEPE: 'PEPE-PERP',
};

// Backpack symbol names (BTC_USDC_PERP, etc.)
const BACKPACK_MARKETS: Record<string, string> = {
  BTC: 'BTC_USDC_PERP', ETH: 'ETH_USDC_PERP', SOL: 'SOL_USDC_PERP',
  LINK: 'LINK_USDC_PERP', AVAX: 'AVAX_USDC_PERP', SUI: 'SUI_USDC_PERP',
  APT: 'APT_USDC_PERP', DOGE: 'DOGE_USDC_PERP',
};

// ── Types ──────────────────────────────────────────────────────────────────────

type DexVenue = 'HL' | 'dYdX' | 'Aevo' | 'Backpack';

interface DexTrade {
  id: string;
  venue: DexVenue;
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  valueUsd: number;
  time: number;
}

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

function sizeEmoji(valueUsd: number): string {
  if (valueUsd >= 5_000_000) return '🔥🔥🔥';
  if (valueUsd >= 1_000_000) return '🔥🔥';
  if (valueUsd >= 500_000)   return '🔥';
  return '';
}

// ── Row styling ────────────────────────────────────────────────────────────────

function venueStyle(venue: DexVenue): string {
  switch (venue) {
    case 'HL':       return 'bg-violet-400/20 text-violet-400';
    case 'dYdX':     return 'bg-sky-400/20 text-sky-400';
    case 'Aevo':     return 'bg-rose-400/20 text-rose-400';
    case 'Backpack': return 'bg-amber-400/20 text-amber-400';
  }
}

function rowCls(valueUsd: number, isBuy: boolean): string {
  if (valueUsd >= 1_000_000) return isBuy
    ? 'bg-emerald-400/[0.12] border-l-[3px] border-l-emerald-400'
    : 'bg-red-400/[0.12] border-l-[3px] border-l-red-400';
  if (valueUsd >= 500_000) return isBuy ? 'bg-emerald-400/[0.07]' : 'bg-red-400/[0.07]';
  if (valueUsd >= 250_000) return isBuy ? 'bg-emerald-400/[0.04]' : 'bg-red-400/[0.04]';
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

// ── dYdX polling hook ─────────────────────────────────────────────────────────

function useDyDxTrades(coin: string): DexTrade[] {
  const [trades, setTrades] = useState<DexTrade[]>([]);
  const seenIds = useRef(new Set<string>());
  const market = DYDX_MARKETS[coin];

  const poll = useCallback(async () => {
    if (!market) return;
    try {
      const res = await fetch(
        `https://indexer.dydx.trade/v4/trades/perpetualMarket/${market}?limit=20`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const json = await res.json() as { trades?: { id?: string; side?: string; size?: string; price?: string; createdAt?: string }[] };
      const raw = json.trades ?? [];
      const fresh: DexTrade[] = [];

      for (const t of raw) {
        if (!t.id || !t.side || !t.price || !t.size || !t.createdAt) continue;
        if (seenIds.current.has(t.id)) continue;
        const price = parseFloat(t.price);
        const size = parseFloat(t.size);
        if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) continue;
        seenIds.current.add(t.id);
        fresh.push({
          id: `dydx:${t.id}`,
          venue: 'dYdX',
          coin,
          side: t.side === 'BUY' ? 'buy' : 'sell',
          price,
          size,
          valueUsd: price * size,
          time: new Date(t.createdAt).getTime(),
        });
      }

      if (fresh.length > 0) {
        setTrades(prev => [...fresh, ...prev].slice(0, 300));
      }
    } catch { /* network error — next poll will retry */ }
  }, [market, coin]);

  useEffect(() => {
    seenIds.current.clear();
    setTrades([]);
    if (!market) return;

    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [coin, market, poll]);

  return trades;
}

// ── Aevo polling hook ─────────────────────────────────────────────────────────

function useAevoTrades(coin: string): DexTrade[] {
  const [trades, setTrades] = useState<DexTrade[]>([]);
  const seenIds = useRef(new Set<string>());
  const instrument = AEVO_MARKETS[coin];

  const poll = useCallback(async () => {
    if (!instrument) return;
    try {
      const res = await fetch(
        `https://api.aevo.xyz/trades?instrument_name=${instrument}&limit=30`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const json = await res.json() as { trades?: Array<{
        trade_id?: string;
        taker_side?: string;
        price?: string;
        amount?: string;
        created_timestamp?: string;
      }> };
      const raw = json.trades ?? [];
      const fresh: DexTrade[] = [];
      for (const t of raw) {
        const id = t.trade_id;
        if (!id || seenIds.current.has(id)) continue;
        const price = parseFloat(t.price ?? '');
        const size  = parseFloat(t.amount ?? '');
        if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) continue;
        // Aevo timestamps are in microseconds
        const ts = t.created_timestamp ? Math.floor(Number(t.created_timestamp) / 1000) : Date.now();
        seenIds.current.add(id);
        fresh.push({
          id: `aevo:${id}`,
          venue: 'Aevo',
          coin,
          side: t.taker_side === 'buy' ? 'buy' : 'sell',
          price,
          size,
          valueUsd: price * size,
          time: ts,
        });
      }
      if (fresh.length > 0) setTrades(prev => [...fresh, ...prev].slice(0, 300));
    } catch { /* network — next poll retries */ }
  }, [instrument, coin]);

  useEffect(() => {
    seenIds.current.clear();
    setTrades([]);
    if (!instrument) return;
    poll();
    const id = setInterval(poll, 6_000);
    return () => clearInterval(id);
  }, [coin, instrument, poll]);

  return trades;
}

// ── Backpack polling hook ──────────────────────────────────────────────────────

function useBackpackTrades(coin: string): DexTrade[] {
  const [trades, setTrades] = useState<DexTrade[]>([]);
  const seenIds = useRef(new Set<string>());
  const symbol = BACKPACK_MARKETS[coin];

  const poll = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await fetch(
        `https://api.backpack.exchange/api/v1/trades?symbol=${symbol}&limit=30`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const raw = await res.json() as Array<{
        id?: string;
        price?: string;
        quantity?: string;
        isBuyerMaker?: boolean;
        timestamp?: number;
      }>;
      if (!Array.isArray(raw)) return;
      const fresh: DexTrade[] = [];
      for (const t of raw) {
        const id = String(t.id ?? '');
        if (!id || seenIds.current.has(id)) continue;
        const price = parseFloat(t.price ?? '');
        const size  = parseFloat(t.quantity ?? '');
        if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) continue;
        seenIds.current.add(id);
        fresh.push({
          id: `bp:${id}`,
          venue: 'Backpack',
          coin,
          // isBuyerMaker=true means the taker was selling (buy order already in book)
          side: t.isBuyerMaker ? 'sell' : 'buy',
          price,
          size,
          valueUsd: price * size,
          time: t.timestamp ?? Date.now(),
        });
      }
      if (fresh.length > 0) setTrades(prev => [...fresh, ...prev].slice(0, 300));
    } catch { /* network — next poll retries */ }
  }, [symbol, coin]);

  useEffect(() => {
    seenIds.current.clear();
    setTrades([]);
    if (!symbol) return;
    poll();
    const id = setInterval(poll, 7_000);
    return () => clearInterval(id);
  }, [coin, symbol, poll]);

  return trades;
}

// ── Trade row ──────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: DexTrade }) {
  const isBuy = trade.side === 'buy';
  const emoji = sizeEmoji(trade.valueUsd);

  return (
    <div
      className={`grid gap-x-2 px-3 py-[6px] text-[12px] font-mono border-b border-white/[0.03] hover:brightness-110 transition-colors ${rowCls(trade.valueUsd, isBuy)}`}
      style={{ gridTemplateColumns: '68px 36px 1fr auto auto auto' }}
    >
      <span className="text-neutral-600 text-[10px] tabular-nums">{fmtTime(trade.time)}</span>

      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded self-center text-center ${venueStyle(trade.venue)}`}>
        {trade.venue}
      </span>

      <div className="flex items-center gap-1.5">
        {isBuy ? (
          <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
        )}
        <span className={`font-bold text-[11px] ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBuy ? 'BUY' : 'SELL'}
        </span>
        {emoji && <span className="text-[11px] hidden sm:inline">{emoji}</span>}
      </div>

      <span className="text-right text-neutral-400 tabular-nums">{fmtPrice(trade.price)}</span>

      <span className="text-right text-neutral-500 tabular-nums text-[11px]">
        {trade.size >= 1 ? trade.size.toFixed(2) : trade.size.toFixed(4)} {trade.coin}
      </span>

      <span className={`text-right font-bold tabular-nums ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtUsd(trade.valueUsd)}
      </span>
    </div>
  );
}

// ── Feed component ─────────────────────────────────────────────────────────────

function WhaleFeed({ coin, minSize }: { coin: string; minSize: number }) {
  const { trades: hlTrades, connected: hlConnected } = useHLTrades(coin);
  const dydxTrades = useDyDxTrades(coin);
  const aevoTrades = useAevoTrades(coin);
  const backpackTrades = useBackpackTrades(coin);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Convert HL trades to DexTrade shape
  const hlDexTrades: DexTrade[] = useMemo(
    () => hlTrades.map((t) => ({ ...t, venue: 'HL' as const, id: `hl:${t.id}` })),
    [hlTrades],
  );

  // Merge all venues + sort by time desc
  const allTrades = useMemo(() => {
    return [...hlDexTrades, ...dydxTrades, ...aevoTrades, ...backpackTrades]
      .sort((a, b) => b.time - a.time)
      .slice(0, 600);
  }, [hlDexTrades, dydxTrades, aevoTrades, backpackTrades]);

  const filtered = useMemo(
    () => allTrades.filter((t) => t.valueUsd >= minSize),
    [allTrades, minSize],
  );

  // Auto-scroll to top (newest first) unless user scrolled down
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [filtered.length]);

  // Rolling stats
  const stats = useMemo(() => {
    const big = allTrades.filter((t) => t.valueUsd >= minSize).slice(0, 600);
    const buyVol  = big.filter(t => t.side === 'buy').reduce((s, t) => s + t.valueUsd, 0);
    const sellVol = big.filter(t => t.side === 'sell').reduce((s, t) => s + t.valueUsd, 0);
    const total   = buyVol + sellVol;
    const buyPct  = total > 0 ? (buyVol / total) * 100 : 50;
    const counts: Partial<Record<DexVenue, number>> = {};
    for (const t of filtered) counts[t.venue] = (counts[t.venue] ?? 0) + 1;
    return { buyVol, sellVol, total, buyPct, counts };
  }, [allTrades, filtered, minSize]);

  const hasDydx = !!DYDX_MARKETS[coin];
  const hasAevo = !!AEVO_MARKETS[coin];
  const hasBackpack = !!BACKPACK_MARKETS[coin];

  return (
    <div className="flex flex-col gap-3">
      {/* Connection status */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${hlConnected ? 'bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]' : 'bg-neutral-600 animate-pulse'}`} />
          <span className="text-[10px] text-neutral-500 font-medium">
            HL {hlConnected ? 'live' : 'connecting…'}
          </span>
        </div>
        {hasDydx && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
            <span className="text-[10px] text-neutral-500 font-medium">dYdX 5s</span>
          </div>
        )}
        {hasAevo && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]" />
            <span className="text-[10px] text-neutral-500 font-medium">Aevo 6s</span>
          </div>
        )}
        {hasBackpack && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
            <span className="text-[10px] text-neutral-500 font-medium">Backpack 7s</span>
          </div>
        )}
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
        <div className="flex gap-2">
          {(['HL', 'dYdX', 'Aevo', 'Backpack'] as DexVenue[]).map(v => {
            const count = stats.counts[v];
            if (count == null) return null;
            return (
              <div key={v} className="flex flex-col gap-0.5 px-3 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
                <span className="text-[9px] uppercase tracking-widest text-neutral-500">{v}</span>
                <span className={`text-sm font-bold font-mono ${
                  v === 'HL' ? 'text-violet-400' : v === 'dYdX' ? 'text-sky-400' : v === 'Aevo' ? 'text-rose-400' : 'text-amber-400'
                }`}>{count}</span>
              </div>
            );
          })}
        </div>
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

      {/* Feed table */}
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
          className="sticky top-0 z-10 grid gap-x-2 px-3 py-2"
          style={{
            gridTemplateColumns: '68px 36px 1fr auto auto auto',
            background: 'rgba(15,15,18,0.97)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Time</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Venue</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600">Side</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right">Price</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right hidden sm:block">Size</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 text-right">Value</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-neutral-600">
            <Activity className="w-8 h-8 opacity-20" />
            <p className="text-sm">
              {hlConnected
                ? `Waiting for ${fmtUsd(minSize)}+ trades on ${coin}…`
                : 'Connecting to Hyperliquid…'}
            </p>
          </div>
        ) : (
          filtered.map((trade) => <TradeRow key={trade.id} trade={trade} />)
        )}
      </div>
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
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}
            >
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
                DEX Whale <span className="text-amber-400">Tracker</span>
              </h1>
              <p className="text-[12px] text-neutral-500 mt-1">
                Real-time fills from{' '}
                <span className="text-violet-400 font-semibold">Hyperliquid</span> (WS) ·{' '}
                <span className="text-sky-400 font-semibold">dYdX</span> ·{' '}
                <span className="text-rose-400 font-semibold">Aevo</span> ·{' '}
                <span className="text-amber-400 font-semibold">Backpack</span>
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-5 overflow-x-auto scrollbar-none pb-0.5 -mb-0.5">
          {/* Coin tabs */}
          <div className="flex gap-1.5 shrink-0">
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
          <div
            className="flex rounded-lg overflow-hidden shrink-0"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
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
          Hyperliquid WebSocket · dYdX Indexer · Aevo REST · Backpack REST · No auth required
        </p>
      </main>

      <Footer />
    </div>
  );
}
