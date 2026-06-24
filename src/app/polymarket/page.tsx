'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { TrendingUp, RefreshCw, ExternalLink, Search, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import DataFreshness from '@/components/DataFreshness';

/* ── Types ───────────────────────────────────────────────────────── */

interface PredictionMarket {
  id: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  slug?: string;
  url: string;
  yesOdds: number;
  noOdds: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  category: string;
  endDate: string | null;
  traders?: number;
  polyOdds?: number;
  kalshiOdds?: number;
}

interface ApiResponse {
  markets: PredictionMarket[];
  meta: {
    polymarketCount: number;
    kalshiCount: number;
    matchedCount?: number;
    arbCount?: number;
    fetchedAt: number;
    sources: string[];
  };
}

const CATEGORIES = ['All', 'Crypto', 'Politics', 'Sports', 'Science/Tech', 'Other'];
const SOURCES = ['All', 'Polymarket', 'Kalshi'];

/* ── Helpers ─────────────────────────────────────────────────────── */

function fmtVol(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  if (n <= 0) return '—';
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function oddsColor(odds: number): string {
  if (odds >= 0.8) return 'text-emerald-400';
  if (odds >= 0.6) return 'text-emerald-300';
  if (odds >= 0.4) return 'text-yellow-400';
  if (odds >= 0.2) return 'text-orange-400';
  return 'text-red-400';
}

function arbGap(pm: PredictionMarket): number | null {
  if (pm.polyOdds == null || pm.kalshiOdds == null) return null;
  return Math.abs(pm.polyOdds - pm.kalshiOdds);
}

/* ── Market card ─────────────────────────────────────────────────── */

function MarketCard({ m }: { m: PredictionMarket }) {
  const gap = arbGap(m);
  const hasArb = gap != null && gap >= 0.05;
  const yesPct = m.yesOdds * 100;

  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-hub-darker border border-white/[0.06] rounded-xl p-4 hover:border-hub-yellow/30 hover:bg-white/[0.03] transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium leading-snug line-clamp-2 group-hover:text-hub-yellow transition-colors">
            {m.question}
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-neutral-600 group-hover:text-hub-yellow shrink-0 mt-0.5 transition-colors" />
      </div>

      {/* Odds bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-bold ${oddsColor(m.yesOdds)}`}>YES {fmtPct(m.yesOdds)}</span>
          <span className={`text-xs font-bold ${oddsColor(m.noOdds)}`}>NO {fmtPct(m.noOdds)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${yesPct}%`,
              background: yesPct >= 50
                ? `linear-gradient(90deg, rgba(52,211,153,0.7), rgba(52,211,153,0.9))`
                : `linear-gradient(90deg, rgba(248,113,113,0.9), rgba(248,113,113,0.7))`,
            }}
          />
        </div>
      </div>

      {/* Arb opportunity badge */}
      {hasArb && (
        <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-hub-yellow/10 border border-hub-yellow/20 text-[10px] font-bold text-hub-yellow">
          <Activity className="w-2.5 h-2.5" />
          ARB {(gap! * 100).toFixed(1)}% gap · Poly {fmtPct(m.polyOdds!)} vs Kalshi {fmtPct(m.kalshiOdds!)}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-[9px] uppercase tracking-widest text-neutral-600">24h Vol</p>
          <p className="text-xs font-mono font-bold text-neutral-300">{fmtVol(m.volume24h)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest text-neutral-600">Total Vol</p>
          <p className="text-xs font-mono font-bold text-neutral-300">{fmtVol(m.totalVolume)}</p>
        </div>
        {m.liquidity > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-neutral-600">Liquidity</p>
            <p className="text-xs font-mono font-bold text-neutral-300">{fmtVol(m.liquidity)}</p>
          </div>
        )}
        {m.traders != null && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-neutral-600">Traders</p>
            <p className="text-xs font-mono font-bold text-neutral-300">{m.traders.toLocaleString()}</p>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {m.endDate && (
            <span className="text-[10px] text-neutral-600">Ends {fmtDate(m.endDate)}</span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
            m.source === 'polymarket'
              ? 'bg-violet-400/10 text-violet-400'
              : 'bg-emerald-400/10 text-emerald-400'
          }`}>
            {m.source === 'polymarket' ? 'Poly' : 'Kalshi'}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-neutral-500 font-medium">
            {m.category}
          </span>
        </div>
      </div>
    </a>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

type SortKey = 'volume24h' | 'yesOdds' | 'arbGap' | 'endDate';

export default function PredictionMarketsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const [category, setCategory] = useState('All');
  const [source, setSource] = useState('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('volume24h');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/prediction-markets', { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
      setLastFetch(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    let markets = [...data.markets];

    // Filters
    if (category !== 'All') markets = markets.filter(m => m.category === category);
    if (source === 'Polymarket') markets = markets.filter(m => m.source === 'polymarket');
    else if (source === 'Kalshi') markets = markets.filter(m => m.source === 'kalshi');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      markets = markets.filter(m => m.question.toLowerCase().includes(q));
    }

    // Sort
    markets.sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === 'volume24h') { va = a.volume24h; vb = b.volume24h; }
      else if (sortKey === 'yesOdds') { va = a.yesOdds; vb = b.yesOdds; }
      else if (sortKey === 'arbGap') { va = arbGap(a) ?? -1; vb = arbGap(b) ?? -1; }
      else if (sortKey === 'endDate') {
        va = a.endDate ? new Date(a.endDate).getTime() : Infinity;
        vb = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      }
      return sortAsc ? va - vb : vb - va;
    });

    return markets;
  }, [data, category, source, search, sortKey, sortAsc]);

  const arbMarkets = useMemo(
    () => sorted.filter(m => (arbGap(m) ?? 0) >= 0.05).length,
    [sorted],
  );

  function SortBtn({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => handleSort(k)}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          active ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
        }`}
      >
        {label}
        {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main id="main-content" className="text-white max-w-[1100px] mx-auto px-4 sm:px-6 py-6">

        {/* Hero */}
        <header className="mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-hub-yellow/20 to-hub-yellow/[0.04] border border-hub-yellow/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-hub-yellow" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold">Prediction Markets</span>
          </div>
          <h1 className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-white leading-[1.05]">
            <span className="text-hub-yellow">Prediction</span> Markets
          </h1>
          <p className="text-[13px] text-neutral-400 mt-2 max-w-xl leading-relaxed">
            Live odds from Polymarket and Kalshi. Markets highlighted in yellow have a ≥5% price gap between platforms — a potential arb opportunity.
          </p>

          {/* Meta stats */}
          {data && (
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                <span className="text-[9px] uppercase tracking-widest text-neutral-500">Markets</span>
                <span className="text-sm font-bold text-white">{data.markets.length}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                <span className="text-[9px] uppercase tracking-widest text-neutral-500">Cross-listed</span>
                <span className="text-sm font-bold text-white">{data.meta.matchedCount ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                <span className="text-[9px] uppercase tracking-widest text-neutral-500">Arb ≥5%</span>
                <span className="text-sm font-bold text-hub-yellow">{arbMarkets}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07]">
                <span className="text-[9px] uppercase tracking-widest text-neutral-500">Sources</span>
                <span className="text-sm font-bold text-white">{data.meta.sources.join(' + ')}</span>
              </div>
              {lastFetch && (
                <div className="flex items-center">
                  <DataFreshness exchangeCount={data.meta.sources.length} lastUpdated={lastFetch} />
                </div>
              )}
              <button
                onClick={fetchData}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </header>

        {/* Arb context — cross-platform arb is genuinely rare (the venues
            mostly list different events; where they overlap the odds tend
            to agree). Explain the zero state so it reads as intentional,
            not broken. */}
        {data && !loading && !error && arbMarkets === 0 && (
          <div className="mb-5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-neutral-400">
            {(data.meta.matchedCount ?? 0) > 0 ? (
              <>
                <span className="text-neutral-200 font-semibold">No ≥5% arb right now.</span>{' '}
                {data.meta.matchedCount} market{(data.meta.matchedCount ?? 0) === 1 ? ' is' : 's are'} listed on
                both Polymarket and Kalshi, and their odds currently agree. A gap opens here whenever the two
                venues diverge — these are efficient markets, so it doesn&apos;t happen often.
              </>
            ) : (
              <>
                <span className="text-neutral-200 font-semibold">No cross-listed markets right now.</span>{' '}
                Polymarket and Kalshi are tracking mostly different events at the moment, so there&apos;s no
                shared market to compare. Both feeds are live below — cross-platform arb appears here once their
                coverage overlaps.
              </>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search markets…"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-hub-yellow/50"
            />
          </div>

          {/* Category */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  category === c ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Source */}
          <div className="flex gap-1.5">
            {SOURCES.map(s => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  source === s ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-widest text-neutral-600 font-semibold">Sort by</span>
          <SortBtn label="Volume" k="volume24h" />
          <SortBtn label="Yes odds" k="yesOdds" />
          <SortBtn label="Arb gap" k="arbGap" />
          <SortBtn label="Ends" k="endDate" />
          <span className="ml-auto text-xs text-neutral-500">{sorted.length} markets</span>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-neutral-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading prediction markets…
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchData} className="mt-3 text-xs text-neutral-400 hover:text-white underline">
              Retry
            </button>
          </div>
        )}

        {/* Degraded-source banner — one platform's feed failed to load */}
        {!loading && !error && data && data.meta.sources.length === 1 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 text-center text-xs text-amber-400">
            Showing {data.meta.sources[0] === 'polymarket' ? 'Polymarket' : 'Kalshi'} only —
            {' '}{data.meta.sources[0] === 'polymarket' ? 'Kalshi' : 'Polymarket'} data is temporarily unavailable.
            Cross-platform arb gaps won&apos;t show until both feeds recover.
          </div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="text-center py-16 text-neutral-500">
            {data && data.meta.sources.length === 0
              ? 'Both Polymarket and Kalshi are temporarily unavailable. Try again shortly.'
              : 'No markets match your filters.'}
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map(m => <MarketCard key={m.id} m={m} />)}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-neutral-700 mt-8 text-center leading-relaxed">
          Data from Polymarket and Kalshi. Not financial advice.
          Odds represent market consensus, not guaranteed outcomes.
          Trading prediction markets may be restricted in your jurisdiction.
        </p>
      </main>
      <Footer />
    </div>
  );
}
