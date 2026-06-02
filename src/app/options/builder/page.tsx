'use client';

/**
 * /options/builder — Options strategy & payoff builder (shortlist item 3, part 2).
 *
 * The genuine gap on /options (which is OI/IV/max-pain only): a place to model
 * multi-leg strategies. Pulls spot + the per-strike mark-IV smile + expiries from
 * /api/options, estimates each leg's premium via Black-Scholes (lib/options/payoff),
 * and draws the expiry payoff curve with breakevens, max P/L, and net Greeks.
 *
 * Premiums are THEORETICAL (Black-Scholes off the mark-IV smile), not live
 * bid/ask — surfaced for shape/breakeven/Greeks intuition, labelled as such.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Layers, Plus, Trash2, ArrowLeft } from 'lucide-react';
import {
  bsPrice,
  payoffCurve,
  netPremium,
  findBreakevens,
  netGreeks,
  type Side,
  type OptionType,
  type Leg,
} from '@/lib/options/payoff';

const CURRENCIES = ['BTC', 'ETH', 'SOL'] as const;
type Currency = (typeof CURRENCIES)[number];

interface IVPoint { strike: number; callIV: number; putIV: number }
interface ExpiryEntry { date: string; expiry: number; totalOI: number; maxPain?: number }
interface OptionsResp {
  currency: string;
  underlyingPrice: number;
  maxPain: number;
  ivSmile: IVPoint[];
  expiryBreakdown?: ExpiryEntry[];
}

interface LegSpec { id: number; side: Side; type: OptionType; strike: number; qty: number }

const DAY_MS = 86_400_000;

/** Deribit-style mark IV arrives as a percent (e.g. 65 = 65%); some feeds use a
 *  decimal. For BTC/ETH/SOL, IV is always ≥ ~30%, so >3 ⇒ percent ⇒ /100. */
function toDecimalIV(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 3 ? raw / 100 : raw;
}

type PresetKey = 'long-call' | 'long-put' | 'bull-call' | 'bear-put' | 'straddle' | 'strangle' | 'iron-condor';
const PRESETS: { key: PresetKey; label: string; legs: (atm: number, step: (n: number) => number) => Omit<LegSpec, 'id'>[] }[] = [
  { key: 'long-call', label: 'Long Call', legs: (atm) => [{ side: 'long', type: 'call', strike: atm, qty: 1 }] },
  { key: 'long-put', label: 'Long Put', legs: (atm) => [{ side: 'long', type: 'put', strike: atm, qty: 1 }] },
  { key: 'bull-call', label: 'Bull Call Spread', legs: (atm, step) => [
    { side: 'long', type: 'call', strike: atm, qty: 1 },
    { side: 'short', type: 'call', strike: step(2), qty: 1 },
  ] },
  { key: 'bear-put', label: 'Bear Put Spread', legs: (atm, step) => [
    { side: 'long', type: 'put', strike: atm, qty: 1 },
    { side: 'short', type: 'put', strike: step(-2), qty: 1 },
  ] },
  { key: 'straddle', label: 'Long Straddle', legs: (atm) => [
    { side: 'long', type: 'call', strike: atm, qty: 1 },
    { side: 'long', type: 'put', strike: atm, qty: 1 },
  ] },
  { key: 'strangle', label: 'Long Strangle', legs: (atm, step) => [
    { side: 'long', type: 'call', strike: step(2), qty: 1 },
    { side: 'long', type: 'put', strike: step(-2), qty: 1 },
  ] },
  { key: 'iron-condor', label: 'Iron Condor', legs: (atm, step) => [
    { side: 'long', type: 'put', strike: step(-4), qty: 1 },
    { side: 'short', type: 'put', strike: step(-2), qty: 1 },
    { side: 'short', type: 'call', strike: step(2), qty: 1 },
    { side: 'long', type: 'call', strike: step(4), qty: 1 },
  ] },
];

let LEG_SEQ = 1;

export default function OptionsBuilderPage() {
  const [currency, setCurrency] = useState<Currency>('BTC');
  const [data, setData] = useState<OptionsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiryTs, setExpiryTs] = useState<number | null>(null);
  const [legs, setLegs] = useState<LegSpec[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/options?currency=${currency}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json() as Promise<OptionsResp>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        // Default expiry: the nearest with OI.
        const first = json.expiryBreakdown?.[0];
        setExpiryTs(first ? first.expiry : Date.now() + 30 * DAY_MS);
        setLegs([]);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load options data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currency]);

  const spot = data?.underlyingPrice ?? 0;
  const strikes = useMemo(
    () => (data?.ivSmile ?? []).map((p) => p.strike).filter((s) => s > 0).sort((a, b) => a - b),
    [data],
  );

  // IV (decimal) at the strike nearest `strike`, for the given option type.
  const ivAt = useCallback(
    (strike: number, type: OptionType): number => {
      const smile = data?.ivSmile ?? [];
      if (smile.length === 0) return 0;
      let best = smile[0];
      for (const p of smile) if (Math.abs(p.strike - strike) < Math.abs(best.strike - strike)) best = p;
      return toDecimalIV(type === 'call' ? best.callIV : best.putIV);
    },
    [data],
  );

  const tYears = useMemo(() => {
    if (!expiryTs) return 0;
    return Math.max(0, (expiryTs - Date.now()) / (365 * DAY_MS));
  }, [expiryTs]);

  // Price each leg via Black-Scholes off the smile → lib Leg[] with premiums.
  const pricedLegs: Leg[] = useMemo(
    () => legs.map((l) => ({
      side: l.side,
      type: l.type,
      strike: l.strike,
      qty: l.qty,
      premium: bsPrice({ type: l.type, spot, strike: l.strike, t: tYears, iv: ivAt(l.strike, l.type) }),
    })),
    [legs, spot, tYears, ivAt],
  );

  // Payoff curve across a range bracketing spot + all strikes.
  const { curve, priceLo, priceHi } = useMemo(() => {
    if (pricedLegs.length === 0 || spot <= 0) return { curve: [], priceLo: 0, priceHi: 0 };
    const pts = [spot, ...pricedLegs.map((l) => l.strike)];
    const lo = Math.max(0, Math.min(...pts) * 0.78);
    const hi = Math.max(...pts) * 1.22;
    return { curve: payoffCurve(pricedLegs, lo, hi, 140), priceLo: lo, priceHi: hi };
  }, [pricedLegs, spot]);

  const stats = useMemo(() => {
    if (pricedLegs.length === 0) return null;
    const np = netPremium(pricedLegs);
    const bes = findBreakevens(curve);
    const pnls = curve.map((p) => p.pnl);
    const g = netGreeks(pricedLegs, spot, tYears, (leg) => ivAt(leg.strike, leg.type));
    return {
      netPremium: np,
      breakevens: bes,
      maxProfit: pnls.length ? Math.max(...pnls) : 0,
      maxLoss: pnls.length ? Math.min(...pnls) : 0,
      greeks: g,
    };
  }, [pricedLegs, curve, spot, tYears, ivAt]);

  const atmStrike = useMemo(() => {
    if (strikes.length === 0 || spot <= 0) return 0;
    return strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best), strikes[0]);
  }, [strikes, spot]);

  const applyPreset = (key: PresetKey) => {
    if (atmStrike <= 0 || strikes.length === 0) return;
    const atmIdx = strikes.indexOf(atmStrike);
    const step = (n: number) => strikes[Math.max(0, Math.min(strikes.length - 1, atmIdx + n))];
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setLegs(preset.legs(atmStrike, step).map((l) => ({ ...l, id: LEG_SEQ++ })));
  };

  const addLeg = () => setLegs((ls) => [...ls, { id: LEG_SEQ++, side: 'long', type: 'call', strike: atmStrike || strikes[0] || 0, qty: 1 }]);
  const removeLeg = (id: number) => setLegs((ls) => ls.filter((l) => l.id !== id));
  const updateLeg = (id: number, patch: Partial<LegSpec>) => setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const fmtUsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtSigned = (n: number, dp = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}`;

  return (
    <div className="min-h-screen bg-hub-black">
      <Header />
      <main className="max-w-[1400px] mx-auto w-full px-4 py-6">
        <PageHero
          icon={Layers}
          eyebrow="Options · strategy lab"
          title="Strategy"
          accentNoun="builder"
          accent="violet"
          description={
            <>Model any multi-leg options strategy and see its payoff at expiry —
              breakevens, max profit/loss, and net Greeks. Premiums are estimated
              from the live mark-IV smile (theoretical mid, not a live quote).</>
          }
          actions={
            <Link
              href="/options"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Options
            </Link>
          }
          className="mb-4"
        />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${currency === c ? 'bg-hub-yellow text-black' : 'bg-white/[0.03] text-neutral-400 hover:text-white'}`}
              >{c}</button>
            ))}
          </div>
          {data && (data.expiryBreakdown?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              Expiry
              <select
                value={expiryTs ?? ''}
                onChange={(e) => setExpiryTs(Number(e.target.value))}
                className="select-caret bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-hub-yellow/50 focus:outline-none"
              >
                {data.expiryBreakdown!.map((e) => (
                  <option key={e.date} value={e.expiry}>
                    {e.date} ({Math.max(0, Math.round((e.expiry - Date.now()) / DAY_MS))}d)
                  </option>
                ))}
              </select>
            </label>
          )}
          {spot > 0 && (
            <span className="text-xs text-neutral-400">
              Spot <span className="font-mono font-semibold text-white">${spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-hub-yellow/30 border-t-hub-yellow rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="card-premium p-6 text-center text-sm text-rekt-mild">Couldn&apos;t load options data · {error}</div>
        )}

        {!loading && !error && data && (
          <>
            {/* Strategy presets */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 self-center mr-1">Presets</span>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  disabled={atmStrike <= 0}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:border-hub-yellow/40 hover:text-white transition-colors disabled:opacity-40"
                >{p.label}</button>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Leg editor */}
              <div className="card-premium p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">Legs</h2>
                  <button onClick={addLeg} className="inline-flex items-center gap-1 text-xs text-hub-yellow hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add leg
                  </button>
                </div>
                {legs.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-6 text-center">Pick a preset above or add a leg to start modelling.</p>
                ) : (
                  <div className="space-y-2">
                    {legs.map((l) => {
                      const prem = bsPrice({ type: l.type, spot, strike: l.strike, t: tYears, iv: ivAt(l.strike, l.type) });
                      return (
                        <div key={l.id} className="flex items-center gap-1.5 text-xs">
                          <select value={l.side} onChange={(e) => updateLeg(l.id, { side: e.target.value as Side })}
                            className={`select-caret bg-white/[0.04] border rounded px-1.5 py-1 focus:outline-none ${l.side === 'long' ? 'text-emerald-300 border-emerald-500/30' : 'text-rekt-mild border-rose-500/30'}`}>
                            <option value="long">Long</option>
                            <option value="short">Short</option>
                          </select>
                          <select value={l.type} onChange={(e) => updateLeg(l.id, { type: e.target.value as OptionType })}
                            className="select-caret bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-1 text-white focus:outline-none">
                            <option value="call">Call</option>
                            <option value="put">Put</option>
                          </select>
                          <select value={l.strike} onChange={(e) => updateLeg(l.id, { strike: Number(e.target.value) })}
                            className="select-caret bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-1 text-white focus:outline-none flex-1 min-w-0">
                            {strikes.map((s) => <option key={s} value={s}>${s.toLocaleString()}</option>)}
                          </select>
                          <input type="number" min={1} value={l.qty} onChange={(e) => updateLeg(l.id, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                            className="bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-1 text-white w-12 focus:outline-none" />
                          <span className="font-mono text-neutral-400 w-16 text-right" title="Theoretical premium (BS)">${prem.toFixed(0)}</span>
                          <button onClick={() => removeLeg(l.id)} className="text-neutral-600 hover:text-rekt-mild"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {stats && (
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/[0.06]">
                    <Stat label={stats.netPremium >= 0 ? 'Net credit' : 'Net debit'} value={fmtUsd(Math.abs(stats.netPremium))} tone={stats.netPremium >= 0 ? 'text-emerald-300' : 'text-amber-300'} />
                    <Stat label="Breakeven" value={stats.breakevens.length ? stats.breakevens.map((b) => `$${b.toLocaleString(undefined, { maximumFractionDigits: 0 })}`).join(' · ') : '—'} />
                    <Stat label="Max profit" value={fmtUsd(stats.maxProfit)} tone="text-emerald-300" />
                    <Stat label="Max loss" value={fmtUsd(stats.maxLoss)} tone="text-rekt-mild" />
                  </div>
                )}
              </div>

              {/* Payoff diagram + Greeks */}
              <div className="card-premium p-4">
                <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Payoff at expiry</h2>
                {curve.length > 1 ? (
                  <PayoffChart curve={curve} spot={spot} breakevens={stats?.breakevens ?? []} priceLo={priceLo} priceHi={priceHi} />
                ) : (
                  <p className="text-xs text-neutral-500 py-10 text-center">Add legs to see the payoff.</p>
                )}
                {stats && (
                  <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-white/[0.06]">
                    <Stat label="Delta" value={fmtSigned(stats.greeks.delta)} />
                    <Stat label="Gamma" value={fmtSigned(stats.greeks.gamma, 4)} />
                    <Stat label="Vega" value={fmtSigned(stats.greeks.vega)} />
                    <Stat label="Theta/day" value={fmtSigned(stats.greeks.theta)} tone={stats.greeks.theta >= 0 ? 'text-emerald-300' : 'text-rekt-mild'} />
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-neutral-600 mt-3 leading-relaxed">
              Premiums &amp; Greeks are theoretical — Black-Scholes priced off the per-strike mark-IV smile across {currency} options venues, not live bid/ask.
              Use for strategy shape, breakevens and relative Greeks, not exact fills. IV is the smile&apos;s nearest-strike mark; one expiry&apos;s smile is applied.
            </p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`text-sm font-mono font-semibold mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

function PayoffChart({ curve, spot, breakevens, priceLo, priceHi }: {
  curve: { price: number; pnl: number }[];
  spot: number;
  breakevens: number[];
  priceLo: number;
  priceHi: number;
}) {
  const W = 520, H = 240, padL = 8, padR = 8, padT = 8, padB = 18;
  const pnls = curve.map((c) => c.pnl);
  const maxP = Math.max(...pnls, 0);
  const minP = Math.min(...pnls, 0);
  const range = maxP - minP || 1;
  const x = (price: number) => padL + ((price - priceLo) / (priceHi - priceLo || 1)) * (W - padL - padR);
  const y = (pnl: number) => padT + (1 - (pnl - minP) / range) * (H - padT - padB);
  const zeroY = y(0);
  const line = curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.price).toFixed(1)},${y(c.pnl).toFixed(1)}`).join(' ');
  // Profit/loss fill polygons to the zero line.
  const areaTop = `${curve.map((c) => `${x(c.price).toFixed(1)},${y(c.pnl).toFixed(1)}`).join(' ')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Strategy payoff at expiry">
      {/* clip so fills don't bleed past the zero line */}
      <defs>
        <clipPath id="above-zero"><rect x={0} y={0} width={W} height={zeroY} /></clipPath>
        <clipPath id="below-zero"><rect x={0} y={zeroY} width={W} height={H - zeroY} /></clipPath>
      </defs>
      <polygon points={`${padL},${zeroY} ${areaTop} ${W - padR},${zeroY}`} fill="rgba(52,211,153,0.12)" clipPath="url(#above-zero)" />
      <polygon points={`${padL},${zeroY} ${areaTop} ${W - padR},${zeroY}`} fill="rgba(251,113,133,0.12)" clipPath="url(#below-zero)" />
      {/* zero line */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3" />
      {/* payoff curve */}
      <path d={line} fill="none" stroke="var(--hub-accent, #FFA500)" strokeWidth={2} />
      {/* spot marker */}
      <line x1={x(spot)} y1={padT} x2={x(spot)} y2={H - padB} stroke="rgba(125,211,252,0.5)" strokeWidth={1} />
      <text x={x(spot)} y={H - 6} fill="#7dd3fc" fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)">spot</text>
      {/* breakeven markers */}
      {breakevens.map((b, i) => (
        <g key={i}>
          <circle cx={x(b)} cy={zeroY} r={3} fill="#fff" />
          <text x={x(b)} y={zeroY - 6} fill="#fff" fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)">
            ${b.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </text>
        </g>
      ))}
    </svg>
  );
}
