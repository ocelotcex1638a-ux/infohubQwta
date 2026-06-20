'use client';

import { useState, useMemo } from 'react';
import { useApi } from '@/hooks/useSWRApi';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BookmarkStar from '@/components/BookmarkStar';
import TraderHistoryChart, { type PnlSeries } from '@/components/TraderHistoryChart';
import { useRecordTraderVisit } from '@/hooks/useRecentTraders';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { formatCoverageLabel, formatVenueCoverageDetails } from '@/lib/trader-coverage';
import { computeOpenRiskPct, computeTruePnlUsd, summariseLiveRisk } from '@/lib/trader-risk';
import Link from 'next/link';
import {
  Activity, ExternalLink, Copy, ChevronLeft, Layers, Download,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface GMXPosition {
  marketSymbol: string;
  isLong: boolean;
  sizeUsd: number;
  entryPrice: number;
  livePrice: number;
  unrealizedPnl: number;
  pnlPct: number;
  leverage: number | null;
}

interface GMXDossier {
  address: string;
  summary: {
    realizedPnl: number;
    unrealizedPnl: number;
    volume: number;
    wins: number;
    losses: number;
    totalTrades: number;
    winRate: number;
    maxCapital: number;
    realizedFees: number;
  };
  openPositions: GMXPosition[];
  meta: { chain: string };
}

interface HLPosition {
  coin: string;
  isLong: boolean;
  sizeUsd: number;
  entryPrice: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  roePct: number;
  leverage: number | null;
  leverageType: 'cross' | 'isolated' | null;
}

interface GTradePosition {
  symbol: string;
  isLong: boolean;
  sizeUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  roePct: number;
  leverage: number | null;
  liquidationPrice: number | null;
}

interface GTradeDossier {
  address: string;
  summary: { openCount: number; totalNotional: number; totalUnrealized: number; totalMargin: number };
  openPositions: GTradePosition[];
}

interface HLDossier {
  address: string;
  displayName: string | null;
  summary: {
    accountValue: number;
    totalNotional: number;
    marginUsed: number;
    withdrawable: number;
    unrealizedPnl: number;
    performance: Record<string, { pnl: number; volume: number; roi: number }>;
  };
  openPositions: HLPosition[];
  history: { window: string; pnl: Array<{ t: number; v: number }> } | null;
}

interface GMXSparklines {
  series: Record<string, number[]>;
  days: number;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function fmtUSD(n: number, compact = true): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (!compact) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtSign(n: number) { return `${n >= 0 ? '+' : ''}${fmtUSD(n)}`; }
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function shortAddr(a: string): string { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function coverageTone(label: string): string {
  if (label === 'Cross-platform') return 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/25';
  if (label === 'HL only') return 'bg-purple-500/[0.12] text-purple-300 border-purple-500/25';
  if (label === 'GMX only') return 'bg-blue-500/[0.12] text-blue-300 border-blue-500/25';
  if (label === 'gTrade only') return 'bg-cyan-500/[0.12] text-cyan-300 border-cyan-500/25';
  return 'bg-white/[0.04] text-neutral-300 border-white/[0.08]';
}

const VENUE_COLOR: Record<string, string> = {
  'gmx-arbitrum': '#28a0f0',
  'gmx-avalanche': '#e84142',
  hyperliquid: '#a855f7',
  gtrade: '#22d3ee',
};

const VENUE_LABEL: Record<string, string> = {
  'gmx-arbitrum': 'GMX Arb',
  'gmx-avalanche': 'GMX Avax',
  hyperliquid: 'HL',
  gtrade: 'gTrade',
};

/* ─── Unified live positions table ────────────────────────────────────── */

interface UnifiedPosition {
  venue: string;
  symbol: string;
  isLong: boolean;
  sizeUsd: number;
  entryPrice: number;
  currentPrice: number;
  liquidationPrice: number | null;
  unrealizedPnl: number;
  roePct: number;
  leverage: number | null;
  leverageType?: string | null;
}

function LivePositionsTable({ positions }: { positions: UnifiedPosition[] }) {
  if (positions.length === 0) return null;
  return (
    <div className="card-premium overflow-x-auto">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-hub-border-subtle">
        <span className="eyebrow-pro text-[9px] text-fg-faint">Live positions</span>
        <span className="text-[10px] num text-fg-subtle">{positions.length}</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-hub-secondary/30">
          <tr className="border-b border-hub-border-subtle">
            {['Venue', 'Asset', 'Side', 'Size', 'Entry', 'Mark', 'Liq', 'uPnL', 'ROE'].map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 text-[9px] uppercase tracking-wider text-fg-faint font-bold
                  ${i === 0 ? 'text-left' : i <= 2 ? 'text-left' : 'text-right'}
                  ${h === 'Liq' ? 'hidden lg:table-cell' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const pnlColor = p.unrealizedPnl >= 0 ? 'text-long' : 'text-short';
            const roeColor = p.roePct >= 0 ? 'text-long' : 'text-short';
            const vcolor = VENUE_COLOR[p.venue] ?? '#888';
            return (
              <tr key={i} className="border-b border-hub-border-subtle row-hover last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: vcolor }} />
                    <span className="text-[10px] text-fg-subtle font-medium">{VENUE_LABEL[p.venue] ?? p.venue}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-semibold text-fg-default">{p.symbol}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    p.isLong ? 'bg-long/[0.10] text-long' : 'bg-short/[0.10] text-short'
                  }`}>
                    {p.isLong ? 'Long' : 'Short'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right num">
                  <div className="font-semibold text-fg-default">{fmtUSD(p.sizeUsd)}</div>
                  {p.leverage != null && (
                    <div className="text-[9px] text-hub-yellow/80">
                      {p.leverage.toFixed(1)}×{p.leverageType ? ` ${p.leverageType}` : ''}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right num text-fg-subtle text-[11px]">
                  ${p.entryPrice.toLocaleString('en-US', { maximumFractionDigits: p.entryPrice < 1 ? 4 : 2 })}
                </td>
                <td className="px-3 py-2.5 text-right num text-[11px] text-fg-muted">
                  {p.currentPrice > 0
                    ? `$${p.currentPrice.toLocaleString('en-US', { maximumFractionDigits: p.currentPrice < 1 ? 4 : 2 })}`
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-right num text-[11px] text-short hidden lg:table-cell">
                  {p.liquidationPrice && p.liquidationPrice > 0
                    ? `$${p.liquidationPrice.toLocaleString('en-US', { maximumFractionDigits: p.liquidationPrice < 1 ? 4 : 2 })}`
                    : '—'}
                </td>
                <td className={`px-3 py-2.5 text-right num font-bold text-[12px] ${pnlColor}`}>
                  {fmtSign(p.unrealizedPnl)}
                </td>
                <td className={`px-3 py-2.5 text-right num text-[11px] ${roeColor}`}>
                  {fmtPct(p.roePct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Per-venue stat card (compact) ──────────────────────────────────── */

interface VenueStatCardProps {
  label: string;
  accent: string;
  href?: string | null;
  explorerUrl?: string | null;
  isLoading: boolean;
  hasActivity: boolean;
  stats?: { label: string; value: string; positive?: boolean }[];
  compactWhenEmpty?: boolean;
}

function VenueStatCard({ label, accent, href, explorerUrl, isLoading, hasActivity, stats, compactWhenEmpty }: VenueStatCardProps) {
  if (compactWhenEmpty && !isLoading && !hasActivity) {
    return (
      <div className="card-premium p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
          <span className="text-[11px] text-fg-subtle font-medium">{label}</span>
          <span className="text-[10px] text-fg-faint">no activity</span>
        </div>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-fg-subtle hover:text-hub-yellow inline-flex items-center gap-1">
            View <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
          <span className="text-[12px] font-semibold text-fg-default">{label}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-hub-yellow/70 hover:text-hub-yellow inline-flex items-center gap-1">
              View <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
              className="text-fg-subtle hover:text-fg-default inline-flex items-center gap-1">
              Explorer <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="text-[11px] text-fg-faint text-center py-4 animate-pulse">Loading {label}…</div>
      )}

      {!isLoading && stats && stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map(s => (
            <div key={s.label} className="bg-hub-secondary/50 rounded-lg p-2">
              <div className="text-[9px] text-fg-faint uppercase tracking-wider mb-0.5">{s.label}</div>
              <div className={`num text-[12px] font-semibold ${
                s.positive === true ? 'text-long' : s.positive === false ? 'text-short' : 'text-fg-default'
              }`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !hasActivity && (
        <div className="text-[11px] text-fg-faint text-center py-3">No {label} activity</div>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function TraderUnifiedPage() {
  const params = useParams<{ address: string }>();
  const rawAddress = params?.address || '';
  const address = /^0x[a-fA-F0-9]{40}$/.test(rawAddress) ? rawAddress.toLowerCase() : null;

  const [copied, setCopied] = useState(false);
  const copyAddr = async () => {
    if (!address) return;
    if (await copyToClipboard(address)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const gmxArb = useApi<GMXDossier>({
    key: address ? `trader-gmx-arbitrum-${address}` : null,
    refreshInterval: 60_000,
    fetcher: async () => {
      const res = await fetch(`/api/gmx-traders/${address}?chain=arbitrum`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  const gmxAvax = useApi<GMXDossier>({
    key: address ? `trader-gmx-avalanche-${address}` : null,
    refreshInterval: 60_000,
    fetcher: async () => {
      const res = await fetch(`/api/gmx-traders/${address}?chain=avalanche`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  const hl = useApi<HLDossier>({
    key: address ? `trader-hl-${address}` : null,
    refreshInterval: 60_000,
    fetcher: async () => {
      const res = await fetch(`/api/hl-traders/${address}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  const gtrade = useApi<GTradeDossier>({
    key: address ? `trader-gtrade-${address}` : null,
    refreshInterval: 60_000,
    fetcher: async () => {
      const res = await fetch(`/api/gtrade-traders/${address}`, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  useRecordTraderVisit(address, hl.data?.displayName);

  const gmxArbSpark = useApi<GMXSparklines>({
    key: address ? `spark-arb-${address}` : null,
    fetcher: async () => {
      const res = await fetch(`/api/gmx-traders/sparklines?addresses=${address}&chain=arbitrum&days=30`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  const gmxAvaxSpark = useApi<GMXSparklines>({
    key: address ? `spark-avax-${address}` : null,
    fetcher: async () => {
      const res = await fetch(`/api/gmx-traders/sparklines?addresses=${address}&chain=avalanche&days=30`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
  });

  const chartSeries: PnlSeries[] = useMemo(() => {
    if (!address) return [];
    const out: PnlSeries[] = [];
    const hlPnl = hl.data?.history?.pnl;
    if (Array.isArray(hlPnl) && hlPnl.length >= 2) {
      out.push({ label: 'Hyperliquid', color: '#a855f7', points: hlPnl.map(p => p.v) });
    }
    const arbSeries = gmxArbSpark.data?.series?.[address.toLowerCase()];
    if (Array.isArray(arbSeries) && arbSeries.length >= 2 && arbSeries.some(v => v !== 0)) {
      out.push({ label: 'GMX Arbitrum', color: '#28a0f0', points: arbSeries });
    }
    const avaxSeries = gmxAvaxSpark.data?.series?.[address.toLowerCase()];
    if (Array.isArray(avaxSeries) && avaxSeries.length >= 2 && avaxSeries.some(v => v !== 0)) {
      out.push({ label: 'GMX Avalanche', color: '#e84142', points: avaxSeries });
    }
    return out;
  }, [address, hl.data, gmxArbSpark.data, gmxAvaxSpark.data]);

  const rollup = useMemo(() => {
    const risk = summariseLiveRisk([
      ...(gmxArb.data?.openPositions ?? []).map(p => ({ symbol: p.marketSymbol, sizeUsd: p.sizeUsd, unrealizedPnl: p.unrealizedPnl })),
      ...(gmxAvax.data?.openPositions ?? []).map(p => ({ symbol: p.marketSymbol, sizeUsd: p.sizeUsd, unrealizedPnl: p.unrealizedPnl })),
      ...(hl.data?.openPositions ?? []).map(p => ({ symbol: p.coin, sizeUsd: p.sizeUsd, unrealizedPnl: p.unrealizedPnl })),
      ...(gtrade.data?.openPositions ?? []).map(p => ({ symbol: p.symbol, sizeUsd: p.sizeUsd, unrealizedPnl: p.unrealizedPnl })),
    ]);

    const lifetimeRealized =
      (gmxArb.data?.summary?.realizedPnl ?? 0) +
      (gmxAvax.data?.summary?.realizedPnl ?? 0) +
      (hl.data?.summary?.performance?.allTime?.pnl ?? 0);

    const accountValue = hl.data?.summary?.accountValue ?? 0;
    const withdrawable = hl.data?.summary?.withdrawable ?? 0;
    const truePnl = computeTruePnlUsd(lifetimeRealized, risk.liveUnrealizedPnlUsd);
    const openRiskPct = computeOpenRiskPct(risk.openNotionalUsd, accountValue);

    const totalTrades =
      (gmxArb.data?.summary?.totalTrades ?? 0) +
      (gmxAvax.data?.summary?.totalTrades ?? 0);
    const totalWins =
      (gmxArb.data?.summary?.wins ?? 0) +
      (gmxAvax.data?.summary?.wins ?? 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : null;

    const openPositionCount =
      (gmxArb.data?.openPositions?.length ?? 0) +
      (gmxAvax.data?.openPositions?.length ?? 0) +
      (hl.data?.openPositions?.length ?? 0) +
      (gtrade.data?.openPositions?.length ?? 0);

    const venuesActive = [
      !!gmxArb.data && ((gmxArb.data.openPositions?.length ?? 0) > 0 || (gmxArb.data.summary?.totalTrades ?? 0) > 0),
      !!gmxAvax.data && ((gmxAvax.data.openPositions?.length ?? 0) > 0 || (gmxAvax.data.summary?.totalTrades ?? 0) > 0),
      !!hl.data && ((hl.data.openPositions?.length ?? 0) > 0 || Object.keys(hl.data.summary?.performance ?? {}).length > 0),
      !!gtrade.data && ((gtrade.data.openPositions?.length ?? 0) > 0 || (gtrade.data.summary?.openCount ?? 0) > 0),
    ];
    const venues = [
      ...(venuesActive[0] ? ['gmx-arbitrum'] : []),
      ...(venuesActive[1] ? ['gmx-avalanche'] : []),
      ...(venuesActive[2] ? ['hyperliquid'] : []),
      ...(venuesActive[3] ? ['gtrade'] : []),
    ];

    return {
      openUnrealized: risk.liveUnrealizedPnlUsd,
      openPositiveUnrealized: risk.livePositiveUnrealizedPnlUsd,
      openNegativeUnrealized: risk.liveNegativeUnrealizedPnlUsd,
      openNotional: risk.openNotionalUsd,
      lifetimeRealized,
      accountValue,
      withdrawable,
      truePnl,
      openRiskPct,
      openPositionCount,
      totalTrades,
      winRate,
      venuesActive: venues.length,
      coverageLabel: formatCoverageLabel(venues),
      coverageDetails: formatVenueCoverageDetails(venues),
      activeAssets: risk.activeAssets,
      venues,
    };
  }, [gmxArb.data, gmxAvax.data, hl.data, gtrade.data]);

  /* Unified live positions list (all venues, sorted by |unrealizedPnl|) */
  const livePositions: UnifiedPosition[] = useMemo(() => {
    const out: UnifiedPosition[] = [];
    for (const p of hl.data?.openPositions ?? []) {
      out.push({
        venue: 'hyperliquid', symbol: p.coin, isLong: p.isLong,
        sizeUsd: p.sizeUsd, entryPrice: p.entryPrice, currentPrice: 0,
        liquidationPrice: p.liquidationPrice > 0 ? p.liquidationPrice : null,
        unrealizedPnl: p.unrealizedPnl, roePct: p.roePct,
        leverage: p.leverage, leverageType: p.leverageType,
      });
    }
    for (const p of gmxArb.data?.openPositions ?? []) {
      out.push({
        venue: 'gmx-arbitrum', symbol: p.marketSymbol, isLong: p.isLong,
        sizeUsd: p.sizeUsd, entryPrice: p.entryPrice, currentPrice: p.livePrice,
        liquidationPrice: null, unrealizedPnl: p.unrealizedPnl, roePct: p.pnlPct,
        leverage: p.leverage,
      });
    }
    for (const p of gmxAvax.data?.openPositions ?? []) {
      out.push({
        venue: 'gmx-avalanche', symbol: p.marketSymbol, isLong: p.isLong,
        sizeUsd: p.sizeUsd, entryPrice: p.entryPrice, currentPrice: p.livePrice,
        liquidationPrice: null, unrealizedPnl: p.unrealizedPnl, roePct: p.pnlPct,
        leverage: p.leverage,
      });
    }
    for (const p of gtrade.data?.openPositions ?? []) {
      out.push({
        venue: 'gtrade', symbol: p.symbol, isLong: p.isLong,
        sizeUsd: p.sizeUsd, entryPrice: p.entryPrice, currentPrice: p.markPrice,
        liquidationPrice: p.liquidationPrice, unrealizedPnl: p.unrealizedPnl,
        roePct: p.roePct, leverage: p.leverage,
      });
    }
    return out.sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl));
  }, [hl.data, gmxArb.data, gmxAvax.data, gtrade.data]);

  if (!address) {
    return (
      <div className="min-h-screen bg-hub-black">
        <Header />
        <main className="max-w-[900px] mx-auto w-full px-4 py-10">
          <div className="card-premium p-6 text-center">
            <div className="text-fg-default font-semibold mb-2">Invalid address</div>
            <p className="text-sm text-fg-subtle mb-4">
              This page expects a valid 0x-prefixed 40-character address.
            </p>
            <Link href="/smart-money" className="text-hub-yellow text-xs hover:underline">
              ← Smart Money
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const displayName = hl.data?.displayName ?? null;
  const truePnlColor = rollup.truePnl >= 0 ? 'text-long' : 'text-short';
  const uPnlColor = rollup.openUnrealized >= 0 ? 'text-long' : 'text-short';

  const arbActive = !!gmxArb.data && (gmxArb.data.openPositions.length > 0 || gmxArb.data.summary.totalTrades > 0);
  const avaxActive = !!gmxAvax.data && (gmxAvax.data.openPositions.length > 0 || gmxAvax.data.summary.totalTrades > 0);
  const hlActive = !!hl.data && (hl.data.openPositions.length > 0 || Object.keys(hl.data.summary.performance ?? {}).length > 0);
  const gtradeActive = !!gtrade.data && ((gtrade.data.openPositions?.length ?? 0) > 0 || (gtrade.data.summary?.openCount ?? 0) > 0);

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />

      <main className="max-w-[1400px] mx-auto w-full px-4 py-6 space-y-4">

        {/* Back nav */}
        <div className="flex items-center gap-2 text-[11px]">
          <Link href="/smart-money" className="inline-flex items-center gap-1 text-fg-subtle hover:text-hub-yellow transition-colors">
            <ChevronLeft className="w-3 h-3" /> Smart Money
          </Link>
          {rollup.venues.length > 0 && (
            <>
              <span className="text-fg-faint">·</span>
              <div className="flex items-center gap-2">
                {rollup.venues.map(v => (
                  <span key={v} className="inline-flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: VENUE_COLOR[v] }} />
                    <span className="text-fg-faint">{VENUE_LABEL[v]}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ─── Identity hero ─────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-hub-yellow/[0.12] bg-gradient-to-br from-hub-yellow/[0.04] via-transparent to-transparent p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            {/* Left: name + address + badges + CTAs */}
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-hub-yellow/[0.10] border border-hub-yellow/20 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-hub-yellow" />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full border ${coverageTone(rollup.coverageLabel)}`}>
                  {rollup.coverageLabel}
                </span>
                {rollup.activeAssets.length > 0 && (
                  <span className="text-[10px] text-long font-semibold num">
                    live: {rollup.activeAssets.join(' · ')}
                  </span>
                )}
              </div>

              <h1 className="text-[26px] sm:text-[32px] font-black tracking-tight text-fg-default leading-[1.05] mb-2">
                {displayName ?? (
                  <span className="num">{shortAddr(address)}</span>
                )}
              </h1>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <code className="num text-[11px] text-fg-subtle bg-hub-secondary px-2 py-1 rounded-lg border border-hub-border">
                  {address}
                </code>
                <button
                  onClick={copyAddr}
                  className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-hub-yellow transition-colors px-2 py-1 rounded-lg hover:bg-hub-secondary"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? <span className="text-long">copied</span> : 'Copy'}
                </button>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-2 flex-wrap">
                <BookmarkStar
                  address={address}
                  displayName={displayName}
                  venues={rollup.venues}
                  size={14}
                  className="!p-1.5 !rounded-lg bg-hub-secondary border border-hub-border hover:bg-hub-secondary-medium"
                />
                <Link
                  href={`/watch?add=${address}${displayName ? `&label=${encodeURIComponent(displayName)}` : ''}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/[0.20] transition-colors"
                >
                  + Follow trader
                </Link>
                <a
                  href={`/api/trader/${address}/closed-trades?days=90&format=csv`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-hub-secondary text-fg-subtle border border-hub-border hover:text-hub-yellow hover:border-hub-yellow/20 transition-colors"
                >
                  <Download className="w-3 h-3" /> Export 90d CSV
                </a>
                <div className="flex items-center gap-2 ml-1">
                  <a href={`https://debank.com/profile/${address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-fg-subtle hover:text-fg-default inline-flex items-center gap-0.5">
                    DeBank <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span className="text-fg-faint">·</span>
                  <a href={`https://arbiscan.io/address/${address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-fg-subtle hover:text-fg-default inline-flex items-center gap-0.5">
                    Arbiscan <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  <span className="text-fg-faint">·</span>
                  <a href={`https://snowtrace.io/address/${address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-fg-subtle hover:text-fg-default inline-flex items-center gap-0.5">
                    Snowtrace <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Right: True P&L hero */}
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="eyebrow-pro text-[9px] text-fg-faint">True P&L (all venues)</div>
              <div className={`text-[42px] sm:text-[52px] font-black tracking-tight leading-none num ${truePnlColor}`}>
                {rollup.truePnl >= 0 ? '+' : ''}{fmtUSD(rollup.truePnl)}
              </div>
              <div className="text-[11px] text-fg-subtle num">
                {fmtSign(rollup.lifetimeRealized)} realized · {fmtSign(rollup.openUnrealized)} live
              </div>
            </div>
          </div>
        </div>

        {/* ─── Stats band ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card-premium p-4">
            <div className="eyebrow-pro text-[9px] mb-2">HL Account NAV</div>
            <div className="text-[20px] font-black text-fg-default num">{fmtUSD(rollup.accountValue)}</div>
            <div className="text-[10px] text-fg-subtle num mt-0.5">
              {fmtUSD(rollup.withdrawable)} withdrawable
            </div>
          </div>
          <div className="card-premium p-4">
            <div className="eyebrow-pro text-[9px] mb-2">Open Risk</div>
            <div className="text-[20px] font-black text-fg-default num">{fmtUSD(rollup.openNotional)}</div>
            <div className="text-[10px] text-fg-subtle num mt-0.5">
              {rollup.openRiskPct != null ? `${rollup.openRiskPct.toFixed(1)}% of NAV · ` : ''}{rollup.openPositionCount} pos
            </div>
          </div>
          <div className="card-premium p-4">
            <div className="eyebrow-pro text-[9px] mb-2">Unrealized</div>
            <div className={`text-[20px] font-black num ${uPnlColor}`}>{fmtSign(rollup.openUnrealized)}</div>
            <div className="text-[10px] text-fg-subtle num mt-0.5">
              +{fmtUSD(rollup.openPositiveUnrealized)} / {fmtUSD(rollup.openNegativeUnrealized)}
            </div>
          </div>
          <div className="card-premium p-4">
            <div className="eyebrow-pro text-[9px] mb-2">GMX Win Rate</div>
            {rollup.winRate != null ? (
              <>
                <div className={`text-[20px] font-black num ${rollup.winRate >= 60 ? 'text-long' : rollup.winRate >= 45 ? 'text-fg-default' : 'text-short'}`}>
                  {rollup.winRate.toFixed(0)}%
                </div>
                <div className="text-[10px] text-fg-subtle num mt-0.5">{rollup.totalTrades} trades</div>
              </>
            ) : (
              <div className="text-[20px] font-black text-fg-faint">—</div>
            )}
          </div>
        </div>

        {/* ─── Live positions table ──────────────────────────────────── */}
        {livePositions.length > 0 && <LivePositionsTable positions={livePositions} />}

        {/* ─── PnL chart ─────────────────────────────────────────────── */}
        {chartSeries.length > 0 && (
          <div className="card-premium p-4">
            <div className="eyebrow-pro text-[9px] text-fg-faint mb-3">Cumulative PnL · 30d</div>
            <TraderHistoryChart series={chartSeries} height={200} days={30} />
          </div>
        )}

        {/* ─── Per-venue stat cards ──────────────────────────────────── */}
        <div className="space-y-2">
          <div className="eyebrow-pro text-[9px] text-fg-faint mb-1">Venue breakdown</div>

          {/* Active venues in a responsive grid */}
          {(() => {
            type VenueConfig = {
              id: string;
              label: string;
              accent: string;
              href: string;
              explorerUrl: string | null;
              isLoading: boolean;
              hasActivity: boolean;
              stats?: { label: string; value: string; positive?: boolean }[];
            };

            const configs: VenueConfig[] = [
              {
                id: 'arb', label: 'GMX V2 · Arbitrum', accent: '#28a0f0',
                href: `https://app.gmx.io/#/accounts/${address}?network=arbitrum&v=2`,
                explorerUrl: `https://arbiscan.io/address/${address}`,
                isLoading: gmxArb.isLoading, hasActivity: arbActive,
                stats: gmxArb.data && arbActive ? [
                  { label: 'Realized PnL', value: fmtUSD(gmxArb.data.summary.realizedPnl), positive: gmxArb.data.summary.realizedPnl >= 0 },
                  { label: 'Volume', value: fmtUSD(gmxArb.data.summary.volume) },
                  { label: 'Win Rate', value: `${gmxArb.data.summary.winRate.toFixed(1)}%` },
                  { label: 'Trades', value: `${gmxArb.data.summary.totalTrades}` },
                ] : undefined,
              },
              {
                id: 'avax', label: 'GMX V2 · Avalanche', accent: '#e84142',
                href: `https://app.gmx.io/#/accounts/${address}?network=avalanche&v=2`,
                explorerUrl: `https://snowtrace.io/address/${address}`,
                isLoading: gmxAvax.isLoading, hasActivity: avaxActive,
                stats: gmxAvax.data && avaxActive ? [
                  { label: 'Realized PnL', value: fmtUSD(gmxAvax.data.summary.realizedPnl), positive: gmxAvax.data.summary.realizedPnl >= 0 },
                  { label: 'Volume', value: fmtUSD(gmxAvax.data.summary.volume) },
                  { label: 'Win Rate', value: `${gmxAvax.data.summary.winRate.toFixed(1)}%` },
                  { label: 'Trades', value: `${gmxAvax.data.summary.totalTrades}` },
                ] : undefined,
              },
              {
                id: 'hl', label: 'Hyperliquid', accent: '#a855f7',
                href: `https://app.hyperliquid.xyz/address/${address}`,
                explorerUrl: null,
                isLoading: hl.isLoading, hasActivity: hlActive,
                stats: hl.data && hlActive ? [
                  { label: 'Account Value', value: fmtUSD(hl.data.summary.accountValue) },
                  { label: 'All-Time PnL', value: fmtUSD(hl.data.summary.performance.allTime?.pnl ?? 0), positive: (hl.data.summary.performance.allTime?.pnl ?? 0) >= 0 },
                  { label: '30D PnL', value: fmtUSD(hl.data.summary.performance.month?.pnl ?? 0), positive: (hl.data.summary.performance.month?.pnl ?? 0) >= 0 },
                  { label: 'Margin Used', value: fmtUSD(hl.data.summary.marginUsed) },
                ] : undefined,
              },
              {
                id: 'gtrade', label: 'gTrade', accent: '#22d3ee',
                href: `https://gains.trade/trader#${address}`,
                explorerUrl: `https://arbiscan.io/address/${address}`,
                isLoading: gtrade.isLoading, hasActivity: gtradeActive,
                stats: gtrade.data && gtradeActive ? [
                  { label: 'Open Notional', value: fmtUSD(gtrade.data.summary.totalNotional) },
                  { label: 'Unrealized', value: fmtUSD(gtrade.data.summary.totalUnrealized), positive: gtrade.data.summary.totalUnrealized >= 0 },
                  { label: 'Positions', value: `${gtrade.data.summary.openCount}` },
                  { label: 'Margin', value: fmtUSD(gtrade.data.summary.totalMargin ?? 0) },
                ] : undefined,
              },
            ];

            const active = configs.filter(c => c.hasActivity || c.isLoading);
            const inactive = configs.filter(c => !c.hasActivity && !c.isLoading);

            const gridCls = active.length >= 3 ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
              : active.length === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
              : 'grid grid-cols-1 gap-3';

            return (
              <>
                {active.length > 0 && (
                  <div className={gridCls}>
                    {active.map(c => (
                      <VenueStatCard key={c.id} {...c} />
                    ))}
                  </div>
                )}
                {inactive.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {inactive.map(c => (
                      <VenueStatCard key={c.id} {...c} compactWhenEmpty />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Footer meta */}
        <div className="flex items-center gap-3 text-[10px] text-fg-faint num flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" />
            GMX V2 subgraphs · gTrade on-chain · Hyperliquid mainnet
          </span>
          <span>·</span>
          <span>Auto-refreshes every 60s</span>
          {rollup.openPositionCount > 0 && (
            <>
              <span>·</span>
              <span>{rollup.openPositionCount} open positions across {rollup.venuesActive} venue{rollup.venuesActive !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
