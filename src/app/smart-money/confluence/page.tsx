'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { ArrowLeft, Radar, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';

type TraderTier = 'A' | 'B' | 'C' | 'Watch';
type TraderType = 'scalper' | 'day' | 'swing' | 'hodler' | 'algo' | 'dca-heavy';

interface ConfluenceTraderRow {
  address: string;
  label: string;
  tier: TraderTier;
  traderType: TraderType;
  signalScore: number;
  sizeUsd: number;
  leverage: number | null;
  unrealizedPnlUsd: number;
  specialist: boolean;
  bestAsset: string | null;
  bestAssetPnlUsd: number | null;
}

interface ConfluenceSignal {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  confluenceScore: number;
  walletCount: number;
  specialistCount: number;
  totalNotionalUsd: number;
  avgSignalScore: number;
  avgLeverage: number | null;
  netUnrealizedPnlUsd: number;
  tierCounts: Record<TraderTier, number>;
  traderTypeCounts: Partial<Record<TraderType, number>>;
  traders: ConfluenceTraderRow[];
}

interface ApiResponse {
  ts: number;
  scanned: number;
  lookbackDays: number;
  walletsConsidered: number;
  minTier: TraderTier;
  minWallets: number;
  assetFilter: string | null;
  availableSymbols: string[];
  signals: ConfluenceSignal[];
}

const SIDE_TONE = {
  long: 'text-emerald-300 bg-emerald-500/10 border border-emerald-400/20',
  short: 'text-red-300 bg-red-500/10 border border-red-400/20',
};

const TIER_TONE: Record<TraderTier, string> = {
  A: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  B: 'bg-sky-500/15 text-sky-300 border border-sky-400/30',
  C: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
  Watch: 'bg-white/5 text-neutral-300 border border-white/10',
};

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

function formatTraderType(type: TraderType): string {
  return type.replace('-', ' ');
}

export default function SmartMoneyConfluencePage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(50);
  const [lookback, setLookback] = useState(90);
  const [minTier, setMinTier] = useState<TraderTier>('B');
  const [minWallets, setMinWallets] = useState(2);
  const [assetFilter, setAssetFilter] = useState<'all' | string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        topN: String(topN),
        lookbackDays: String(lookback),
        minTier,
        minWallets: String(minWallets),
      });
      if (assetFilter !== 'all') params.set('asset', assetFilter);
      const res = await fetch(`/api/smart-money/confluence?${params.toString()}`, {
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
  }, [topN, lookback, minTier, minWallets, assetFilter]);

  const strongest = useMemo(() => data?.signals.slice(0, 12) ?? [], [data]);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        <Link href="/smart-money" className="text-[11px] text-neutral-500 hover:text-hub-yellow inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> back to smart-money overview
        </Link>

        <PageHero
          icon={Radar}
          eyebrow="Confluence monitor"
          title="Trader"
          accentNoun="confluence"
          accent="emerald"
          description={
            <>
              Surface live agreement across top-tier Hyperliquid traders. We group current positions by asset and side,
              then rank clusters by wallet count, specialist overlap, signal score, and notional conviction.
              Filter to BTC, ETH, HYPE, or any other active asset when you want a cleaner directional read.
            </>
          }
          actions={
            <>
              <Link href="/smart-money/leaderboard" className="text-xs text-neutral-500 hover:text-hub-yellow">
                leaderboard
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

        <div className="card-premium p-4 mb-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Wallets:</span>
            {[30, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  topN === n ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                top {n}
              </button>
            ))}

            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium ml-2">Lookback:</span>
            {[30, 90].map((d) => (
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
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Min tier:</span>
            {(['A', 'B', 'C'] as TraderTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => setMinTier(tier)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  minTier === tier ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {tier}
              </button>
            ))}

            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium ml-2">Min wallets:</span>
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                onClick={() => setMinWallets(count)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  minWallets === count ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {count}+
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Asset:</span>
            <button
              onClick={() => setAssetFilter('all')}
              className={`text-[11px] px-2 py-1 rounded font-medium ${
                assetFilter === 'all' ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
              }`}
            >
              all
            </button>
            {(data?.availableSymbols ?? []).slice(0, 12).map((symbol) => (
              <button
                key={symbol}
                onClick={() => setAssetFilter(symbol)}
                className={`text-[11px] px-2 py-1 rounded font-medium ${
                  assetFilter === symbol ? 'bg-hub-yellow text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                }`}
              >
                {symbol}
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
            Building live confluence clusters... this can take 5-15s on a cold cache.
          </div>
        )}

        {data && (
          <div className="grid gap-3 md:grid-cols-4 mb-4">
            <div className="card-premium p-4">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Signals</div>
              <div className="text-2xl font-bold text-white">{data.signals.length}</div>
            </div>
            <div className="card-premium p-4">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Wallets considered</div>
              <div className="text-2xl font-bold text-white">{data.walletsConsidered}</div>
            </div>
            <div className="card-premium p-4">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Tier floor</div>
              <div className="text-2xl font-bold text-white">{data.minTier}</div>
            </div>
            <div className="card-premium p-4">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Shared entry threshold</div>
              <div className="text-2xl font-bold text-white">{data.minWallets}+</div>
            </div>
            <div className="card-premium p-4 md:col-span-4">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Asset scope</div>
              <div className="text-sm text-white">{data.assetFilter ?? 'All active assets'}</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {data.availableSymbols.length} active symbols available in the current wallet set
              </div>
            </div>
          </div>
        )}

        {data && strongest.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {strongest.map((signal) => (
              <section key={signal.id} className="card-premium p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-lg font-bold text-white">{signal.symbol}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${SIDE_TONE[signal.side]}`}>
                        {signal.side}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] border border-white/[0.08] text-neutral-300">
                        score {signal.confluenceScore}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-400">
                      {signal.walletCount} top-tier traders aligned, {signal.specialistCount} of them strongest in {signal.symbol}.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">{fmtUsd(signal.totalNotionalUsd)}</div>
                    <div className="text-[11px] text-neutral-500">visible notional</div>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-4 mb-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Avg signal</div>
                    <div className="text-sm font-bold text-white">{signal.avgSignalScore}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Avg leverage</div>
                    <div className="text-sm font-bold text-white">{signal.avgLeverage == null ? '--' : `${signal.avgLeverage.toFixed(1)}x`}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Net uPnL</div>
                    <div className={`text-sm font-bold ${signal.netUnrealizedPnlUsd >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {fmtUsdSign(signal.netUnrealizedPnlUsd)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Tier mix</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(['A', 'B', 'C'] as TraderTier[]).map((tier) => (
                        <span key={tier} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIER_TONE[tier]}`}>
                          {tier} {signal.tierCounts[tier]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {signal.traders.map((trader) => (
                    <div key={`${signal.id}-${trader.address}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/trader/${trader.address}`} className="inline-flex items-center gap-1 text-white hover:text-hub-yellow">
                            <span className="font-semibold truncate">{trader.label}</span>
                            <ExternalLink className="w-3 h-3 opacity-40" />
                          </Link>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIER_TONE[trader.tier]}`}>
                              Tier {trader.tier}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] text-neutral-300 bg-white/[0.04] border border-white/[0.08] capitalize">
                              {formatTraderType(trader.traderType)}
                            </span>
                            {trader.specialist && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-400/20">
                                specialist
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">{fmtUsd(trader.sizeUsd)}</div>
                          <div className="text-[10px] text-neutral-500">
                            score {trader.signalScore}{trader.leverage != null ? ` | ${trader.leverage.toFixed(1)}x` : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {data && strongest.length === 0 && !error && (
          <div className="card-premium p-8 text-center text-neutral-500 text-sm">
            No confluence clusters match the current tier, wallet-count, and asset filters.
          </div>
        )}

        {data && (
          <div className="text-center mt-4 text-[10px] text-neutral-600">
            Last refresh: {new Date(data.ts).toLocaleTimeString()} | scanned {data.scanned} leaderboard wallets
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
