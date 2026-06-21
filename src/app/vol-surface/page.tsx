'use client';

import { useState, useMemo, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useApi } from '@/hooks/useSWRApi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { RefreshCw, Activity } from 'lucide-react';
import { SkeletonBlock, SkeletonTable } from '@/components/Skeleton';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TermPoint {
  expiry: string;
  expiryDate: string;
  dte: number;
  atmIv: number;
  skew25d: number;
  callIvAvg: number;
  putIvAvg: number;
  callOi: number;
  putOi: number;
  maxPain: number | null;
}

interface HeatCell {
  moneyness: number;
  callIv: number;
  putIv: number;
  avgIv: number;
}

interface HeatRow {
  expiry: string;
  dte: number;
  cells: HeatCell[];
}

interface SurfaceData {
  currency: string;
  underlying: number;
  termStructure: TermPoint[];
  heatmap: HeatRow[];
  summary: {
    atmIv30d: number | null;
    skew25d30d: number | null;
    termSlope: number | null;
    putCallRatio: number;
  };
}

// ── Moneyness labels ───────────────────────────────────────────────────────────

const MONEYNESS_LABELS: Record<number, string> = {
  0.60: '60%', 0.70: '70%', 0.75: '75%', 0.80: '80%', 0.85: '85%',
  0.90: '90%', 0.95: '95%', 1.00: 'ATM', 1.05: '105%', 1.10: '110%',
  1.15: '115%', 1.20: '120%', 1.30: '130%', 1.40: '140%', 1.50: '150%',
};

// ── IV → color mapping (low=blue, mid=green/yellow, high=red) ─────────────────

function ivToHsl(iv: number): string {
  if (iv <= 0) return 'rgba(255,255,255,0.04)';
  // typical range: 20–120 IV
  const t = Math.min(1, Math.max(0, (iv - 20) / 100));
  // hue: 240 (blue) → 120 (green) → 60 (yellow) → 0 (red)
  const hue = Math.round(240 - t * 240);
  const sat = 70;
  const light = 35 + t * 10;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function ivToTextColor(iv: number): string {
  if (iv <= 0) return 'text-neutral-600';
  if (iv < 40) return 'text-sky-300';
  if (iv < 70) return 'text-emerald-300';
  if (iv < 100) return 'text-amber-300';
  return 'text-red-400';
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className={`text-lg font-bold font-mono ${tone || 'text-white'}`}>{value}</span>
      {sub && <span className="text-[11px] text-neutral-500">{sub}</span>}
    </div>
  );
}

// ── Custom tooltip for charts ─────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.12] bg-hub-black/90 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-neutral-300 mb-1">{label}d</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-neutral-400">{p.name}:</span>
          <span className="font-mono text-white">{Number(p.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VolSurfacePage() {
  const [currency, setCurrency] = useState<'BTC' | 'ETH'>('BTC');
  const [heatmapMode, setHeatmapMode] = useState<'avg' | 'call' | 'put'>('avg');

  const fetcher = useCallback(
    () => fetch(`/api/vol-surface?currency=${currency}`).then((r) => r.json()),
    [currency],
  );

  const { data, isLoading, lastUpdate, refresh } = useApi<SurfaceData>({
    key: `vol-surface-${currency}`,
    fetcher,
    refreshInterval: 90_000,
  });

  const ivMin = useMemo(() => {
    if (!data?.heatmap) return 0;
    let min = Infinity;
    for (const row of data.heatmap) {
      for (const cell of row.cells) {
        const v = cell[heatmapMode === 'avg' ? 'avgIv' : heatmapMode === 'call' ? 'callIv' : 'putIv'];
        if (v > 0 && v < min) min = v;
      }
    }
    return min === Infinity ? 20 : min;
  }, [data, heatmapMode]);

  const ivMax = useMemo(() => {
    if (!data?.heatmap) return 100;
    let max = 0;
    for (const row of data.heatmap) {
      for (const cell of row.cells) {
        const v = cell[heatmapMode === 'avg' ? 'avgIv' : heatmapMode === 'call' ? 'callIv' : 'putIv'];
        if (v > max) max = v;
      }
    }
    return max || 100;
  }, [data, heatmapMode]);

  const termChartData = useMemo(
    () => data?.termStructure.map((t) => ({
      dte: t.dte,
      label: t.expiry,
      ATM: t.atmIv,
      Call: t.callIvAvg,
      Put: t.putIvAvg,
    })) ?? [],
    [data],
  );

  const skewChartData = useMemo(
    () => data?.termStructure.map((t) => ({
      dte: t.dte,
      label: t.expiry,
      Skew: Number(t.skew25d.toFixed(2)),
    })) ?? [],
    [data],
  );

  const s = data?.summary;
  const moneynessBuckets = data?.heatmap[0]?.cells.map((c) => c.moneyness) ?? [];

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 py-6">

        {/* ── Title bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-violet-400" />
              <h1 className="text-xl font-bold text-white">Vol Surface</h1>
            </div>
            <p className="text-sm text-neutral-400">
              Deribit implied volatility — term structure, 25-delta skew &amp; moneyness heatmap
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[11px] text-neutral-500">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            {/* Currency toggle */}
            {(['BTC', 'ETH'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                  currency === c
                    ? 'border-violet-500/60 bg-violet-500/20 text-violet-300'
                    : 'border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={refresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs text-neutral-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Summary stats ── */}
        {s && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <Stat
              label="ATM IV 30d"
              value={s.atmIv30d !== null ? `${s.atmIv30d.toFixed(1)}%` : '—'}
              sub="Deribit, nearest to 30d"
              tone={s.atmIv30d && s.atmIv30d > 80 ? 'text-amber-400' : 'text-white'}
            />
            <Stat
              label="25Δ Skew 30d"
              value={s.skew25d30d !== null ? `${s.skew25d30d > 0 ? '+' : ''}${s.skew25d30d.toFixed(1)}%` : '—'}
              sub={s.skew25d30d !== null ? (s.skew25d30d > 0 ? 'Bearish tilt (puts bid)' : 'Bullish tilt (calls bid)') : ''}
              tone={s.skew25d30d !== null && s.skew25d30d > 5 ? 'text-red-400' : s.skew25d30d !== null && s.skew25d30d < -5 ? 'text-emerald-400' : 'text-white'}
            />
            <Stat
              label="Term Slope"
              value={s.termSlope !== null ? `${s.termSlope > 0 ? '+' : ''}${s.termSlope.toFixed(1)}%` : '—'}
              sub={s.termSlope !== null ? (s.termSlope > 0 ? 'Backwardation (panic)' : 'Contango (calm)') : ''}
              tone={s.termSlope !== null && s.termSlope > 10 ? 'text-red-400' : s.termSlope !== null && s.termSlope < -5 ? 'text-sky-400' : 'text-white'}
            />
            <Stat
              label="P/C OI Ratio"
              value={s.putCallRatio > 0 ? s.putCallRatio.toFixed(3) : '—'}
              sub={s.putCallRatio > 0 ? (s.putCallRatio > 1 ? 'Puts dominate' : 'Calls dominate') : ''}
              tone={s.putCallRatio > 1.3 ? 'text-red-400' : s.putCallRatio < 0.7 ? 'text-emerald-400' : 'text-white'}
            />
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {isLoading && !data && (
          <div className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <SkeletonBlock height="h-64" />
              <SkeletonBlock height="h-64" />
            </div>
            <SkeletonBlock height="h-52" />
            <SkeletonTable rows={6} cols={8} />
          </div>
        )}

        {data && (
          <>
            {/* ── Charts row ── */}
            <div className="grid lg:grid-cols-2 gap-4 mb-6">

              {/* Term structure */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-xs font-semibold text-neutral-300 mb-3">IV Term Structure</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={termChartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="dte"
                      tick={{ fontSize: 10, fill: '#737373' }}
                      tickFormatter={(v) => `${v}d`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#737373' }}
                      tickFormatter={(v) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 10, color: '#737373', paddingTop: 8 }}
                      iconSize={8}
                    />
                    <Line type="monotone" dataKey="ATM" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Call" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    <Line type="monotone" dataKey="Put" stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 25-delta skew */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="text-xs font-semibold text-neutral-300 mb-1">25Δ Skew by Expiry</div>
                <div className="text-[11px] text-neutral-500 mb-3">Positive = puts bid (bearish). Negative = calls bid (bullish).</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={skewChartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="dte"
                      tick={{ fontSize: 10, fill: '#737373' }}
                      tickFormatter={(v) => `${v}d`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#737373' }}
                      tickFormatter={(v) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                    <Bar
                      dataKey="Skew"
                      radius={[3, 3, 0, 0]}
                      fill="#a78bfa"
                      label={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── IV Heatmap ── */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 mb-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs font-semibold text-neutral-300">IV Surface — Moneyness × Expiry</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">Implied volatility % — lower DTE rows at top</div>
                </div>
                <div className="flex items-center gap-1">
                  {(['avg', 'call', 'put'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setHeatmapMode(m)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                        heatmapMode === m
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                          : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* IV legend bar */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-neutral-500">Low IV</span>
                <div className="flex-1 max-w-[200px] h-2 rounded-full" style={{
                  background: 'linear-gradient(to right, hsl(240,70%,35%), hsl(120,70%,35%), hsl(60,70%,40%), hsl(0,70%,40%))',
                }} />
                <span className="text-[10px] text-neutral-500">High IV</span>
                <span className="text-[10px] text-neutral-500 ml-2">
                  {ivMin.toFixed(0)}% → {ivMax.toFixed(0)}%
                </span>
              </div>

              <div className="min-w-[700px]">
                {/* Header row */}
                <div className="flex gap-0.5 mb-0.5">
                  <div className="w-20 shrink-0 text-[10px] text-neutral-500 text-right pr-2">DTE</div>
                  {moneynessBuckets.map((m) => (
                    <div
                      key={m}
                      className={`flex-1 text-center text-[10px] font-mono ${m === 1.00 ? 'text-violet-400 font-bold' : 'text-neutral-500'}`}
                    >
                      {MONEYNESS_LABELS[m] ?? `${(m * 100).toFixed(0)}%`}
                    </div>
                  ))}
                </div>

                {/* Data rows */}
                {data.heatmap.map((row) => (
                  <div key={row.expiry} className="flex gap-0.5 mb-0.5">
                    <div className="w-20 shrink-0 text-right pr-2 self-center">
                      <span className="text-[10px] font-mono text-neutral-400">{row.expiry}</span>
                      <span className="ml-1 text-[9px] text-neutral-600">{row.dte}d</span>
                    </div>
                    {row.cells.map((cell) => {
                      const iv = heatmapMode === 'avg' ? cell.avgIv : heatmapMode === 'call' ? cell.callIv : cell.putIv;
                      return (
                        <div
                          key={cell.moneyness}
                          className="flex-1 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono font-bold transition-transform hover:scale-105 hover:z-10 relative"
                          style={{ background: ivToHsl(iv) }}
                          title={`${row.expiry} × ${MONEYNESS_LABELS[cell.moneyness] ?? cell.moneyness} — IV: ${iv.toFixed(1)}%`}
                        >
                          {iv > 0 ? (
                            <span className={ivToTextColor(iv)}>{iv.toFixed(0)}</span>
                          ) : (
                            <span className="text-neutral-700">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Expiry table ── */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-semibold text-neutral-300">Expiry breakdown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Expiry', 'DTE', 'ATM IV', 'Call IV', 'Put IV', 'Skew 25Δ', 'P/C OI', 'Max Pain'].map((h) => (
                        <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold text-neutral-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.termStructure.map((t) => (
                      <tr key={t.expiry} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 font-semibold text-white">{t.expiry}</td>
                        <td className="py-2.5 px-3 font-mono text-neutral-400">{t.dte}d</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-violet-300">{t.atmIv.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400">{t.callIvAvg.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 font-mono text-red-400">{t.putIvAvg.toFixed(1)}%</td>
                        <td className={`py-2.5 px-3 font-mono font-semibold ${t.skew25d > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {t.skew25d > 0 ? '+' : ''}{t.skew25d.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-400">
                          {t.callOi + t.putOi > 0 ? (t.putOi / Math.max(t.callOi, 1)).toFixed(2) : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-300">
                          {t.maxPain !== null ? `$${(t.maxPain / 1000).toFixed(0)}k` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!isLoading && !data && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
            <p className="text-neutral-500">Could not load vol surface data. Deribit may be temporarily unavailable.</p>
            <button onClick={refresh} className="mt-3 text-xs text-violet-400 hover:text-violet-300">Try again</button>
          </div>
        )}

        <p className="text-[11px] text-neutral-600">
          Data source: Deribit public API · 90s cache · IV values are mark IV, not last-traded IV.
        </p>
      </main>
      <Footer />
    </div>
  );
}
