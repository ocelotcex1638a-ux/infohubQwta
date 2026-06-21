'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/hooks/useSWRApi';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BookmarkStar from '@/components/BookmarkStar';
import { useTraderBookmarks } from '@/hooks/useTraderBookmarks';
import { useTraderAlerts } from '@/hooks/useTraderAlerts';
import { formatVenueLabel } from '@/lib/trader-alerts';
import Link from 'next/link';
import {
  Brain, Search, Download, Target,
  Trophy, Activity, Radar, RefreshCw,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────── */

type TraderTier = 'A' | 'B' | 'C' | 'Watch';
type TraderType = 'scalper' | 'day' | 'swing' | 'hodler' | 'algo' | 'dca-heavy';
type ActiveTab = 'leaderboard' | 'confluence';
type NegGuard = 'all' | 'nav-10' | 'nav-5' | 'flat-or-green';

interface AssetRow { symbol: string; realizedPnlUsd: number; volumeUsd: number; closingTrades: number; wins: number; winRatePct: number | null }
interface LeaderboardEntry {
  rank: number; address: string; label: string;
  accountValueUsd: number; allTimePnlUsd: number; allTimeRoiPct: number;
  realised90dUsd: number; realised30dUsd: number; closingTrades90d: number;
  winRatePct: number | null; biggestWinUsd: number; biggestLossUsd: number;
  topSymbols: string[]; lastTradeTs: number | null; daysSinceLastTrade: number | null;
  tier: TraderTier; traderType: TraderType; signalScore: number;
  rr: number | null; maxDrawdownUsd: number; maxDrawdownPct: number | null;
  assetBreakdown: AssetRow[];
  accountNavUsd: number; withdrawableUsd: number | null;
  liveOpenNotionalUsd: number; liveUnrealizedPnlUsd: number;
  livePositiveUnrealizedPnlUsd: number; liveNegativeUnrealizedPnlUsd: number;
  truePnlUsd: number; trueRoiPct: number | null; openRiskPct: number | null;
  activeAssets: string[];
}
interface LeaderboardResponse { ts: number; entries: LeaderboardEntry[]; scanned: number; lookbackDays: number }

interface ConfluenceTrader { address: string; label: string; tier: TraderTier; traderType: TraderType; signalScore: number; sizeUsd: number; leverage: number | null; unrealizedPnlUsd: number; specialist: boolean }
interface ConfluenceSignal {
  id: string; symbol: string; side: 'long' | 'short';
  confluenceScore: number; walletCount: number; specialistCount: number;
  totalNotionalUsd: number; avgSignalScore: number; avgLeverage: number | null;
  netUnrealizedPnlUsd: number; tierCounts: Record<TraderTier, number>;
  traderTypeCounts: Partial<Record<TraderType, number>>; traders: ConfluenceTrader[];
}
interface ConfluenceResponse { ts: number; scanned: number; lookbackDays: number; walletsConsidered: number; minTier: TraderTier; minWallets: number; assetFilter: string | null; availableSymbols: string[]; signals: ConfluenceSignal[] }

interface OverviewWallet { address: string; displayName: string | null; venues: string[]; truePnl: number; liveNotional: number; directionalBias: number }
interface OverviewSummary { walletCount: number; enrichedCount: number; totalLifetimePnl: number; totalVolume: number; totalLiveNotional: number; totalLiveUnrealized: number; smartMoneyLongPct: number; crossVenueCount: number }
interface OverviewResponse { data: OverviewWallet[]; summary: OverviewSummary; meta: { timestamp: number } }

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtUSD(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtSign(n: number) { return `${n >= 0 ? '+' : ''}${fmtUSD(n)}`; }
function fmtPct(n: number | null) { return n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }
function truncAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function tierTone(t: TraderTier) {
  if (t === 'A') return 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/25';
  if (t === 'B') return 'bg-sky-500/[0.12] text-sky-300 border-sky-500/25';
  if (t === 'C') return 'bg-amber-500/[0.12] text-amber-300 border-amber-500/25';
  return 'bg-white/[0.05] text-neutral-300 border-white/10';
}

function activityLabel(days: number | null): string {
  if (days == null) return 'inactive';
  if (days < 1) return 'today';
  if (days < 3) return 'active';
  if (days < 7) return 'this week';
  if (days < 30) return 'this month';
  return 'stale';
}

function negativeGuardPass(e: LeaderboardEntry, mode: NegGuard): boolean {
  if (mode === 'all') return true;
  if (mode === 'flat-or-green') return e.liveNegativeUnrealizedPnlUsd >= 0;
  if (e.accountNavUsd <= 0) return false;
  const pct = Math.abs(e.liveNegativeUnrealizedPnlUsd) / e.accountNavUsd;
  return mode === 'nav-10' ? pct <= 0.10 : pct <= 0.05;
}

/* ─── Sentiment gauge ────────────────────────────────────────────────── */

function SentimentGauge({ longPct, hasActivity }: { longPct: number; hasActivity: boolean }) {
  const pct = Math.max(0, Math.min(100, longPct));
  const label = !hasActivity ? 'NO DATA' : pct >= 55 ? 'BULLISH' : pct <= 45 ? 'BEARISH' : 'NEUTRAL';
  const color = !hasActivity ? 'text-fg-subtle' : pct >= 55 ? 'text-long' : pct <= 45 ? 'text-short' : 'text-fg-muted';

  return (
    <div className="card-premium p-4 flex flex-col gap-2">
      <div className="eyebrow-pro text-[9px]">Smart Money Sentiment</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-black tracking-tight ${color}`}>{label}</span>
        {hasActivity && (
          <span className="text-[10px] text-fg-subtle num">
            {pct.toFixed(0)}% long / {(100 - pct).toFixed(0)}% short
          </span>
        )}
      </div>
      <div className="relative h-1.5 bg-hub-secondary rounded-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, #f87171 0%, var(--hub-secondary-medium) 46%, #4ade80 100%)' }}
        />
        {hasActivity && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-fg-default rounded-full"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-fg-faint">
        <span>all short</span><span>neutral</span><span>all long</span>
      </div>
    </div>
  );
}

/* ─── Live confluence hero signal ────────────────────────────────────── */

function ConfluenceHeroCard({ signal, loading }: { signal: ConfluenceSignal | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="card-premium p-4 border-emerald-500/[0.08] bg-hub-darker animate-pulse">
        <div className="h-3 w-32 bg-hub-secondary rounded mb-3" />
        <div className="h-7 w-20 bg-hub-secondary rounded mb-2" />
        <div className="h-3 w-48 bg-hub-secondary rounded" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="card-premium p-4 flex items-center justify-center">
        <div className="text-center">
          <Radar className="w-5 h-5 text-fg-faint mx-auto mb-2" />
          <p className="text-xs text-fg-subtle">No confluence signals active</p>
        </div>
      </div>
    );
  }

  const sideColor = signal.side === 'long' ? 'text-long' : 'text-short';
  const sideRing = signal.side === 'long' ? 'border-long/20 bg-long/[0.06]' : 'border-short/20 bg-short/[0.06]';
  const uPnlColor = signal.netUnrealizedPnlUsd >= 0 ? 'text-long' : 'text-short';

  return (
    <div className={`card-premium p-4 border ${sideRing} relative`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${signal.side === 'long' ? 'bg-long animate-pulse-slow' : 'bg-short animate-pulse-slow'}`} />
        <span className="eyebrow-pro text-[9px] text-fg-subtle">Live confluence signal</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-black tracking-tight text-fg-default">{signal.symbol}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sideRing} ${sideColor}`}>
          {signal.side}
        </span>
        <span className="text-[10px] text-fg-subtle num">score {signal.confluenceScore}</span>
      </div>
      <p className="text-[11px] text-fg-muted mb-2 leading-relaxed">
        {signal.walletCount} top-tier traders aligned · {fmtUSD(signal.totalNotionalUsd)} notional
        {signal.specialistCount > 0 && ` · ${signal.specialistCount} specialist${signal.specialistCount > 1 ? 's' : ''}`}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['A', 'B', 'C'] as TraderTier[]).map(t => signal.tierCounts[t] > 0 && (
          <span key={t} className={`text-[9px] font-bold px-2 py-0.5 rounded border ${tierTone(t)}`}>
            {t}×{signal.tierCounts[t]}
          </span>
        ))}
        {signal.avgLeverage != null && (
          <span className="text-[9px] text-fg-subtle num">avg {signal.avgLeverage.toFixed(1)}x lev</span>
        )}
        <span className={`text-[9px] num font-semibold ${uPnlColor}`}>
          {fmtSign(signal.netUnrealizedPnlUsd)} uPnL
        </span>
      </div>
      <Link
        href="/smart-money?tab=confluence"
        className="absolute top-4 right-4 text-[9px] text-hub-yellow hover:text-hub-yellow/80 font-bold uppercase tracking-wider"
      >
        View all →
      </Link>
    </div>
  );
}

/* ─── Featured trader card (top 3) ──────────────────────────────────── */

function FeaturedTraderCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const isTop = rank === 1;
  const pnlColor = entry.truePnlUsd >= 0 ? 'text-long' : 'text-short';
  const wrColor = (entry.winRatePct ?? 0) >= 75 ? 'text-long' : (entry.winRatePct ?? 0) >= 60 ? 'text-amber-300' : 'text-short';
  const displayName = entry.label !== entry.address && !entry.label.startsWith('0x') ? entry.label : truncAddr(entry.address);

  return (
    <div className={`relative card-premium p-4 flex flex-col gap-3 hover:border-hub-yellow/20 transition-colors group ${isTop ? 'border-hub-yellow/15' : ''}`}>
      {/* Full-card link — sits at z-[1], below the action row */}
      <Link href={`/trader/${entry.address}`} className="absolute inset-0 rounded-xl z-[1]" aria-label={`View ${displayName} trader profile`} />

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-black num ${isTop ? 'text-hub-yellow' : 'text-fg-subtle'}`}>#{rank}</span>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${tierTone(entry.tier)}`}>
          Tier {entry.tier}
        </span>
        <span className="text-[9px] text-fg-faint uppercase tracking-wider">{entry.traderType.replace('-', ' ')}</span>
        {entry.activeAssets.length > 0 && (
          <span className="text-[9px] text-fg-subtle num">{entry.activeAssets.slice(0, 2).join(' · ')}</span>
        )}
      </div>

      <div>
        <div className="text-[12px] font-bold text-fg-default num group-hover:text-hub-yellow transition-colors">{displayName}</div>
        <div className="text-[9px] text-fg-subtle mt-0.5">{activityLabel(entry.daysSinceLastTrade)}</div>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-0.5">True P&L</div>
          <div className={`text-lg font-black num tracking-tight ${pnlColor}`}>{fmtSign(entry.truePnlUsd)}</div>
          <div className="text-[9px] text-fg-subtle num mt-0.5">
            {fmtSign(entry.realised90dUsd)} 90d · {fmtSign(entry.liveUnrealizedPnlUsd)} live
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-0.5">Signal</div>
          <div className="text-lg font-black num text-fg-default">{entry.signalScore}</div>
          <div className="w-10 h-1 bg-hub-secondary rounded-full overflow-hidden mt-1 ml-auto">
            <div
              className="h-full bg-hub-yellow rounded-full"
              style={{ width: `${entry.signalScore}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-[10px] num text-fg-subtle border-t border-hub-border-subtle pt-2.5">
        <span>WR <span className={wrColor}>{entry.winRatePct == null ? '—' : `${entry.winRatePct.toFixed(0)}%`}</span></span>
        <span>RR <span className="text-fg-default">{entry.rr == null ? '—' : `${entry.rr.toFixed(1)}x`}</span></span>
        <span>MDD <span className="text-short">{entry.maxDrawdownPct == null ? '—' : `${entry.maxDrawdownPct.toFixed(0)}%`}</span></span>
        <span>n <span className="text-fg-muted">{entry.closingTrades90d}</span></span>
      </div>

      {/* Action row — z-[2] so Watch/Export capture clicks before the card link */}
      <div className="relative z-[2] flex gap-2 mt-auto">
        <span className="flex-1 text-center py-1.5 text-[10px] font-bold uppercase tracking-wider bg-hub-yellow text-black rounded-lg group-hover:bg-hub-yellow/90 transition-colors pointer-events-none">
          View Profile
        </span>
        <Link
          href={`/watch?add=${entry.address}${entry.label !== entry.address ? `&label=${encodeURIComponent(entry.label)}` : ''}`}
          className="px-3 py-1.5 text-[10px] text-fg-subtle hover:text-fg-default bg-hub-secondary rounded-lg transition-colors"
        >
          Watch
        </Link>
        <a
          href={`/api/trader/${entry.address}/closed-trades?days=90&format=csv`}
          title="Export closed trades"
          className="px-2 py-1.5 text-fg-subtle hover:text-hub-yellow bg-hub-secondary rounded-lg transition-colors"
        >
          <Download className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

/* ─── Leaderboard table row ──────────────────────────────────────────── */

function LeaderboardRow({ entry, lookback }: { entry: LeaderboardEntry; lookback: number }) {
  const displayName = entry.label !== entry.address && !entry.label.startsWith('0x') ? entry.label : truncAddr(entry.address);
  const pnlColor = entry.truePnlUsd >= 0 ? 'text-long' : 'text-short';
  const wrColor = (entry.winRatePct ?? 0) >= 75 ? 'text-long' : (entry.winRatePct ?? 0) >= 60 ? 'text-amber-300' : 'text-short';
  const bestAsset = entry.assetBreakdown[0] ?? null;

  return (
    <tr className="border-b border-hub-border-subtle row-hover group">
      <td className="px-3 py-2.5 num text-[10px] text-fg-subtle">{entry.rank}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <Link
            href={`/trader/${entry.address}`}
            className="num text-[11px] font-semibold text-fg-default hover:text-hub-yellow truncate max-w-[140px]"
          >
            {displayName}
          </Link>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${tierTone(entry.tier)}`}>
            {entry.tier}
          </span>
          <span className="text-[9px] text-fg-faint capitalize">{entry.traderType.replace('-', ' ')}</span>
          {entry.activeAssets.length > 0 && (
            <span className="text-[9px] text-fg-subtle num hidden md:inline">
              {entry.activeAssets.slice(0, 2).join(' · ')}
            </span>
          )}
        </div>
        <div className="text-[9px] text-fg-faint mt-0.5">{activityLabel(entry.daysSinceLastTrade)}</div>
      </td>
      <td className="px-2 py-2.5 text-right">
        <div className="text-[12px] font-bold text-fg-default num">{entry.signalScore}</div>
        <div className="w-9 h-0.5 bg-hub-secondary rounded overflow-hidden mt-1 ml-auto">
          <div className="h-full bg-hub-yellow rounded" style={{ width: `${entry.signalScore}%` }} />
        </div>
      </td>
      <td className="px-2 py-2.5 text-right">
        <div className={`num font-bold text-[12px] ${pnlColor}`}>{fmtSign(entry.truePnlUsd)}</div>
        <div className="text-[9px] text-fg-subtle num">
          {fmtSign(entry.realised90dUsd)} real · {fmtSign(entry.liveUnrealizedPnlUsd)} live
        </div>
      </td>
      <td className={`px-2 py-2.5 text-right num text-[11px] font-semibold ${wrColor}`}>
        {entry.winRatePct == null ? '—' : `${entry.winRatePct.toFixed(0)}%`}
      </td>
      <td className="px-2 py-2.5 text-right num text-[11px] text-fg-default">
        {entry.rr == null ? '—' : `${entry.rr.toFixed(1)}x`}
      </td>
      <td className="px-2 py-2.5 text-right num text-[11px] text-short">
        {entry.maxDrawdownPct == null ? '—' : `${entry.maxDrawdownPct.toFixed(0)}%`}
      </td>
      <td className="px-2 py-2.5 text-right num text-[11px] text-fg-subtle">{entry.closingTrades90d}</td>
      <td className="px-2 py-2.5 text-[11px] text-fg-muted hidden xl:table-cell">
        {bestAsset ? (
          <div>
            <div className="font-semibold text-fg-default">{bestAsset.symbol}</div>
            <div className={`num text-[9px] ${bestAsset.realizedPnlUsd >= 0 ? 'text-long' : 'text-short'}`}>
              {fmtSign(bestAsset.realizedPnlUsd)}
            </div>
          </div>
        ) : '—'}
      </td>
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={`/api/trader/${entry.address}/closed-trades?days=${lookback}&format=csv`}
            title="Export CSV"
            className="text-fg-subtle hover:text-hub-yellow"
          >
            <Download className="w-3 h-3" />
          </a>
          <Link href={`/trader/${entry.address}`} className="text-[9px] text-hub-yellow font-bold uppercase tracking-wider">
            View →
          </Link>
        </div>
      </td>
    </tr>
  );
}

/* ─── Confluence signal card ─────────────────────────────────────────── */

function ConfluenceCard({ signal }: { signal: ConfluenceSignal }) {
  const sideColor = signal.side === 'long' ? 'text-long' : 'text-short';
  const sideBorder = signal.side === 'long' ? 'border-long/15' : 'border-short/15';
  const uPnlColor = signal.netUnrealizedPnlUsd >= 0 ? 'text-long' : 'text-short';

  return (
    <div className={`card-premium p-4 border ${sideBorder}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-lg font-black text-fg-default">{signal.symbol}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${signal.side === 'long' ? 'bg-long/[0.08] border-long/20 text-long' : 'bg-short/[0.08] border-short/20 text-short'}`}>
              {signal.side}
            </span>
            <span className="text-[9px] text-fg-subtle num">score {signal.confluenceScore}</span>
          </div>
          <p className="text-[11px] text-fg-muted">
            {signal.walletCount} traders aligned{signal.specialistCount > 0 ? ` · ${signal.specialistCount} specialist${signal.specialistCount > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-black text-fg-default num">{fmtUSD(signal.totalNotionalUsd)}</div>
          <div className="text-[9px] text-fg-subtle">notional</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-hub-secondary rounded-lg p-2">
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-1">Avg score</div>
          <div className="text-[13px] font-bold num text-fg-default">{signal.avgSignalScore}</div>
        </div>
        <div className="bg-hub-secondary rounded-lg p-2">
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-1">Avg lev</div>
          <div className="text-[13px] font-bold num text-fg-default">{signal.avgLeverage == null ? '—' : `${signal.avgLeverage.toFixed(1)}x`}</div>
        </div>
        <div className="bg-hub-secondary rounded-lg p-2">
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-1">Net uPnL</div>
          <div className={`text-[13px] font-bold num ${uPnlColor}`}>{fmtSign(signal.netUnrealizedPnlUsd)}</div>
        </div>
        <div className="bg-hub-secondary rounded-lg p-2">
          <div className="text-[9px] uppercase tracking-wider text-fg-faint mb-1">Tier mix</div>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {(['A', 'B', 'C'] as TraderTier[]).map(t => signal.tierCounts[t] > 0 && (
              <span key={t} className={`text-[8px] font-bold px-1 py-0.5 rounded border ${tierTone(t)}`}>
                {t}×{signal.tierCounts[t]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {signal.traders.slice(0, 3).map(trader => {
          const dn = trader.label !== trader.address && !trader.label.startsWith('0x') ? trader.label : truncAddr(trader.address);
          return (
            <div key={trader.address} className="flex items-center justify-between rounded-lg border border-hub-border-subtle bg-hub-secondary/30 px-3 py-2 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link href={`/trader/${trader.address}`} className="text-[11px] font-semibold text-fg-default hover:text-hub-yellow truncate">
                    {dn}
                  </Link>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${tierTone(trader.tier)}`}>{trader.tier}</span>
                  {trader.specialist && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-hub-yellow/[0.08] border-hub-yellow/20 text-hub-yellow">spec</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[12px] font-bold text-fg-default num">{fmtUSD(trader.sizeUsd)}</div>
                <div className="text-[9px] text-fg-subtle num">
                  s{trader.signalScore}{trader.leverage != null ? ` · ${trader.leverage.toFixed(1)}x` : ''}
                </div>
              </div>
            </div>
          );
        })}
        {signal.traders.length > 3 && (
          <div className="text-[9px] text-fg-faint text-center pt-1">
            +{signal.traders.length - 3} more traders
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */

const TRADER_TYPES: Array<'all' | TraderType> = ['all', 'scalper', 'day', 'swing', 'hodler', 'algo', 'dca-heavy'];
const TIER_FILTERS: Array<'all' | TraderTier> = ['all', 'A', 'B', 'C'];

function Pill({ label, active, onClick, colorClass }: { label: string; active: boolean; onClick: () => void; colorClass?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
        active
          ? 'bg-hub-yellow text-black'
          : `bg-hub-secondary text-fg-subtle hover:text-fg-default ${colorClass ?? ''}`
      }`}
    >
      {label}
    </button>
  );
}

function SmartMoneyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: ActiveTab = searchParams.get('tab') === 'confluence' ? 'confluence' : 'leaderboard';

  function switchTab(tab: ActiveTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'leaderboard') params.delete('tab'); else params.set('tab', tab);
    router.replace(`/smart-money${params.size > 0 ? `?${params.toString()}` : ''}`, { scroll: false });
  }
  const [tierFilter, setTierFilter] = useState<'all' | TraderTier>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TraderType>('all');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [negGuard, setNegGuard] = useState<NegGuard>('all');
  const [topN, setTopN] = useState(50);
  const [lookback, setLookback] = useState(90);
  const [search, setSearch] = useState('');
  const [confMinTier, setConfMinTier] = useState<TraderTier>('C');
  const [confMinWallets, setConfMinWallets] = useState(2);

  const { bookmarks } = useTraderBookmarks();
  const { feed, enabled: alertsEnabled, toggleEnabled: toggleAlerts, lastCheck } = useTraderAlerts();
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Overview (fast — sentiment gauge + summary stats) */
  const { data: overviewData } = useApi<OverviewResponse>({
    key: 'smart-money-overview',
    fetcher: async () => {
      const res = await fetch('/api/smart-money?min_pnl=250000&min_volume=10000000&min_wr=55&include=both&limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refreshInterval: 120_000,
  });

  /* Leaderboard (primary tab data) */
  const { data: leaderboardData, isLoading: lbLoading, refresh: refreshLb } = useApi<LeaderboardResponse>({
    key: `sm-leaderboard:${topN}:${lookback}`,
    fetcher: async () => {
      const res = await fetch(`/api/smart-money/leaderboard?topN=${topN}&lookbackDays=${lookback}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refreshInterval: 60_000,
    timeout: 60_000,
  });

  /* Confluence (hero signal + second tab) */
  const confParams = new URLSearchParams({
    topN: String(topN),
    lookbackDays: String(lookback),
    minTier: confMinTier,
    minWallets: String(confMinWallets),
  });
  const { data: confluenceData, isLoading: confLoading, refresh: refreshConf } = useApi<ConfluenceResponse>({
    key: `sm-confluence:${topN}:${lookback}:${confMinTier}:${confMinWallets}`,
    fetcher: async () => {
      const res = await fetch(`/api/smart-money/confluence?${confParams.toString()}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refreshInterval: 60_000,
    timeout: 60_000,
  });

  const topConfluenceSignal = confluenceData?.signals[0] ?? null;

  /* Leaderboard filter + search */
  const assetOptions = useMemo(() => {
    if (!leaderboardData) return [];
    return Array.from(new Set(
      leaderboardData.entries.flatMap(e => [
        ...e.assetBreakdown.map(a => a.symbol),
        ...e.activeAssets,
      ]),
    )).sort().slice(0, 12);
  }, [leaderboardData]);

  const visibleEntries = useMemo(() => {
    if (!leaderboardData) return [];
    const q = search.trim().toLowerCase();
    return leaderboardData.entries.filter(e => {
      if (tierFilter !== 'all' && e.tier !== tierFilter) return false;
      if (typeFilter !== 'all' && e.traderType !== typeFilter) return false;
      if (assetFilter !== 'all') {
        const has = e.assetBreakdown.some(a => a.symbol === assetFilter) || e.activeAssets.includes(assetFilter);
        if (!has) return false;
      }
      if (!negativeGuardPass(e, negGuard)) return false;
      if (q) {
        const dn = (e.label !== e.address && !e.label.startsWith('0x') ? e.label : '').toLowerCase();
        if (!e.address.toLowerCase().includes(q) && !dn.includes(q)) return false;
      }
      return true;
    });
  }, [leaderboardData, tierFilter, typeFilter, assetFilter, negGuard, search]);

  const top3 = useMemo(() => leaderboardData?.entries.slice(0, 3) ?? [], [leaderboardData]);

  /* Confluence asset filter options */
  const confAssets = useMemo(() => confluenceData?.availableSymbols.slice(0, 12) ?? [], [confluenceData]);
  const [confAssetFilter, setConfAssetFilter] = useState<string>('all');
  // Reset asset pill when upstream confluence params change so a stale selection
  // doesn't silently show zero results after switching tier/wallets/lookback/topN.
  useEffect(() => { setConfAssetFilter('all'); }, [confMinTier, confMinWallets, lookback, topN]);
  const visibleSignals = useMemo(() => {
    if (!confluenceData) return [];
    if (confAssetFilter === 'all') return confluenceData.signals.slice(0, 12);
    return confluenceData.signals.filter(s => s.symbol === confAssetFilter).slice(0, 12);
  }, [confluenceData, confAssetFilter]);

  const summary = overviewData?.summary;

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[1400px] mx-auto w-full px-4 py-6">

        {/* Page header + tabs */}
        <header className="mb-0">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between mb-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-hub-yellow/10 border border-hub-yellow/20 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-hub-yellow" />
                </div>
                <span className="eyebrow-pro">Wallets / cross-venue</span>
              </div>
              <h1 className="h1-pro">
                Smart <span className="text-hub-yellow">money</span>
              </h1>
              <p className="text-[13px] text-fg-subtle mt-1.5 max-w-xl leading-relaxed">
                Signal-quality ranked traders across HL, GMX V2, and gTrade.
                Find wallets worth following — not just the biggest PnL.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { refreshLb(); refreshConf(); }}
                className="inline-flex items-center gap-1 text-[10px] text-fg-subtle hover:text-hub-yellow transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-hub-border">
            {(['leaderboard', 'confluence'] as ActiveTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] border-b-2 -mb-px transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-hub-yellow text-hub-yellow'
                    : 'border-transparent text-fg-subtle hover:text-fg-muted'
                }`}
              >
                {tab === 'leaderboard' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" /> Leaderboard
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Radar className="w-3 h-3" /> Confluence
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        {/* Hero band — always visible */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr_1fr] gap-3 my-4">
          <SentimentGauge
            longPct={summary?.smartMoneyLongPct ?? 50}
            hasActivity={(summary?.totalLiveNotional ?? 0) > 0}
          />
          <ConfluenceHeroCard signal={topConfluenceSignal} loading={confLoading && !confluenceData} />
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            <div className="card-premium p-4">
              <div className="eyebrow-pro text-[9px] mb-1.5">Live notional</div>
              <div className="text-xl font-black text-fg-default num">{fmtUSD(summary?.totalLiveNotional ?? 0)}</div>
              <div className={`text-[10px] num mt-1 ${(summary?.totalLiveUnrealized ?? 0) >= 0 ? 'text-long' : 'text-short'}`}>
                {fmtSign(summary?.totalLiveUnrealized ?? 0)} unrealized
              </div>
            </div>
            <div className="card-premium p-4">
              <div className="eyebrow-pro text-[9px] mb-1.5">Tracked wallets</div>
              <div className="text-xl font-black text-fg-default num">{summary?.walletCount ?? '—'}</div>
              <div className="text-[10px] text-fg-subtle mt-1">{summary?.crossVenueCount ?? 0} cross-platform</div>
            </div>
          </div>
        </div>

        {/* ─── Leaderboard tab ─────────────────────────────────────── */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">

            {/* Filter bar */}
            <div className="card-premium p-3 space-y-3">
              {/* Row 1: Lookback + Top N */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="eyebrow-pro text-[9px] text-fg-faint">Top:</span>
                {[20, 50, 100].map(n => (
                  <Pill key={n} label={String(n)} active={topN === n} onClick={() => setTopN(n)} />
                ))}
                <span className="eyebrow-pro text-[9px] text-fg-faint ml-2">Lookback:</span>
                {[7, 30, 90].map(d => (
                  <Pill key={d} label={`${d}d`} active={lookback === d} onClick={() => setLookback(d)} />
                ))}
              </div>

              {/* Row 2: Tier + Type */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="eyebrow-pro text-[9px] text-fg-faint">Tier:</span>
                {TIER_FILTERS.map(t => (
                  <Pill
                    key={t}
                    label={t === 'all' ? 'All' : `Tier ${t}`}
                    active={tierFilter === t}
                    onClick={() => setTierFilter(t)}
                    colorClass={t === 'A' ? 'hover:text-emerald-300' : t === 'B' ? 'hover:text-sky-300' : t === 'C' ? 'hover:text-amber-300' : ''}
                  />
                ))}
                <span className="eyebrow-pro text-[9px] text-fg-faint ml-2">Type:</span>
                {TRADER_TYPES.map(t => (
                  <Pill key={t} label={t === 'all' ? 'All' : t.replace('-', ' ')} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
                ))}
              </div>

              {/* Row 3: Asset filter */}
              {assetOptions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="eyebrow-pro text-[9px] text-fg-faint">Asset:</span>
                  <Pill label="All" active={assetFilter === 'all'} onClick={() => setAssetFilter('all')} />
                  {assetOptions.map(a => (
                    <Pill key={a} label={a} active={assetFilter === a} onClick={() => setAssetFilter(a)} />
                  ))}
                </div>
              )}

              {/* Row 4: Quality filters + search */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-[9px] text-fg-subtle bg-hub-secondary rounded-lg border border-hub-border px-3 py-1.5">
                  <span>Bag-holder guard</span>
                  <select
                    value={negGuard}
                    onChange={e => setNegGuard(e.target.value as NegGuard)}
                    className="bg-transparent text-fg-default text-[10px] font-semibold"
                  >
                    <option value="all">off</option>
                    <option value="nav-10">uPnL &gt; -10% NAV</option>
                    <option value="nav-5">uPnL &gt; -5% NAV</option>
                    <option value="flat-or-green">flat / green only</option>
                  </select>
                </label>
                <div className="ml-auto relative lg:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-fg-faint pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search wallet or name"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-hub-secondary border border-hub-border rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-fg-default placeholder:text-fg-faint focus:outline-none focus:border-hub-border-hover"
                  />
                </div>
              </div>
            </div>

            {/* Loading skeleton */}
            {lbLoading && !leaderboardData && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-hub-darker border border-hub-border rounded-xl animate-pulse" />
                  ))}
                </div>
                <div className="h-64 bg-hub-darker border border-hub-border rounded-xl animate-pulse" />
              </div>
            )}

            {leaderboardData && (
              <>
                {/* Featured top 3 */}
                {top3.length > 0 && (
                  <div>
                    <div className="eyebrow-pro text-[9px] text-fg-faint mb-3">Top traders · {lookback}d lookback</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 card-enter-stagger">
                      {top3.map((e, i) => (
                        <FeaturedTraderCard key={e.address} entry={e} rank={i + 1} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Full table */}
                <div className="card-premium overflow-x-auto">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-hub-border-subtle">
                    <span className="eyebrow-pro text-[9px] text-fg-faint">
                      {visibleEntries.length} traders · {lookback}d lookback
                    </span>
                    <span className="text-[9px] text-fg-faint num">
                      {leaderboardData.ts ? `refreshed ${new Date(leaderboardData.ts).toLocaleTimeString()}` : ''}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-hub-secondary/40">
                      <tr className="border-b border-hub-border-subtle">
                        {['#', 'Wallet', 'Score', 'True P&L', 'WR', 'RR', 'MDD', 'n', 'Best asset', ''].map((h, i) => (
                          <th
                            key={i}
                            className={`px-2 py-2 text-[9px] uppercase tracking-wider text-fg-faint font-bold ${i > 2 ? 'text-right' : i === 0 ? 'pl-3 text-left' : 'text-left'} ${h === 'Best asset' ? 'hidden xl:table-cell' : ''}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEntries.map(e => (
                        <LeaderboardRow key={e.address} entry={e} lookback={lookback} />
                      ))}
                    </tbody>
                  </table>
                  {visibleEntries.length === 0 && (
                    <div className="text-center py-10 text-fg-subtle text-sm">
                      No traders match the current filters.
                    </div>
                  )}
                </div>

                {/* Bookmarks & activity (secondary) */}
                {bookmarks.length > 0 && (
                  <div className="card-premium p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-3.5 h-3.5 text-hub-yellow" />
                      <h2 className="text-[10px] font-bold uppercase tracking-wider text-fg-default">My Tracked Traders</h2>
                      <span className="text-[9px] text-fg-subtle num">{bookmarks.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bookmarks.map(b => (
                        <div key={b.address} className="group/bm inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-hub-secondary/50 hover:bg-hub-secondary border border-hub-border-subtle transition-colors">
                          <Link href={`/trader/${b.address}`} className="text-[11px] text-fg-default font-semibold hover:text-hub-yellow">
                            {b.displayName || `${b.address.slice(0, 6)}…${b.address.slice(-4)}`}
                          </Link>
                          <BookmarkStar address={b.address} displayName={b.displayName} venues={b.venues ?? []} size={11} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracked activity feed */}
                {bookmarks.length > 0 && (
                  <div className="card-premium p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Activity className="w-3.5 h-3.5 text-fg-subtle" />
                      <h2 className="text-[10px] font-bold uppercase tracking-wider text-fg-default">Tracked Activity</h2>
                      <span className="text-[9px] text-fg-subtle">{feed.length} events</span>
                      {lastCheck && alertsEnabled && (
                        <span className="text-[9px] text-fg-faint">
                          / checked {Math.floor((nowTick - lastCheck) / 1000)}s ago
                        </span>
                      )}
                      <div className="ml-auto">
                        <button
                          onClick={toggleAlerts}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${
                            alertsEnabled
                              ? 'bg-long/[0.12] text-long border border-long/20'
                              : 'bg-hub-secondary text-fg-subtle border border-hub-border'
                          }`}
                        >
                          {alertsEnabled ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>
                    {!alertsEnabled ? (
                      <p className="text-[11px] text-fg-subtle leading-relaxed">
                        Turn on to get browser notifications when bookmarked traders open, close, or resize positions. Polls every 2 min. No backend needed.
                      </p>
                    ) : feed.length === 0 ? (
                      <p className="text-[11px] text-fg-subtle">
                        Watching {bookmarks.length} trader{bookmarks.length !== 1 ? 's' : ''}. No changes yet.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {feed.map(a => {
                          const kindColor = a.kind === 'opened' ? 'text-long' : a.kind === 'closed' ? 'text-fg-subtle' : a.kind === 'flipped' ? 'text-amber-300' : a.kind === 'increased' ? 'text-sky-300' : 'text-short';
                          const ago = Math.floor((nowTick - a.timestamp) / 1000);
                          const agoStr = ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.floor(ago / 60)}m` : `${Math.floor(ago / 3600)}h`;
                          return (
                            <Link key={a.id} href={`/trader/${a.address}`} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-hub-secondary/30 transition-colors">
                              <span className={`text-[9px] font-bold uppercase tracking-wider min-w-[52px] ${kindColor}`}>{a.kind}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] text-fg-default font-semibold truncate">
                                  {a.displayName || `${a.address.slice(0, 6)}…${a.address.slice(-4)}`}
                                  <span className="ml-1 text-[9px] text-fg-faint">{formatVenueLabel(a.venue)}</span>
                                </div>
                                <div className="text-[10px] text-fg-subtle truncate">{a.details}</div>
                              </div>
                              <span className="text-[9px] text-fg-faint num flex-shrink-0">{agoStr}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!leaderboardData && !lbLoading && (
              <div className="card-premium p-10 text-center text-fg-subtle text-sm">
                Failed to load leaderboard.
              </div>
            )}
          </div>
        )}

        {/* ─── Confluence tab ───────────────────────────────────────── */}
        {activeTab === 'confluence' && (
          <div className="space-y-4">
            {/* Confluence filters */}
            <div className="card-premium p-3 flex items-center gap-3 flex-wrap">
              <span className="eyebrow-pro text-[9px] text-fg-faint">Min tier:</span>
              {(['A', 'B', 'C'] as TraderTier[]).map(t => (
                <Pill key={t} label={`Tier ${t}`} active={confMinTier === t} onClick={() => setConfMinTier(t)} />
              ))}
              <span className="eyebrow-pro text-[9px] text-fg-faint ml-2">Min wallets:</span>
              {[2, 3, 4].map(n => (
                <Pill key={n} label={`${n}+`} active={confMinWallets === n} onClick={() => setConfMinWallets(n)} />
              ))}
              {confAssets.length > 0 && (
                <>
                  <span className="eyebrow-pro text-[9px] text-fg-faint ml-2">Asset:</span>
                  <Pill label="All" active={confAssetFilter === 'all'} onClick={() => setConfAssetFilter('all')} />
                  {confAssets.map(a => (
                    <Pill key={a} label={a} active={confAssetFilter === a} onClick={() => setConfAssetFilter(a)} />
                  ))}
                </>
              )}
            </div>

            {/* Confluence stats bar */}
            {confluenceData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Active signals', value: String(confluenceData.signals.length) },
                  { label: 'Wallets scanned', value: String(confluenceData.walletsConsidered) },
                  { label: 'Tier floor', value: confluenceData.minTier },
                  { label: 'Min aligned', value: `${confluenceData.minWallets}+` },
                ].map(s => (
                  <div key={s.label} className="card-premium p-3">
                    <div className="eyebrow-pro text-[9px] mb-1">{s.label}</div>
                    <div className="text-xl font-black text-fg-default num">{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {confLoading && !confluenceData && (
              <div className="card-premium p-10 text-center text-fg-subtle text-sm animate-pulse">
                Building confluence clusters… 5-15s on cold cache.
              </div>
            )}

            {confluenceData && visibleSignals.length === 0 && (
              <div className="card-premium p-8 text-center space-y-2">
                <Radar className="w-6 h-6 text-fg-faint mx-auto" />
                <p className="text-sm text-fg-subtle">No signals match the current filters.</p>
                {confMinTier !== 'C' && (
                  <p className="text-[11px] text-fg-faint">
                    Only {confluenceData.walletsConsidered} wallets have open positions right now.
                    Try <button onClick={() => setConfMinTier('C')} className="text-hub-yellow hover:underline font-semibold">Tier C</button> to include more traders.
                  </p>
                )}
                {confMinTier === 'C' && confMinWallets > 2 && (
                  <p className="text-[11px] text-fg-faint">
                    Try <button onClick={() => setConfMinWallets(2)} className="text-hub-yellow hover:underline font-semibold">2+ wallets</button> to lower the alignment threshold.
                  </p>
                )}
              </div>
            )}

            {visibleSignals.length > 0 && (
              <div className="grid gap-4 xl:grid-cols-2 card-enter-stagger">
                {visibleSignals.map(s => <ConfluenceCard key={s.id} signal={s} />)}
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        <div className="mt-6 text-[9px] text-fg-faint num flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" /> HL + GMX V2 (Arb + Avax) + gTrade
          </span>
          <span>/</span>
          <span>Past PnL is not predictive. &quot;Smart money&quot; is descriptive, not prescriptive.</span>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SmartMoneyFallback() {
  return (
    <div className="min-h-screen bg-hub-black">
      <div className="max-w-[1400px] mx-auto w-full px-4 py-6 space-y-4">
        <div className="h-8 w-48 bg-hub-secondary rounded animate-pulse" />
        <div className="h-32 bg-hub-secondary rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-hub-secondary rounded-xl animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

export default function SmartMoneyPage() {
  return (
    <Suspense fallback={<SmartMoneyFallback />}>
      <SmartMoneyContent />
    </Suspense>
  );
}
