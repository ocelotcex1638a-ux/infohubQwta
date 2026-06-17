'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Trophy, RefreshCw, ExternalLink, AlertCircle, ArrowLeft, Download } from 'lucide-react';

type TraderTier = 'A' | 'B' | 'C' | 'Watch';
type TraderType = 'scalper' | 'day' | 'swing' | 'hodler' | 'algo' | 'dca-heavy';

interface AssetBreakdownRow {
  symbol: string;
  realizedPnlUsd: number;
  volumeUsd: number;
  closingTrades: number;
  wins: number;
  winRatePct: number | null;
}

interface SmartMoneyEntry {
  rank: number;
  address: string;
  label: string;
  accountValueUsd: number;
  allTimePnlUsd: number;
  allTimeRoiPct: number;
  realised90dUsd: number;
  realised30dUsd: number;
  closingTrades90d: number;
  winRatePct: number | null;
  biggestWinUsd: number;
  biggestLossUsd: number;
  topSymbols: string[];
  lastTradeTs: number | null;
  daysSinceLastTrade: number | null;
  tier: TraderTier;
  traderType: TraderType;
  signalScore: number;
  rr: number | null;
  maxDrawdownUsd: number;
  maxDrawdownPct: number | null;
  assetBreakdown: AssetBreakdownRow[];
}

interface ApiResponse {
  ts: number;
  entries: SmartMoneyEntry[];
  scanned: number;
  lookbackDays: number;
}

const TIER_TONE: Record<TraderTier, string> = {
  A: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  B: 'bg-sky-500/15 text-sky-300 border border-sky-400/30',
  C: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
  Watch: 'bg-white/5 text-neutral-300 border border-white/10',
};

const TRADER_TYPES: Array<'all' | TraderType> = ['all', 'scalper', 'day', 'swing', 'hodler', 'algo', 'dca-heavy'];
const TIER_FILTERS: Array<'all' | TraderTier> = ['all', 'A', 'B', 'C', 'Watch'];

const fmtUsd = (n: number): string => {
  if (!Number.isFinite(n)) return '--';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtUsdSign = (n: number) => `${n >= 0 ? '+' : ''}${fmtUsd(n)}`;
const fmtPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '--');
const truncAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function activityBadge(days: number | null): string {
  if (days == null) return 'inactive';
  if (days < 1) return 'today';
  if (days < 3) return 'active';
  if (days < 7) return 'this week';
  if (days < 30) return 'this month';
  return 'stale';
}

function formatTraderType(type: TraderType): string {
  return type.replace('-', ' ');
}

export default function SmartMoneyLeaderboardPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(50);
  const [lookback, setLookback] = useState(90);
  const [tierFilter, setTierFilter] = useState<'all' | TraderTier>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TraderType>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/smart-money/leaderboard?topN=${topN}&lookbackDays=${lookback}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = setInterval(load, 60_000);
    return () => clearInterval(intervalId);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [topN, lookback]);

  const visibleEntries = useMemo(() => {
    if (!data) return [];
    return data.entries.filter((entry) => {
      if (tierFilter !== 'all' && entry.tier !== tierFilter) return false;
      if (typeFilter !== 'all' && entry.traderType !== typeFilter) return false;
      return true;
    });
  }, [data, tierFilter, typeFilter]);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <Link href="/smart-money" className="text-[11px] text-neutral-500 hover:text-hub-yellow inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> back to smart-money overview
        </Link>

        <PageHero
          icon={Trophy}
          eyebrow="Live signal ranking"
          title="Top trader"
          accentNoun="leaderboard"
          accent="orange"
          description={
            <>
              Rank Hyperliquid wallets by signal usefulness, not just raw PnL. We combine realised performance, win rate,
              sample size, risk-reward, drawdown, and trader style so you can find wallets worth studying and export
              their closed trades directly.
            </>
          }
          actions={
            <>
              <Link href="/smart-money/confluence" className="text-xs text-neutral-500 hover:text-hub-yellow">
                confluence
              </Link>
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-hub-yellow disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> refresh
              </button>
            </>
          }
        />

        <div className="grid gap-3 md:grid-cols-3 mb-4">
          <div className="card-premium p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Signal quality first</div>
            <div className="text-sm text-neutral-200">
              Score wallets on WR, RR, sample size, realised PnL, and max drawdown so the board surfaces useful traders,
              not just lucky outliers.
            </div>
          </div>
          <div className="card-premium p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Per-asset performance</div>
            <div className="text-sm text-neutral-200">
              See each wallet&apos;s strongest asset contribution at a glance to find BTC specialists, ETH short traders,
              and genuine edge by market.
            </div>
          </div>
          <div className="card-premium p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Export and API</div>
            <div className="text-sm text-neutral-200">
              Every row links to a closed-trade CSV export for downstream wallet analysis, AI workflows, or internal
              scoring models.
            </div>
          </div>
        </div>

        <div className="card-premium p-4 mb-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Top:</span>
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  topN === n ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}

            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium ml-2">Lookback:</span>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setLookback(d)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  lookback === d ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Tier:</span>
            {TIER_FILTERS.map((tier) => (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  tierFilter === tier ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Type:</span>
            {TRADER_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`text-[11px] px-2 py-1 rounded font-medium capitalize ${
                  typeFilter === type ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {type === 'all' ? 'all' : formatTraderType(type)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="card-premium p-4 border border-red-400/30 bg-red-500/5 text-sm text-red-300 mb-4 inline-flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!data && !error && (
          <div className="card-premium p-8 text-center text-neutral-500 text-sm">
            Computing leaderboard... this can take 5-15s on a cold cache while we fetch each wallet&apos;s recent fills.
          </div>
        )}

        {data && visibleEntries.length > 0 && (
          <div className="card-premium overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]">
                <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Wallet</th>
                  <th className="text-right px-2 py-2 font-medium">Score</th>
                  <th className="text-left px-2 py-2 font-medium">Tier / Type</th>
                  <th className="text-right px-2 py-2 font-medium">Realised {lookback}d</th>
                  <th className="text-right px-2 py-2 font-medium">WR</th>
                  <th className="text-right px-2 py-2 font-medium">RR</th>
                  <th className="text-right px-2 py-2 font-medium">MDD</th>
                  <th className="text-right px-2 py-2 font-medium">Closes</th>
                  <th className="text-left px-2 py-2 font-medium">Best asset</th>
                  <th className="text-right px-2 py-2 font-medium">Last seen</th>
                  <th className="text-right px-3 py-2 font-medium">Export</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => {
                  const bestAsset = entry.assetBreakdown[0];
                  return (
                    <tr key={entry.address} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 text-neutral-500 tabular-nums">{entry.rank}</td>
                      <td className="px-2 py-2">
                        <Link href={`/trader/${entry.address}`} className="text-white hover:text-hub-yellow font-mono inline-flex items-center gap-1">
                          {entry.label === entry.address || entry.label.startsWith('0x') ? truncAddr(entry.address) : entry.label}
                          <ExternalLink className="w-2.5 h-2.5 opacity-40" />
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-white font-semibold">{entry.signalScore}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TIER_TONE[entry.tier]}`}>
                            Tier {entry.tier}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] text-neutral-300 bg-white/[0.04] border border-white/[0.08] capitalize">
                            {formatTraderType(entry.traderType)}
                          </span>
                        </div>
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums font-bold ${entry.realised90dUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtUsdSign(entry.realised90dUsd)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-300">
                        {entry.winRatePct == null ? '--' : fmtPct(entry.winRatePct)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-300">
                        {entry.rr == null ? '--' : `${entry.rr.toFixed(2)}x`}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-red-300">
                        {fmtUsd(entry.maxDrawdownUsd)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-neutral-400">{entry.closingTrades90d}</td>
                      <td className="px-2 py-2 text-[11px] text-neutral-300">
                        {bestAsset ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-white">{bestAsset.symbol}</div>
                            <div className={bestAsset.realizedPnlUsd >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
                              {fmtUsdSign(bestAsset.realizedPnlUsd)}
                            </div>
                            <div className="text-neutral-500">{bestAsset.closingTrades} closes</div>
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-[11px] text-neutral-500 whitespace-nowrap">
                        {activityBadge(entry.daysSinceLastTrade)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <a
                          href={`/api/trader/${entry.address}/closed-trades?days=${lookback}&format=csv`}
                          className="inline-flex items-center gap-1 text-neutral-300 hover:text-hub-yellow"
                        >
                          <Download className="w-3 h-3" />
                          csv
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && visibleEntries.length === 0 && !error && (
          <div className="card-premium p-8 text-center text-neutral-500 text-sm">
            No traders match the current tier and type filters.
          </div>
        )}

        {data && (
          <div className="text-center mt-4 text-[10px] text-neutral-600">
            Last refresh: {new Date(data.ts).toLocaleTimeString()} | scanned {data.scanned} top wallets | cached 30 min
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
