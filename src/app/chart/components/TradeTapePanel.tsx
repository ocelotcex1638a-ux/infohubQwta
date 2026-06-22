'use client';

/**
 * Live orderflow panel for the /chart terminal.
 *
 * Velo-style layout:
 *   · CVD (cumulative volume delta) — session-wide, with sparkline
 *   · Buy% / Sell% bar
 *   · VWAP, trade speed (trades/sec), big-trade counts
 *   · Window selector (5m / 15m / 1h / All)
 *   · Live trade tape with size-scaled row highlighting
 *
 * All stats are already computed by useRealtimeTrades / computeTradeStats —
 * this component just renders them.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRealtimeTrades, STATS_WINDOWS, type StatsWindow } from '@/hooks/useRealtimeTrades';

const MAX_DISPLAY = 40;

function fmtVol(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatAge(ms: number): string {
  if (ms < 1_000) return '0s';
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

/** Mini CVD sparkline rendered as an inline SVG */
function CvdSparkline({ history, cvd }: { history: number[]; cvd: number }) {
  const pts = history.length;
  if (pts < 2) return null;
  const W = 120, H = 28;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const toY = (v: number) => H - ((v - min) / range) * H;
  const toX = (i: number) => (i / (pts - 1)) * W;
  const d = history.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const isPositive = cvd >= 0;
  const color = isPositive ? '#34d399' : '#f87171';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Zero line */}
      <line x1="0" y1={toY(0).toFixed(1)} x2={W} y2={toY(0).toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {/* CVD path */}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity={0.9} />
      {/* End dot */}
      <circle cx={toX(pts - 1)} cy={toY(history[pts - 1])} r="2.5" fill={color} />
    </svg>
  );
}

export function TradeTapePanel({ symbol }: { symbol: string }) {
  const { trades, stats, connected, statsWindow, setStatsWindow } = useRealtimeTrades(symbol);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const recent = trades.slice(0, MAX_DISPLAY);

  const totalVol = stats.buyVolume + stats.sellVolume;
  const buyPct = totalVol > 0 ? (stats.buyVolume / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;

  const cvdPositive = stats.cvd >= 0;

  // Current window label for the badge
  const windowLabel = useMemo(
    () => STATS_WINDOWS.find(w => w.key === statsWindow)?.label ?? '5m',
    [statsWindow],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] shrink-0"
        style={{ background: 'linear-gradient(180deg, #10131a 0%, #0c0e13 100%)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Order Flow</span>
          <span className="text-[10px] text-neutral-600">· {symbol} · Binance</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex gap-0.5">
            {STATS_WINDOWS.map(w => (
              <button
                key={w.key}
                onClick={() => setStatsWindow(w.key as StatsWindow)}
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider transition-colors ${
                  statsWindow === w.key
                    ? 'bg-hub-yellow/20 text-hub-yellow'
                    : 'text-neutral-600 hover:text-neutral-400'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
        </div>
      </div>

      {/* ── CVD + stats row ─────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1.5 border-b border-white/[0.04] shrink-0 space-y-1.5">
        {/* CVD display */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-neutral-600 mb-0.5">CVD (session)</p>
            <p className={`text-sm font-bold font-mono tabular-nums leading-none ${cvdPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtVol(stats.cvd)}
            </p>
          </div>
          <CvdSparkline history={stats.cvdHistory} cvd={stats.cvd} />
        </div>

        {/* Buy/sell bar */}
        <div>
          <div className="flex items-center justify-between text-[9px] font-mono mb-0.5">
            <span className="text-emerald-400">B {buyPct.toFixed(0)}%</span>
            <span className="text-neutral-600">{windowLabel} vol {fmtVol(totalVol)}</span>
            <span className="text-red-400">{sellPct.toFixed(0)}% S</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-white/[0.05]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${buyPct}%`,
                background: buyPct >= 60
                  ? 'linear-gradient(90deg, #34d399, #10b981)'
                  : buyPct <= 40
                    ? 'linear-gradient(90deg, #f87171, #ef4444)'
                    : 'linear-gradient(90deg, #34d399, #fbbf24)',
              }}
            />
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap gap-1.5">
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-neutral-700">VWAP</span>
            <span className="text-[10px] font-mono font-bold text-neutral-300">${stats.vwap > 0 ? stats.vwap.toFixed(2) : '—'}</span>
          </div>
          <div className="w-px h-full bg-white/[0.06]" />
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-neutral-700">Speed</span>
            <span className="text-[10px] font-mono font-bold text-neutral-300">{stats.tradeSpeed}/s</span>
          </div>
          <div className="w-px h-full bg-white/[0.06]" />
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-neutral-700">Big buys</span>
            <span className="text-[10px] font-mono font-bold text-emerald-400">{stats.bigBuys}</span>
          </div>
          <div className="w-px h-full bg-white/[0.06]" />
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-neutral-700">Big sells</span>
            <span className="text-[10px] font-mono font-bold text-red-400">{stats.bigSells}</span>
          </div>
          <div className="w-px h-full bg-white/[0.06]" />
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-neutral-700">Net Δ</span>
            <span className={`text-[10px] font-mono font-bold ${stats.netDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtVol(stats.netDelta)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Column header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 text-[9px] uppercase tracking-wider text-neutral-700 shrink-0 border-b border-white/[0.04]">
        <span>Side</span>
        <span>Price</span>
        <span>Size</span>
        <span className="text-right">Age</span>
      </div>

      {/* ── Tape rows ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {recent.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-[10px] text-neutral-600">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'waiting for trades…' : 'connecting…'}
          </div>
        )}
        {recent.map((t, i) => {
          const isBig = t.quoteQty > 50_000;
          const isWhale = t.quoteQty > 250_000;
          const sideColor = t.isBuy
            ? (isWhale ? 'text-emerald-200' : isBig ? 'text-emerald-300' : 'text-emerald-400')
            : (isWhale ? 'text-red-200' : isBig ? 'text-red-300' : 'text-red-400');
          const bgClass = isWhale
            ? (t.isBuy ? 'bg-gradient-to-r from-emerald-500/[0.10] to-transparent' : 'bg-gradient-to-r from-red-500/[0.10] to-transparent')
            : isBig
              ? (t.isBuy ? 'bg-emerald-500/[0.04]' : 'bg-red-500/[0.04]')
              : '';
          return (
            <div
              key={`${t.time}-${i}`}
              className={`relative flex items-center justify-between px-3 py-[2px] text-[11px] font-mono tabular-nums ${bgClass} ${i === 0 ? 'animate-fade-in' : ''}`}
            >
              <span className={`text-[9px] font-bold ${sideColor} w-8`}>{t.isBuy ? 'B' : 'S'}</span>
              <span className={`${sideColor} text-[10px]`}>{t.price >= 100 ? t.price.toFixed(1) : t.price.toFixed(4)}</span>
              <span className={isWhale ? 'text-white font-semibold text-[10px]' : isBig ? 'text-neutral-200 text-[10px]' : 'text-neutral-500 text-[10px]'}>
                {t.quoteQty >= 1e6 ? `$${(t.quoteQty/1e6).toFixed(2)}M` : t.quoteQty >= 1e3 ? `$${(t.quoteQty/1e3).toFixed(0)}K` : `$${t.quoteQty.toFixed(0)}`}
              </span>
              <span className="text-neutral-700 text-[9px] w-8 text-right">
                {formatAge(now - t.time)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
