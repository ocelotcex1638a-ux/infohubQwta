/**
 * broadcastMarketSignals — push critical funding / carry signals to the
 * public Telegram channel.
 *
 * Piggybacks on the /api/cron/alerts tail call (every 5 min). Set
 * TELEGRAM_BROADCAST_CHANNEL_ID to enable (same channel as large-liq alerts).
 *
 * Dedup: in-process Map keyed by (signalType, symbol, exchange) with 1-hour
 * TTL — repeated cron runs don't re-fire the same signal within 60 minutes.
 */

import { sendMessage } from './telegram';
import { fetchAllFundingRates } from './api/aggregator';
import type { FundingRateData } from './api/types';
import { getOIChanges } from '@/app/api/_shared/oi-core';

const DEDUP_TTL_MS = 60 * 60_000; // 1 hour
const recentSignals = new Map<string, number>();

type SignalTier = 'critical' | 'high';

interface MarketSignal {
  tier: SignalTier;
  type: string;
  symbol: string;
  exchange: string;
  headline: string;
  detail: string;
}

// Normalise raw funding rate to 8h-equivalent
function to8h(fr: FundingRateData): number {
  const h = fr.fundingIntervalHours
    ?? (fr.fundingInterval === '1h' ? 1 : fr.fundingInterval === '4h' ? 4 : 8);
  return fr.fundingRate * (8 / h);
}

function dedupKey(s: MarketSignal) {
  return `${s.type}|${s.symbol}|${s.exchange}`;
}

function pruneDedup() {
  const now = Date.now();
  Array.from(recentSignals).forEach(([k, ts]) => {
    if (now - ts > DEDUP_TTL_MS) recentSignals.delete(k);
  });
}

function buildTelegramMsg(signals: MarketSignal[]): string {
  if (signals.length === 1) {
    const s = signals[0];
    const tier = s.tier === 'critical' ? '🚨' : '⚡';
    return `${tier} <b>${s.headline}</b>

${s.detail}

📊 <a href="https://info-hub.io/signals">View all signals</a> · <a href="https://info-hub.io">InfoHub</a>`;
  }

  const tierEmoji = (t: SignalTier) => t === 'critical' ? '🚨' : '⚡';
  const lines = signals
    .slice(0, 5)
    .map(s => `  ${tierEmoji(s.tier)} <b>${s.symbol}</b> · ${s.headline}`)
    .join('\n');

  return `📡 <b>${signals.length} Market Signals</b>

${lines}

📊 <a href="https://info-hub.io/signals">View all signals</a> · <a href="https://info-hub.io">InfoHub</a>`;
}

function deriveOISignals(): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const { changes } = getOIChanges();
  if (changes.size === 0) return signals; // OI cache not warm yet

  const TOP_COINS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX', 'ARB', 'SUI', 'LINK']);

  changes.forEach((ch, sym) => {
    if (!TOP_COINS.has(sym)) return;
    const p1h = ch.pct1h;
    const p4h = ch.pct4h;

    // 1h OI surge/dump — very fast and significant
    if (p1h !== undefined) {
      if (p1h >= 15) {
        signals.push({
          tier: p1h >= 25 ? 'critical' : 'high',
          type: 'oi_surge_1h',
          symbol: sym,
          exchange: '',
          headline: `${sym} OI surged +${p1h.toFixed(0)}% in 1h`,
          detail: `Rapid open interest build — new positions opening fast. Watch for follow-through or squeeze.`,
        });
      } else if (p1h <= -15) {
        signals.push({
          tier: p1h <= -25 ? 'critical' : 'high',
          type: 'oi_dump_1h',
          symbol: sym,
          exchange: '',
          headline: `${sym} OI dropped ${p1h.toFixed(0)}% in 1h`,
          detail: `Fast deleveraging event — large positions closing. Potential trend reversal or flush.`,
        });
      }
    }

    // 4h OI surge — less urgent but still notable
    if (p4h !== undefined && Math.abs(p4h) >= 20 && (p1h === undefined || Math.abs(p1h) < 15)) {
      const dir = p4h > 0 ? 'surged' : 'dropped';
      signals.push({
        tier: 'high',
        type: p4h > 0 ? 'oi_surge_4h' : 'oi_dump_4h',
        symbol: sym,
        exchange: '',
        headline: `${sym} OI ${dir} ${p4h > 0 ? '+' : ''}${p4h.toFixed(0)}% in 4h`,
        detail: `${p4h > 0 ? 'Significant position build — bullish momentum.' : 'Significant deleveraging — watch for trend shift.'}`,
      });
    }
  });

  return signals;
}

function deriveSignals(rates: FundingRateData[]): MarketSignal[] {
  const signals: MarketSignal[] = [];

  // Focus on high-OI coins to reduce noise
  const TOP_COINS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'AVAX', 'ARB', 'SUI', 'LINK']);

  for (const fr of rates) {
    if (!TOP_COINS.has(fr.symbol)) continue;
    if (typeof fr.fundingRate !== 'number' || !Number.isFinite(fr.fundingRate)) continue;

    const rate8h = to8h(fr);
    const apr = rate8h * 8760 / 8 * 100; // percent per year

    // Extreme carry: longs paying outrageous rate
    if (rate8h >= 0.005) { // 0.5% per 8h = ~219% APR
      signals.push({
        tier: 'critical',
        type: 'extreme_carry',
        symbol: fr.symbol,
        exchange: fr.exchange,
        headline: `${fr.symbol} extreme funding on ${fr.exchange}`,
        detail: `Rate: ${(rate8h * 100).toFixed(3)}% / 8h (${apr.toFixed(0)}% APR). Longs paying heavily — short pressure expected.`,
      });
    } else if (rate8h >= 0.003) { // 0.3% per 8h = ~131% APR
      signals.push({
        tier: 'high',
        type: 'high_carry',
        symbol: fr.symbol,
        exchange: fr.exchange,
        headline: `${fr.symbol} high funding on ${fr.exchange}`,
        detail: `Rate: ${(rate8h * 100).toFixed(3)}% / 8h (${apr.toFixed(0)}% APR). Elevated carry risk for longs.`,
      });
    }

    // Negative carry: rare and bullish — market paying shorts
    if (rate8h <= -0.0005) { // -0.05% per 8h
      signals.push({
        tier: rate8h <= -0.002 ? 'critical' : 'high',
        type: 'negative_carry',
        symbol: fr.symbol,
        exchange: fr.exchange,
        headline: `${fr.symbol} negative funding on ${fr.exchange}`,
        detail: `Rate: ${(rate8h * 100).toFixed(3)}% / 8h. Market is paying longs — bullish carry signal.`,
      });
    }
  }

  return signals;
}

export async function broadcastMarketSignals(): Promise<void> {
  const channelId = process.env.TELEGRAM_BROADCAST_CHANNEL_ID?.trim();
  if (!channelId) return;

  pruneDedup();

  let rates: FundingRateData[] = [];
  try {
    rates = await fetchAllFundingRates();
  } catch (e) {
    console.error('[broadcast-signals] fetchAllFundingRates failed:', e instanceof Error ? e.message : e);
    return;
  }

  const derived = [...deriveSignals(rates), ...deriveOISignals()];

  // Filter out already-broadcast signals
  const toSend = derived.filter((s) => {
    const key = dedupKey(s);
    if (recentSignals.has(key)) return false;
    recentSignals.set(key, Date.now());
    return true;
  });

  if (toSend.length === 0) return;

  const msg = buildTelegramMsg(toSend);
  const ok = await sendMessage(channelId, msg, 'HTML');
  if (!ok) {
    console.error('[broadcast-signals] Failed to send to channel', channelId);
    // Remove from dedup so next run retries
    toSend.forEach(s => recentSignals.delete(dedupKey(s)));
  } else {
    console.log(`[broadcast-signals] Sent ${toSend.length} signal(s) to ${channelId}`);
  }
}
