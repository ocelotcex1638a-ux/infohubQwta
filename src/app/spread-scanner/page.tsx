'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ReferralBanner from '@/components/ReferralBanner';
import PageHero from '@/components/PageHero';
import { useApi } from '@/hooks/useSWRApi';
import { ArrowUpDown, ArrowLeftRight, RefreshCw, Copy, Check, ShieldCheck, ExternalLink } from 'lucide-react';
import { getCoinIcon } from '@/lib/coinIcons';

// Derived from the canonical CEX set in @/lib/constants/exchanges.
// Was a hand-maintained 18-venue local copy that silently dropped
// Blofin (added May 2026) — clicking the "CEX only" toggle hid every
// Blofin row in the scanner result. Same drift pattern as the
// /spreads picker fixed in commit 590077d4.
import { ALL_EXCHANGES, DEX_EXCHANGES as DEX_CONSTANT } from '@/lib/constants/exchanges';
// Set<string> (not the strict ExchangeName union) — the row data comes
// over the wire as `string`, and Set.has() would otherwise fail type
// narrowing on every check.
const CEX_SET: ReadonlySet<string> = new Set(ALL_EXCHANGES.filter(e => !DEX_CONSTANT.has(e)));
import { ExchangeLogo } from '@/components/ExchangeLogos';
import { getExchangeReferralUrl } from '@/lib/referralLinks';
import DataFreshness from '@/components/DataFreshness';
import WatchlistStar from '@/components/WatchlistStar';

interface SpreadRow {
  symbol: string;
  spreadUsd: number;
  spreadPct: number;
  netPct: number;
  feePct: number;
  highExchange: string;
  highPrice: number;
  highVolume: number;
  lowExchange: string;
  lowPrice: number;
  lowVolume: number;
  exchangeCount: number;
  minSideVolume: number;
  maxTradableUsd: number;
}

type SortKey = 'symbol' | 'spreadUsd' | 'spreadPct' | 'netPct' | 'minSideVolume' | 'exchangeCount';

const VOLUME_PRESETS = [
  { label: '$500K+', value: 500_000 },
  { label: '$2M+', value: 2_000_000 },
  { label: '$10M+', value: 10_000_000 },
];

const NET_PRESETS = [
  { label: '0.02%+', value: 0.02 },
  { label: '0.10%+', value: 0.10 },
  { label: '0.25%+', value: 0.25 },
];

const SPREAD_CAP_PRESETS = [
  { label: '<3%', value: 3 },
  { label: '<5%', value: 5 },
  { label: '<10%', value: 10 },
];

function fp(v: number) {
  if (!isFinite(v)) return '—';
  if (v >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}

function usdCompact(v: number) {
  if (!Number.isFinite(v) || v <= 0) return '$0';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function qualityLabel(row: SpreadRow) {
  if (row.netPct >= 0.5 && row.minSideVolume >= 5_000_000) return 'A';
  if (row.netPct >= 0.2 && row.minSideVolume >= 2_000_000) return 'B';
  if (row.netPct >= 0.05 && row.minSideVolume >= 500_000) return 'C';
  return 'Watch';
}

export default function SpreadScannerPage() {
  const searchParams = useSearchParams();
  // Read ?symbol= so the chart's Arb tool can land users on this page
  // pre-filtered to the coin they were just looking at. Strip + cap so
  // a maliciously-long string can't blow up the search field.
  const prefilledSymbol = (searchParams.get('symbol') || '').toUpperCase().trim().slice(0, 16);
  const [sortKey, setSortKey] = useState<SortKey>('netPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState(prefilledSymbol);
  const [cexOnly, setCexOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [minVolumeUsd, setMinVolumeUsd] = useState(500_000);
  const [minNetSpreadPct, setMinNetSpreadPct] = useState(0.02);
  const [maxSpreadPct, setMaxSpreadPct] = useState(5);
  const shareCardUrl = '/api/og?v=spreads&title=Actionable%20Crypto%20Spreads&desc=Fee-adjusted%2C%20liquidity-gated%20cross-exchange%20opportunities%20on%20InfoHub';

  const fetcher = useCallback(async () => {
    const params = new URLSearchParams({
      minVolumeUsd: String(minVolumeUsd),
      minNetSpreadPct: String(minNetSpreadPct),
      maxSpreadPct: String(maxSpreadPct),
    });
    const res = await fetch(`/api/spreads/current?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json?.data ?? []) as SpreadRow[];
  }, [minVolumeUsd, minNetSpreadPct, maxSpreadPct]);

  const { data: rawRows, error, isLoading: loading, lastUpdate, refresh: fetchData } = useApi({
    key: ['spread-scanner', minVolumeUsd, minNetSpreadPct, maxSpreadPct],
    fetcher,
    refreshInterval: 30000,
  });
  const rows = rawRows ?? [];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc'); }
  };

  const sorted = useMemo(() => {
    let f = rows;
    if (filter) f = f.filter(r => r.symbol.toLowerCase().includes(filter.toLowerCase()));
    if (cexOnly) f = f.filter(r => CEX_SET.has(r.highExchange) && CEX_SET.has(r.lowExchange));
    return [...f].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'symbol') return mul * a.symbol.localeCompare(b.symbol);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
  }, [rows, sortKey, sortDir, filter, cexOnly]);

  const copyShareSummary = async () => {
    const topRows = sorted.slice(0, 5);
    const lines = topRows.map((r, i) => (
      `${i + 1}. ${r.symbol}: ${r.lowExchange} -> ${r.highExchange}, net ${r.netPct.toFixed(3)}%, min vol ${usdCompact(r.minSideVolume)}`
    ));
    const text = [
      'Top actionable cross-exchange spreads on InfoHub:',
      ...lines,
      'Filtered for min volume, fee-adjusted net spread, and outlier price sanity.',
      'https://info-hub.io/spread-scanner',
      `Share card: https://info-hub.io${shareCardUrl}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={`w-3 h-3 inline ml-1 ${sortKey === k ? 'text-hub-yellow' : 'text-neutral-600'}`} />
  );

  return (
    <div className="min-h-screen bg-hub-black text-white flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6">
        <PageHero
          icon={ArrowLeftRight}
          eyebrow="Markets · cross-exchange"
          title="Spread"
          accentNoun="scanner"
          accent="hub-yellow"
          className="mb-6"
          description={
            <>Actionable cross-exchange spreads, ranked after fee and liquidity gates. Click a row to inspect the venue pair.</>
          }
          actions={
            <>
              {/* DataFreshness's `exchangeCount` renders as "X exchanges";
                  rows.length is the SYMBOL count, not venue count — use sources. */}
              <DataFreshness
                exchangeCount={0}
                sources={[`${rows.length} actionable spreads`]}
                lastUpdated={lastUpdate}
              />
              <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/[0.05] transition" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-neutral-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          }
        />

        <section className="mb-4 grid gap-3 md:grid-cols-5">
          <QualityTile label="Volume gate" value={usdCompact(minVolumeUsd)} hint="24h volume on both sides" />
          <QualityTile label="Ranking" value="Net spread" hint="gross minus exchange fees" />
          <QualityTile label="Noise cap" value={`<${maxSpreadPct}%`} hint="filters stale or mismatched markets" />
          <button
            type="button"
            onClick={copyShareSummary}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-hub-yellow/30 hover:bg-white/[0.05]"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-hub-yellow" />}
              Shareable brief
            </div>
            <div className="mt-1 text-sm font-semibold text-white">{copied ? 'Copied for CT / Reddit' : 'Copy top 5 setups'}</div>
          </button>
          <a
            href={shareCardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-hub-yellow/30 hover:bg-white/[0.05]"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              <ExternalLink className="h-3.5 w-3.5 text-sky-400" />
              Social card
            </div>
            <div className="mt-1 text-sm font-semibold text-white">Open OG preview</div>
          </a>
        </section>

        {/* Search + filters */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full sm:w-64 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-hub-yellow/30"
          />
          <button
            onClick={() => setCexOnly(c => !c)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${cexOnly ? 'bg-hub-yellow/10 text-hub-yellow border-hub-yellow/30' : 'bg-white/[0.03] text-neutral-500 border-white/[0.08] hover:text-neutral-300'}`}>
            {cexOnly ? 'CEX Only ✓' : 'CEX Only'}
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Junk spreads hidden by default
          </div>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          <PresetGroup
            label="Min liquidity"
            value={minVolumeUsd}
            options={VOLUME_PRESETS}
            onChange={setMinVolumeUsd}
          />
          <PresetGroup
            label="Min net spread"
            value={minNetSpreadPct}
            options={NET_PRESETS}
            onChange={setMinNetSpreadPct}
          />
          <PresetGroup
            label="Gross sanity cap"
            value={maxSpreadPct}
            options={SPREAD_CAP_PRESETS}
            onChange={setMaxSpreadPct}
          />
        </div>

        {error && !rows.length && (
          <div className="text-center py-12 text-red-400">
            <p>{error}</p>
            <button onClick={fetchData} className="mt-3 text-sm text-hub-yellow hover:underline">Retry</button>
          </div>
        )}

        {loading && rows.length === 0 && !error && (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="space-y-0">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-12 border-b border-white/[0.03] animate-pulse bg-white/[0.01]" />
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Price spread scanner">
              <thead>
                <tr className="border-b border-white/[0.06] text-neutral-500 text-xs">
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-white transition" role="button" tabIndex={0} onClick={() => handleSort('symbol')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('symbol'); } }}>
                    SYMBOL <SortIcon k="symbol" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white transition" role="button" tabIndex={0} onClick={() => handleSort('spreadUsd')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('spreadUsd'); } }}>
                    SPREAD $ <SortIcon k="spreadUsd" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white transition" role="button" tabIndex={0} onClick={() => handleSort('netPct')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('netPct'); } }}>
                    NET % <SortIcon k="netPct" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white transition hidden md:table-cell" role="button" tabIndex={0} onClick={() => handleSort('spreadPct')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('spreadPct'); } }}>
                    GROSS % <SortIcon k="spreadPct" />
                  </th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">HIGH EXCHANGE</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">LOW EXCHANGE</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white transition hidden lg:table-cell" role="button" tabIndex={0} onClick={() => handleSort('minSideVolume')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('minSideVolume'); } }}>
                    MIN VOL <SortIcon k="minSideVolume" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-white transition hidden md:table-cell" role="button" tabIndex={0} onClick={() => handleSort('exchangeCount')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('exchangeCount'); } }}>
                    EXCHANGES <SortIcon k="exchangeCount" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <Link key={r.symbol} href={`/spreads?s=${r.symbol}`} className="contents">
                    <tr className={`border-b border-white/[0.03] hover:bg-white/[0.03] transition cursor-pointer ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span onClick={e => e.preventDefault()}><WatchlistStar symbol={r.symbol} /></span>
                          <img src={getCoinIcon(r.symbol)} alt={`${r.symbol} icon`} className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span className="font-semibold text-white">{r.symbol}</span>
                          <span className="rounded border border-hub-yellow/20 bg-hub-yellow/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-hub-yellow">
                            {qualityLabel(r)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-hub-yellow font-medium">
                        ${fp(r.spreadUsd)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-medium ${r.netPct > 0.2 ? 'text-green-400' : r.netPct > 0.05 ? 'text-hub-yellow' : 'text-neutral-400'}`}>
                          {r.netPct.toFixed(3)}%
                        </span>
                        <div className="text-[10px] text-neutral-600">fee {r.feePct.toFixed(3)}%</div>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="font-mono text-neutral-400">
                          {r.spreadPct.toFixed(3)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <ExchangeLogo exchange={r.highExchange} size={14} />
                          {(() => { const ref = getExchangeReferralUrl(r.highExchange); return ref ? (
                            <a href={ref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-400 text-xs hover:text-hub-yellow transition">{r.highExchange}</a>
                          ) : (
                            <span className="text-green-400 text-xs">{r.highExchange}</span>
                          ); })()}
                          <span className="font-mono text-[11px] text-neutral-500">${fp(r.highPrice)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <ExchangeLogo exchange={r.lowExchange} size={14} />
                          {(() => { const ref = getExchangeReferralUrl(r.lowExchange); return ref ? (
                            <a href={ref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-red-400 text-xs hover:text-hub-yellow transition">{r.lowExchange}</a>
                          ) : (
                            <span className="text-red-400 text-xs">{r.lowExchange}</span>
                          ); })()}
                          <span className="font-mono text-[11px] text-neutral-500">${fp(r.lowPrice)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <div className="font-mono text-xs text-neutral-300">{usdCompact(r.minSideVolume)}</div>
                        <div className="text-[10px] text-neutral-600">size ~{usdCompact(r.maxTradableUsd)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500 hidden md:table-cell">
                        {r.exchangeCount}
                      </td>
                    </tr>
                  </Link>
                ))}
                {sorted.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-600">No actionable spreads passed the default liquidity and fee filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DataFreshness in header handles last-update display */}
      </main>
      <ReferralBanner />
      <Footer />
    </div>
  );
}

function QualityTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{hint}</div>
    </div>
  );
}

function PresetGroup<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              value === option.value
                ? 'border-hub-yellow/40 bg-hub-yellow/10 text-hub-yellow'
                : 'border-white/[0.06] bg-white/[0.03] text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
