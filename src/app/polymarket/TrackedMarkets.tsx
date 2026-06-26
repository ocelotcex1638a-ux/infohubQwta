'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, ExternalLink, RefreshCw, ArrowLeftRight } from 'lucide-react';

/* Mirror of TrackedPair in lib/prediction-arb (kept local so the client
   bundle doesn't pull the server module). */
interface TrackedPair {
  id: string;
  topic: 'crypto' | 'fed';
  label: string;
  subLabel: string;
  polyOdds: number;
  kalshiOdds: number;
  gap: number;
  polyUrl: string;
  kalshiUrl: string;
  note?: string;
}

interface TrackedArbResponse {
  pairs: TrackedPair[];
  meta: { cryptoCount: number; fedCount: number; arbCount: number; fetchedAt: number; sources: string[] };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function gapTone(gap: number): string {
  if (gap >= 0.05) return 'text-hub-yellow border-hub-yellow/30 bg-hub-yellow/10';
  if (gap >= 0.02) return 'text-amber-300/80 border-amber-300/15 bg-amber-300/5';
  return 'text-neutral-500 border-white/[0.06] bg-white/[0.02]';
}

function PairRow({ p }: { p: TrackedPair }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-hub-darker p-3.5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
              {p.topic === 'crypto' ? 'Crypto' : 'Fed'}
            </span>
            <span className="text-sm font-semibold text-white truncate">{p.label}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">{p.subLabel}</div>
        </div>
        <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-lg border ${gapTone(p.gap)}`}>
          {p.gap >= 0.05 ? `+${pct(p.gap)} gap` : pct(p.gap)}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[13px]">
        <a
          href={p.polyUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 hover:border-sky-400/30 group"
        >
          <span className="text-[11px] text-neutral-500 group-hover:text-sky-300">Polymarket</span>
          <span className="font-bold text-white tabular-nums">{pct(p.polyOdds)}</span>
        </a>
        <ArrowLeftRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
        <a
          href={p.kalshiUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 hover:border-emerald-400/30 group"
        >
          <span className="text-[11px] text-neutral-500 group-hover:text-emerald-300">Kalshi</span>
          <span className="font-bold text-white tabular-nums">{pct(p.kalshiOdds)}</span>
        </a>
      </div>

      {p.note && <div className="text-[10px] text-neutral-600 mt-2 leading-relaxed">{p.note}</div>}
    </div>
  );
}

export default function TrackedMarkets() {
  const [data, setData] = useState<TrackedArbResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/prediction-arb', { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Hide the whole section only on a hard failure with nothing to show —
  // otherwise always render so users see the curated board exists.
  if (error && !data) return null;

  const pairs = data?.pairs ?? [];
  const arbCount = data?.meta.arbCount ?? 0;

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400/15 to-emerald-400/[0.03] border border-emerald-400/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Tracked Markets</h2>
            <p className="text-[11px] text-neutral-500">Same contract on both venues — matched on strike/date (crypto) and meeting/move (Fed)</p>
          </div>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-neutral-500 hover:text-white transition-colors" aria-label="Refresh tracked markets">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Honest framing — these are efficient markets, gaps are usually small */}
      <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed max-w-2xl">
        {arbCount > 0
          ? <>Markets listed on <span className="text-sky-300">Polymarket</span> and <span className="text-emerald-300">Kalshi</span> for the exact same outcome. <span className="text-hub-yellow font-semibold">{arbCount}</span> currently show a ≥5% gap — these are efficient markets, so a real edge is rare and often reflects different settlement times.</>
          : <>Markets listed on <span className="text-sky-300">Polymarket</span> and <span className="text-emerald-300">Kalshi</span> for the exact same outcome. No ≥5% gaps right now — the venues agree, which is the normal state for these liquid markets.</>}
      </p>

      {loading && !data ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-xl border border-white/[0.05] bg-white/[0.015] animate-pulse" />
          ))}
        </div>
      ) : pairs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[12px] text-neutral-500">
          No tracked markets are live on both venues right now. They reappear as Kalshi and Polymarket relist
          the daily crypto strikes and the next FOMC meeting.
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {pairs.map(p => <PairRow key={p.id} p={p} />)}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-neutral-600">
        <ExternalLink className="w-3 h-3" />
        Tap either side to open the live market. Not financial advice.
      </div>
    </section>
  );
}
