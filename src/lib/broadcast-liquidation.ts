/**
 * broadcastLargeliqs — send $1M+ liquidation alerts to a public Telegram channel.
 *
 * Set TELEGRAM_BROADCAST_CHANNEL_ID to a channel/group chat ID (e.g. "@InfoHubAlerts"
 * or a numeric ID like "-1001234567890"). The bot must be an admin of the channel.
 * When the env var is not set, this is a no-op — safe to call unconditionally.
 *
 * Dedup: uses a simple in-process set of (exchange, symbol, timestamp) tuples so
 * one-minute cron runs don't re-broadcast the same liquidation row if it appears
 * in two consecutive fetches (Binance returns the last 200 force orders, not just
 * the ones since the last poll).
 */

import { sendMessage } from './telegram';

interface LiqRow {
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  price: number;
  valueUsd: number;
  timestamp: number;
}

const MIN_BROADCAST_USD = 1_000_000;

// Simple dedup window: track (key) of recently broadcast events for 3 minutes
const recentlyBroadcast = new Map<string, number>();
const DEDUP_TTL_MS = 3 * 60 * 1000;

function dedupKey(row: LiqRow): string {
  // Round timestamp to nearest 30s to catch near-duplicate fetches
  const roundedTs = Math.floor(row.timestamp / 30_000) * 30_000;
  return `${row.exchange}:${row.symbol}:${row.side}:${roundedTs}`;
}

function pruneDedup() {
  const now = Date.now();
  Array.from(recentlyBroadcast).forEach(([key, ts]) => {
    if (now - ts > DEDUP_TTL_MS) recentlyBroadcast.delete(key);
  });
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  if (n >= 10_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function sizeEmoji(valueUsd: number): string {
  if (valueUsd >= 10_000_000) return '🔥🔥🔥';
  if (valueUsd >= 5_000_000) return '🔥🔥';
  if (valueUsd >= 2_000_000) return '🔥';
  return '⚡';
}

function buildMessage(rows: LiqRow[]): string {
  if (rows.length === 1) {
    const r = rows[0];
    const emoji = sizeEmoji(r.valueUsd);
    return `${emoji} <b>${fmtUsd(r.valueUsd)} ${r.symbol} ${r.side === 'long' ? 'Long' : 'Short'} Liquidated</b>

Exchange: ${r.exchange}
Price: ${fmtPrice(r.price)}

📊 <a href="https://info-hub.io/liquidations">See all liquidations</a> · <a href="https://info-hub.io">InfoHub</a>`;
  }

  // Multiple big liqs — compact format
  const total = rows.reduce((s, r) => s + r.valueUsd, 0);
  const lines = rows
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 5)
    .map((r) => `  ${sizeEmoji(r.valueUsd)} <b>${fmtUsd(r.valueUsd)}</b> ${r.symbol} ${r.side === 'long' ? 'Long' : 'Short'} @ ${r.exchange}`)
    .join('\n');

  return `🚨 <b>${rows.length} Large Liquidations · ${fmtUsd(total)} total</b>

${lines}

📊 <a href="https://info-hub.io/liquidations">See all liquidations</a> · <a href="https://info-hub.io">InfoHub</a>`;
}

export async function broadcastLargeLiqs(rows: LiqRow[]): Promise<void> {
  const channelId = process.env.TELEGRAM_BROADCAST_CHANNEL_ID?.trim();
  if (!channelId) return; // feature disabled

  pruneDedup();

  const toSend = rows.filter((r) => {
    if (r.valueUsd < MIN_BROADCAST_USD) return false;
    const key = dedupKey(r);
    if (recentlyBroadcast.has(key)) return false;
    recentlyBroadcast.set(key, Date.now());
    return true;
  });

  if (toSend.length === 0) return;

  const msg = buildMessage(toSend);
  const ok = await sendMessage(channelId, msg, 'HTML');
  if (!ok) {
    console.error(`[broadcast-liquidation] Failed to send to channel ${channelId}`);
  } else {
    console.log(`[broadcast-liquidation] Sent ${toSend.length} liq alert(s) to ${channelId}`);
  }
}
