/**
 * GET /api/vol-surface?currency=BTC|ETH
 *
 * Implied volatility surface from Deribit public options data.
 * Returns per-expiry ATM IV, 25d skew, and a (moneyness × expiry) IV grid.
 * Cache: 90s.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Moneyness buckets for the heatmap grid (strike / spot)
const MONEYNESS = [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.30, 1.40, 1.50];

interface DeribitOption {
  instrument_name: string;
  mark_iv?: number;
  open_interest?: number;
  underlying_price?: number;
  strike?: number;
}

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

interface SurfaceResponse {
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
  meta: { timestamp: number; source: string; instrumentCount: number };
}

const cache = new Map<string, { body: SurfaceResponse; ts: number }>();
const CACHE_TTL = 90_000;

function parseExpiry(exp: string): Date | null {
  const m = exp.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const mo = months[m[2]];
  if (mo == null) return null;
  return new Date(Date.UTC(2000 + parseInt(m[3], 10), mo, day, 8, 0, 0));
}

export async function GET(request: NextRequest) {
  const cur = (request.nextUrl.searchParams.get('currency') || 'BTC').toUpperCase();
  const currency: 'BTC' | 'ETH' = cur === 'ETH' ? 'ETH' : 'BTC';

  const cached = cache.get(currency);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.body, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=300' } });
  }

  try {
    const res = await fetch(
      `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
      { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'InfoHub/2.0 (info-hub.io)' } },
    );
    if (!res.ok) return NextResponse.json({ error: `Deribit ${res.status}` }, { status: 502 });
    const json = await res.json();
    const raw: DeribitOption[] = Array.isArray(json?.result) ? json.result : [];
    if (!raw.length) return NextResponse.json({ error: 'empty feed' }, { status: 502 });

    // Parse instruments
    interface Parsed {
      expiry: string;
      strike: number;
      side: 'C' | 'P';
      markIv: number;
      oi: number;
    }
    let underlying = 0;
    const byExpiry = new Map<string, Parsed[]>();

    for (const o of raw) {
      const parts = o.instrument_name.split('-');
      if (parts.length !== 4) continue;
      const [, expRaw, strikeRaw, sideRaw] = parts;
      const strike = parseFloat(strikeRaw);
      if (!Number.isFinite(strike) || strike <= 0) continue;
      const side = sideRaw === 'C' ? 'C' : sideRaw === 'P' ? 'P' : null;
      if (!side) continue;
      const markIv = typeof o.mark_iv === 'number' && o.mark_iv > 0 ? o.mark_iv : 0;
      if (!underlying && o.underlying_price) underlying = o.underlying_price;
      const list = byExpiry.get(expRaw) ?? [];
      list.push({ expiry: expRaw, strike, side, markIv, oi: o.open_interest ?? 0 });
      byExpiry.set(expRaw, list);
    }
    if (!underlying) return NextResponse.json({ error: 'no underlying price' }, { status: 502 });

    const now = Date.now();
    const termStructure: TermPoint[] = [];
    const heatmap: HeatRow[] = [];

    for (const [expiry, items] of Array.from(byExpiry)) {
      const expDate = parseExpiry(expiry);
      if (!expDate) continue;
      const dte = Math.max(0, (expDate.getTime() - now) / 86_400_000);
      if (dte < 0.5) continue; // skip same-day expiries

      // ATM strike = closest to underlying
      const strikes = Array.from(new Set(items.map((i) => i.strike)));
      const atmStrike = strikes.sort((a, b) => Math.abs(a - underlying) - Math.abs(b - underlying))[0];
      const atmOpts = items.filter((i) => i.strike === atmStrike && i.markIv > 0);
      const atmIv = atmOpts.length ? atmOpts.reduce((s, x) => s + x.markIv, 0) / atmOpts.length : 0;
      if (atmIv === 0) continue;

      // 25d-ish skew: strikes at +10% (call) and -10% (put) as proxy
      const callTarget = underlying * 1.10;
      const putTarget = underlying * 0.90;
      const nearCall = items
        .filter((i) => i.side === 'C' && i.markIv > 0)
        .sort((a, b) => Math.abs(a.strike - callTarget) - Math.abs(b.strike - callTarget))[0];
      const nearPut = items
        .filter((i) => i.side === 'P' && i.markIv > 0)
        .sort((a, b) => Math.abs(a.strike - putTarget) - Math.abs(b.strike - putTarget))[0];
      const skew25d = nearPut && nearCall ? nearPut.markIv - nearCall.markIv : 0;

      const callItems = items.filter((i) => i.side === 'C' && i.markIv > 0);
      const putItems = items.filter((i) => i.side === 'P' && i.markIv > 0);
      const callIvAvg = callItems.length ? callItems.reduce((s, x) => s + x.markIv, 0) / callItems.length : 0;
      const putIvAvg = putItems.length ? putItems.reduce((s, x) => s + x.markIv, 0) / putItems.length : 0;
      const callOi = items.filter((i) => i.side === 'C').reduce((s, x) => s + x.oi, 0);
      const putOi = items.filter((i) => i.side === 'P').reduce((s, x) => s + x.oi, 0);

      // Max pain
      let maxPain: number | null = null;
      let minPainVal = Infinity;
      for (const k of strikes) {
        let pain = 0;
        for (const g of items) {
          if (g.oi <= 0) continue;
          if (g.side === 'C' && k > g.strike) pain += g.oi * (k - g.strike);
          if (g.side === 'P' && k < g.strike) pain += g.oi * (g.strike - k);
        }
        if (pain < minPainVal) { minPainVal = pain; maxPain = k; }
      }

      termStructure.push({
        expiry,
        expiryDate: expDate.toISOString().slice(0, 10),
        dte: Number(dte.toFixed(1)),
        atmIv: Number(atmIv.toFixed(2)),
        skew25d: Number(skew25d.toFixed(2)),
        callIvAvg: Number(callIvAvg.toFixed(2)),
        putIvAvg: Number(putIvAvg.toFixed(2)),
        callOi: Number(callOi.toFixed(0)),
        putOi: Number(putOi.toFixed(0)),
        maxPain,
      });

      // Build heatmap cells for this expiry
      const cells: HeatCell[] = MONEYNESS.map((m) => {
        const targetStrike = underlying * m;
        const nearestStrike = strikes
          .filter((k) => Math.abs(k - targetStrike) < targetStrike * 0.08) // within 8% of target
          .sort((a, b) => Math.abs(a - targetStrike) - Math.abs(b - targetStrike))[0];

        if (!nearestStrike) return { moneyness: m, callIv: 0, putIv: 0, avgIv: 0 };

        const callIv = items.filter((i) => i.strike === nearestStrike && i.side === 'C' && i.markIv > 0)
          .reduce((s, x, _, arr) => (arr.length ? s + x.markIv / arr.length : s), 0);
        const putIv = items.filter((i) => i.strike === nearestStrike && i.side === 'P' && i.markIv > 0)
          .reduce((s, x, _, arr) => (arr.length ? s + x.markIv / arr.length : s), 0);
        const avgIv = callIv && putIv ? (callIv + putIv) / 2 : callIv || putIv;

        return {
          moneyness: m,
          callIv: Number(callIv.toFixed(2)),
          putIv: Number(putIv.toFixed(2)),
          avgIv: Number(avgIv.toFixed(2)),
        };
      });

      heatmap.push({ expiry, dte: Number(dte.toFixed(1)), cells });
    }

    termStructure.sort((a, b) => a.dte - b.dte);
    heatmap.sort((a, b) => a.dte - b.dte);

    // Summary
    const near30 = termStructure
      .filter((e) => e.atmIv > 0)
      .slice()
      .sort((a, b) => Math.abs(a.dte - 30) - Math.abs(b.dte - 30))[0];
    const shortSlice = termStructure.filter((e) => e.dte > 0 && e.dte < 14 && e.atmIv > 0);
    const longSlice = termStructure.filter((e) => e.dte >= 90 && e.atmIv > 0);
    const shortAvg = shortSlice.length ? shortSlice.reduce((s, e) => s + e.atmIv, 0) / shortSlice.length : 0;
    const longAvg = longSlice.length ? longSlice.reduce((s, e) => s + e.atmIv, 0) / longSlice.length : 0;
    const totalCallOi = termStructure.reduce((s, e) => s + e.callOi, 0);
    const totalPutOi = termStructure.reduce((s, e) => s + e.putOi, 0);

    const body: SurfaceResponse = {
      currency,
      underlying,
      termStructure,
      heatmap,
      summary: {
        atmIv30d: near30?.atmIv ?? null,
        skew25d30d: near30?.skew25d ?? null,
        termSlope: shortAvg && longAvg ? Number((shortAvg - longAvg).toFixed(2)) : null,
        putCallRatio: totalCallOi > 0 ? Number((totalPutOi / totalCallOi).toFixed(3)) : 0,
      },
      meta: { timestamp: Date.now(), source: 'deribit', instrumentCount: raw.length },
    };

    if (termStructure.length > 0) {
      cache.set(currency, { body, ts: Date.now() });
    }
    return NextResponse.json(body, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[vol-surface]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'upstream error' }, { status: 502 });
  }
}
