'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useFundingRates } from '@/hooks/useSWRApi';
import { EXCHANGE_FEES, getExchangeTradeUrl } from '@/lib/constants';
import type { FundingRateData } from '@/lib/api/types';
import { ExchangeLogo } from '@/components/ExchangeLogos';
import {
  TrendingDown, TrendingUp, ExternalLink, ChevronDown, ChevronUp,
  RefreshCw, Calculator, Info, Download,
} from 'lucide-react';

// ── Carry math ────────────────────────────────────────────────────────────────

function settleHrs(fr: Pick<FundingRateData, 'fundingIntervalHours' | 'fundingInterval'>): number {
  if (fr.fundingIntervalHours) return fr.fundingIntervalHours;
  if (fr.fundingInterval === '1h') return 1;
  if (fr.fundingInterval === '4h') return 4;
  return 8;
}

function toApr(rate: number, h: number): number {
  return rate * (8760 / h) * 100;
}

function toDailyPct(rate: number, h: number): number {
  return rate * (24 / h) * 100;
}

function roundTripPct(exchange: string): number {
  const f = EXCHANGE_FEES[exchange];
  return f ? f.taker * 2 : 0.10;
}

function toBreakEven(rate: number, h: number, feePct: number): number | null {
  const daily = Math.abs(toDailyPct(rate, h));
  return daily > 0 ? feePct / daily : null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CarryMode = 'short' | 'long';
type VenueFilter = 'all' | 'cex' | 'dex';

const DEX_NAMES = new Set([
  'Hyperliquid', 'dYdX', 'Aster', 'Lighter', 'Aevo', 'GMX', 'gTrade',
  'Extended', 'Variational', 'edgeX', 'Nado', 'Backpack', 'Orderly', 'Paradex',
]);

interface VenueEntry {
  exchange: string;
  rate: number;
  apr: number;
  dailyPct: number;
  feePct: number;
  breakEven: number | null;
  tradeUrl: string | null;
}

interface CarryRow {
  symbol: string;
  best: VenueEntry;
  venues: VenueEntry[];
}

// ── Data processing ───────────────────────────────────────────────────────────

function buildRows(
  data: FundingRateData[],
  mode: CarryMode,
  venueFilter: VenueFilter,
): CarryRow[] {
  const filtered = data.filter((fr) => {
    const isDex = DEX_NAMES.has(fr.exchange);
    if (venueFilter === 'cex' && isDex) return false;
    if (venueFilter === 'dex' && !isDex) return false;
    if (mode === 'short') return (fr.fundingRate ?? 0) > 0;
    return (fr.fundingRate ?? 0) < 0;
  });

  const bySymbol = new Map<string, FundingRateData[]>();
  for (const fr of filtered) {
    const arr = bySymbol.get(fr.symbol) ?? [];
    arr.push(fr);
    bySymbol.set(fr.symbol, arr);
  }

  const rows: CarryRow[] = [];
  for (const [symbol, items] of Array.from(bySymbol)) {
    const venues: VenueEntry[] = items.map((fr: FundingRateData) => {
      const h = settleHrs(fr);
      const rate = fr.fundingRate ?? 0;
      const fee = roundTripPct(fr.exchange);
      return {
        exchange: fr.exchange,
        rate,
        apr: toApr(rate, h),
        dailyPct: toDailyPct(rate, h),
        feePct: fee,
        breakEven: toBreakEven(rate, h, fee),
        tradeUrl: getExchangeTradeUrl(fr.exchange, symbol),
      };
    });

    venues.sort((a, b) =>
      mode === 'short' ? b.apr - a.apr : a.apr - b.apr,
    );

    const best = venues[0];
    if (!best) continue;

    rows.push({ symbol, best, venues });
  }

  rows.sort((a, b) =>
    mode === 'short'
      ? b.best.apr - a.best.apr
      : a.best.apr - b.best.apr,
  );

  return rows;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtRate(r: number): string {
  return `${r >= 0 ? '+' : ''}${(r * 100).toFixed(4)}%`;
}

function fmtApr(apr: number): string {
  const abs = Math.abs(apr);
  if (abs >= 1000) return `${(apr / 1000).toFixed(1)}k%`;
  return `${apr.toFixed(1)}%`;
}

function fmtDays(d: number | null): string {
  if (d === null || !isFinite(d) || d <= 0) return '—';
  if (d < 1) return `${(d * 24).toFixed(1)}h`;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TopCard({ row, rank, mode }: { row: CarryRow; rank: number; mode: CarryMode }) {
  const accent = mode === 'short' ? 'emerald' : 'sky';
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-widest text-${accent}-400`}>
          #{rank} {mode === 'short' ? 'Short carry' : 'Long carry'}
        </span>
        <span className="text-[10px] text-neutral-500">{row.best.exchange}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-white">{row.symbol}</span>
        <span className={`text-xs font-semibold ${mode === 'short' ? 'text-emerald-400' : 'text-sky-400'}`}>
          {fmtApr(row.best.apr)} APR
        </span>
      </div>
      <div className="text-[11px] text-neutral-400 flex items-center gap-3">
        <span>8h: <span className="font-mono">{fmtRate(row.best.rate)}</span></span>
        <span>Fee RT: <span className="font-mono">{row.best.feePct.toFixed(3)}%</span></span>
        <span>BE: <span className="font-mono">{fmtDays(row.best.breakEven)}</span></span>
      </div>
      {row.best.tradeUrl && (
        <a
          href={row.best.tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-${accent}-400 hover:text-${accent}-300`}
        >
          Trade on {row.best.exchange} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function VenueRow({ v, mode }: { v: VenueEntry; mode: CarryMode }) {
  const accent = mode === 'short' ? 'text-emerald-400' : 'text-sky-400';
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 text-xs border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
      <ExchangeLogo exchange={v.exchange} size={14} className="shrink-0" />
      <span className="text-neutral-300 w-24 truncate">{v.exchange}</span>
      <span className={`font-mono w-20 ${accent}`}>{fmtRate(v.rate)}</span>
      <span className={`font-mono w-20 font-semibold ${accent}`}>{fmtApr(v.apr)} APR</span>
      <span className="font-mono text-neutral-400 w-16">{v.feePct.toFixed(3)}% RT</span>
      <span className="font-mono text-neutral-400 w-16">{fmtDays(v.breakEven)} BE</span>
      {v.tradeUrl ? (
        <a
          href={v.tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-neutral-500 hover:text-white"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="ml-auto w-4" />
      )}
    </div>
  );
}

function TableRow({ row, mode, expanded, onToggle }: {
  row: CarryRow;
  mode: CarryMode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rateColor = mode === 'short' ? 'text-emerald-400' : 'text-sky-400';
  return (
    <>
      <tr
        className="border-b border-white/[0.05] hover:bg-white/[0.02] cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 pl-4 pr-2">
          <span className="font-semibold text-white text-sm">{row.symbol}</span>
        </td>
        <td className="py-2.5 px-2">
          <div className="flex items-center gap-1.5">
            <ExchangeLogo exchange={row.best.exchange} size={14} className="shrink-0" />
            <span className="text-neutral-300 text-xs">{row.best.exchange}</span>
          </div>
        </td>
        <td className={`py-2.5 px-2 font-mono text-xs ${rateColor}`}>
          {fmtRate(row.best.rate)}
        </td>
        <td className={`py-2.5 px-2 font-mono text-sm font-bold ${rateColor}`}>
          {fmtApr(row.best.apr)}
        </td>
        <td className="py-2.5 px-2 font-mono text-xs text-neutral-400">
          {row.best.feePct.toFixed(3)}%
        </td>
        <td className="py-2.5 px-2 font-mono text-xs text-neutral-400">
          {fmtDays(row.best.breakEven)}
        </td>
        <td className="py-2.5 px-2">
          {row.best.tradeUrl && (
            <a
              href={row.best.tradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-hub-yellow hover:text-amber-300"
            >
              Trade <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </td>
        <td className="py-2.5 pr-3 pl-1">
          <div className="text-neutral-500 hover:text-neutral-300">
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.015]">
          <td colSpan={8} className="py-0">
            <div className="py-1">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 px-3 pt-2 pb-1">
                All venues for {row.symbol}
              </div>
              {row.venues.map((v) => (
                <VenueRow key={v.exchange} v={v} mode={mode} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCsv(rows: CarryRow[], mode: CarryMode) {
  const headers = ['Symbol', 'Exchange', 'Rate%', 'APR%', 'Daily%', 'FeeRT%', 'BreakEven'];
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.best.exchange,
      (r.best.rate * 100).toFixed(6),
      r.best.apr.toFixed(2),
      r.best.dailyPct.toFixed(4),
      r.best.feePct.toFixed(4),
      r.best.breakEven !== null && isFinite(r.best.breakEven) ? r.best.breakEven.toFixed(2) + 'd' : '',
    ].join(','),
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `carry-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CarryPage() {
  const [mode, setMode] = useState<CarryMode>('short');
  const [venueFilter, setVenueFilter] = useState<VenueFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rawRates, isLoading, lastUpdate, refresh } = useFundingRates('crypto');

  const rows = useMemo(
    () => buildRows(rawRates ?? [], mode, venueFilter),
    [rawRates, mode, venueFilter],
  );

  const top3 = rows.slice(0, 3);

  const toggleRow = (symbol: string) =>
    setExpanded((prev) => (prev === symbol ? null : symbol));

  const modeShort = mode === 'short';
  const accent = modeShort ? 'emerald' : 'sky';
  const ModeIcon = modeShort ? TrendingDown : TrendingUp;

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main id="main-content" className="max-w-[1200px] mx-auto px-4 py-6">

        {/* ── Title ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-5 h-5 text-hub-yellow" />
              <h1 className="text-xl font-bold text-white">Carry Calculator</h1>
            </div>
            <p className="text-sm text-neutral-400">
              Best funding-rate carry opportunities across {Object.keys(EXCHANGE_FEES).length} venues — net-of-fee APR & break-even.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lastUpdate && (
              <span className="text-[11px] text-neutral-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs text-neutral-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => downloadCsv(rows, mode)}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs text-neutral-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>

        {/* ── Mode + venue tabs ── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
            {([
              { id: 'short', label: 'Collect as short', icon: TrendingDown, color: 'emerald' },
              { id: 'long',  label: 'Collect as long',  icon: TrendingUp,   color: 'sky' },
            ] as const).map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => { setMode(id); setExpanded(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mode === id
                    ? `bg-${color}-500/15 text-${color}-300 border border-${color}-400/30`
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
            {(['all', 'cex', 'dex'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setVenueFilter(v); setExpanded(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  venueFilter === v
                    ? 'bg-white/[0.08] text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ── How it works note ── */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] text-[11px] text-neutral-500 mb-5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-600" />
          <span>
            {modeShort
              ? 'Short carry: go short the perp and collect positive funding from longs. APR = 8h rate × 3 × 365. Break-even = round-trip taker fee ÷ daily rate.'
              : 'Long carry: go long the perp and collect negative funding from shorts. Rare — usually only available during de-leveraging events.'}
            {' '}Click any row to compare all venues for that symbol.
          </span>
        </div>

        {/* ── Top 3 cards ── */}
        {!isLoading && top3.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {top3.map((row, i) => (
              <TopCard key={row.symbol} row={row} rank={i + 1} mode={mode} />
            ))}
          </div>
        )}

        {/* ── Main table ── */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {[
                  { label: 'Symbol',   className: 'pl-4 pr-2 w-24' },
                  { label: 'Best venue', className: 'px-2' },
                  { label: '8h rate',  className: 'px-2 w-24' },
                  { label: 'APR',      className: 'px-2 w-24' },
                  { label: 'Fee RT',   className: 'px-2 w-20', title: 'Round-trip taker fee (open + close)' },
                  { label: 'Break-even', className: 'px-2 w-24', title: 'Days of carry needed to cover the round-trip fee' },
                  { label: '',         className: 'px-2 w-20' },
                  { label: '',         className: 'pr-3 pl-1 w-8' },
                ].map(({ label, className, title }) => (
                  <th
                    key={label || Math.random()}
                    title={title}
                    className={`${className} py-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <RefreshCw className="w-5 h-5 text-neutral-600 animate-spin mx-auto mb-2" />
                    <div className="text-sm text-neutral-500">Loading funding rates…</div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <ModeIcon className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                    <div className="text-sm text-neutral-500">
                      No {modeShort ? 'positive' : 'negative'} funding opportunities right now.
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.symbol}
                    row={row}
                    mode={mode}
                    expanded={expanded === row.symbol}
                    onToggle={() => toggleRow(row.symbol)}
                  />
                ))
              )}
            </tbody>
          </table>

          {rows.length > 0 && (
            <div className="px-4 py-2 text-[10px] text-neutral-600 border-t border-white/[0.04] flex flex-wrap gap-x-4 gap-y-1">
              <span>{rows.length} symbols · sorted by APR</span>
              <span>Fees: taker open + taker close (no maker rebate assumed)</span>
              <span>APR = {modeShort ? 'positive' : 'negative'} 8h rate × 3 × 365</span>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
