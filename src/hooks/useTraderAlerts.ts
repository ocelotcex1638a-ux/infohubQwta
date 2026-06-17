'use client';

import { useEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { type TraderBookmark, useTraderBookmarks } from './useTraderBookmarks';
import {
  diffTrackedPositions,
  formatVenueLabel,
  isSpecialistPosition,
  shouldEmitSmartAlert,
  type AlertTier,
  type AlertTraderType,
  type BrowserAlertKind,
  type TrackedPosition,
  type TraderAlertMeta,
} from '@/lib/trader-alerts';

/**
 * Browser-only copy-trading alerts.
 *
 * Polls bookmarked traders across all supported venues, compares their
 * open positions against a local snapshot, and emits a rolling activity
 * feed plus optional browser notifications.
 */

export type AlertKind = BrowserAlertKind;
type TrackedVenue = 'hyperliquid' | 'gtrade' | 'gmx-arbitrum' | 'gmx-avalanche';

export interface TraderAlert {
  id: string;
  address: string;
  displayName: string | null;
  coin: string;
  venue: TrackedVenue;
  kind: AlertKind;
  details: string;
  sizeUsd: number;
  isLong: boolean;
  timestamp: number;
  tier?: AlertTier | null;
  traderType?: AlertTraderType | null;
  signalScore?: number | null;
  specialist?: boolean;
}

interface TraderSnapshot {
  address: string;
  fetchedAt: number;
  positions: TrackedPosition[];
}

interface SmartMoneyLeaderboardEntry {
  address: string;
  tier?: AlertTier | null;
  traderType?: AlertTraderType | null;
  signalScore?: number | null;
  assetBreakdown?: Array<{ symbol?: string | null }>;
}

const SNAPSHOT_KEY = 'infohub:trader-alerts-snapshots';
const FEED_KEY = 'infohub:trader-alerts-feed';
const EVENT = 'infohub:trader-alerts-changed';
const POLL_INTERVAL = 120_000;
const SIZE_CHANGE_THRESHOLD = 0.10;
const MAX_FEED = 50;
const SETTINGS_KEY = 'infohub:trader-alerts-enabled';
const SMART_META_TTL = 10 * 60_000;
const DEFAULT_VENUES: TrackedVenue[] = ['hyperliquid', 'gmx-arbitrum', 'gmx-avalanche', 'gtrade'];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // Ignore quota errors.
  }
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => cb();
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', h);
  };
}

function getFeedSnapshot(): string {
  if (typeof window === 'undefined') return '[]';
  return window.localStorage.getItem(FEED_KEY) ?? '[]';
}

function getFeedServerSnapshot(): string {
  return '[]';
}

function getSettingsSnapshot(): string {
  if (typeof window === 'undefined') return 'false';
  return window.localStorage.getItem(SETTINGS_KEY) ?? 'false';
}

function getSettingsServerSnapshot(): string {
  return 'false';
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

function normalizeCoin(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!text) return 'UNKNOWN';
  const match = text.match(/^[A-Z0-9]+/);
  return match?.[0] ?? text;
}

function makeTrackedPosition(
  venue: TrackedVenue,
  coin: unknown,
  isLong: unknown,
  sizeUsd: unknown,
): TrackedPosition {
  const normalizedCoin = normalizeCoin(coin);
  return {
    key: `${venue}:${normalizedCoin}`,
    venue,
    coin: normalizedCoin,
    isLong: !!isLong,
    sizeUsd: Number(sizeUsd) || 0,
  };
}

function normalizeSnapshot(address: string, value: unknown): TraderSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as {
    address?: unknown;
    fetchedAt?: unknown;
    positions?: Array<{
      key?: unknown;
      venue?: unknown;
      coin?: unknown;
      isLong?: unknown;
      sizeUsd?: unknown;
    }>;
  };
  if (!Array.isArray(raw.positions)) return null;

  const positions = raw.positions
    .map((position) => {
      if (typeof position?.key === 'string' && typeof position?.venue === 'string' && typeof position?.coin === 'string') {
        const venue = position.venue as TrackedVenue;
        return makeTrackedPosition(venue, position.coin, position.isLong, position.sizeUsd);
      }
      if (position && typeof position.coin === 'string') {
        // Older snapshots were HL-only and keyed by coin alone.
        return makeTrackedPosition('hyperliquid', position.coin, position.isLong, position.sizeUsd);
      }
      return null;
    })
    .filter((position): position is TrackedPosition => position != null);

  return {
    address: typeof raw.address === 'string' ? raw.address.toLowerCase() : address.toLowerCase(),
    fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : 0,
    positions,
  };
}

function readSnapshots(): Record<string, TraderSnapshot> {
  const raw = readJson<Record<string, unknown>>(SNAPSHOT_KEY, {});
  const out: Record<string, TraderSnapshot> = {};
  for (const [address, snapshot] of Object.entries(raw)) {
    const normalized = normalizeSnapshot(address, snapshot);
    if (normalized) out[address.toLowerCase()] = normalized;
  }
  return out;
}

async function fetchHyperliquidPositions(address: string): Promise<TrackedPosition[]> {
  try {
    const res = await fetch(`/api/hl-traders/${address}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = await res.json();
    const positions: any[] = json?.openPositions ?? [];
    return positions.map((position) =>
      makeTrackedPosition('hyperliquid', position.coin, position.isLong, position.sizeUsd),
    );
  } catch {
    return [];
  }
}

async function fetchGmxPositions(address: string, chain: 'arbitrum' | 'avalanche'): Promise<TrackedPosition[]> {
  const venue: TrackedVenue = chain === 'arbitrum' ? 'gmx-arbitrum' : 'gmx-avalanche';
  try {
    const res = await fetch(`/api/gmx-traders/${address}?chain=${chain}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const positions: any[] = json?.openPositions ?? [];
    return positions.map((position) =>
      makeTrackedPosition(venue, position.marketSymbol, position.isLong, position.sizeUsd),
    );
  } catch {
    return [];
  }
}

async function fetchGTradePositions(address: string): Promise<TrackedPosition[]> {
  try {
    const res = await fetch(`/api/gtrade-traders/${address}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const positions: any[] = json?.openPositions ?? [];
    return positions.map((position) =>
      makeTrackedPosition('gtrade', position.symbol, position.isLong, position.sizeUsd),
    );
  } catch {
    return [];
  }
}

async function fetchTrackedPositions(bookmark: TraderBookmark): Promise<TrackedPosition[]> {
  const venues = Array.from(new Set((bookmark.venues?.length ? bookmark.venues : DEFAULT_VENUES) as TrackedVenue[]));
  const batches = await Promise.all(
    venues.map((venue) => {
      if (venue === 'hyperliquid') return fetchHyperliquidPositions(bookmark.address);
      if (venue === 'gtrade') return fetchGTradePositions(bookmark.address);
      if (venue === 'gmx-arbitrum') return fetchGmxPositions(bookmark.address, 'arbitrum');
      return fetchGmxPositions(bookmark.address, 'avalanche');
    }),
  );
  return batches.flat();
}

function formatAlertDetails(
  kind: AlertKind,
  venue: TrackedVenue,
  coin: string,
  isLong: boolean,
  sizeUsd: number,
  previousSizeUsd: number | undefined,
  specialist: boolean,
): string {
  const side = isLong ? 'LONG' : 'SHORT';
  const venueLabel = formatVenueLabel(venue);
  const specialistSuffix = specialist ? ' · specialist' : '';

  if (kind === 'opened') return `opened ${side} ${coin} on ${venueLabel} · ${fmtCompact(sizeUsd)}${specialistSuffix}`;
  if (kind === 'closed') return `closed ${side} ${coin} on ${venueLabel} · was ${fmtCompact(sizeUsd)}${specialistSuffix}`;
  if (kind === 'flipped') return `flipped to ${side} ${coin} on ${venueLabel} · ${fmtCompact(sizeUsd)}${specialistSuffix}`;

  const delta = Math.abs(sizeUsd - (previousSizeUsd ?? 0));
  return `${kind} ${side} ${coin} on ${venueLabel} by ${fmtCompact(delta)} (now ${fmtCompact(sizeUsd)})${specialistSuffix}`;
}

export function useTraderAlerts() {
  const { bookmarks } = useTraderBookmarks();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const metadataRef = useRef<{
    fetchedAt: number;
    byAddress: Map<string, TraderAlertMeta>;
  }>({
    fetchedAt: 0,
    byAddress: new Map(),
  });
  const [lastCheck, setLastCheck] = useState<number | null>(null);

  const storedFeed = useSyncExternalStore(subscribe, getFeedSnapshot, getFeedServerSnapshot);
  const storedEnabled = useSyncExternalStore(subscribe, getSettingsSnapshot, getSettingsServerSnapshot);

  const feed: TraderAlert[] = useMemo(() => {
    try {
      const parsed = JSON.parse(storedFeed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [storedFeed]);

  const enabled = storedEnabled === 'true';

  const clearFeed = useCallback(() => {
    writeJson(FEED_KEY, []);
  }, []);

  const toggleEnabled = useCallback(async () => {
    const next = !enabled;
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore denied/unsupported paths.
      }
    }
    window.localStorage.setItem(SETTINGS_KEY, String(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  }, [enabled]);

  const getSmartMoneyMetadata = useCallback(async (): Promise<Map<string, TraderAlertMeta>> => {
    const cached = metadataRef.current;
    if (cached.byAddress.size > 0 && Date.now() - cached.fetchedAt < SMART_META_TTL) {
      return cached.byAddress;
    }

    try {
      const res = await fetch('/api/smart-money/leaderboard?topN=100&lookbackDays=90', {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return cached.byAddress;

      const json = await res.json() as { entries?: SmartMoneyLeaderboardEntry[] };
      const next = new Map<string, TraderAlertMeta>();
      for (const entry of json.entries ?? []) {
        if (!entry?.address) continue;
        next.set(entry.address.toLowerCase(), {
          tier: entry.tier ?? null,
          traderType: entry.traderType ?? null,
          signalScore: entry.signalScore ?? null,
          bestAsset: entry.assetBreakdown?.[0]?.symbol?.toUpperCase() ?? null,
        });
      }
      metadataRef.current = {
        fetchedAt: Date.now(),
        byAddress: next,
      };
      return next;
    } catch {
      return cached.byAddress;
    }
  }, []);

  useEffect(() => {
    if (!enabled || bookmarks.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    let active = true;
    let running = false;

    async function pollOnce() {
      if (running) return;
      running = true;
      try {
        const [metaByAddress, positionBatches] = await Promise.all([
          getSmartMoneyMetadata(),
          Promise.all(
            bookmarks.map(async (bookmark) => ({
              bookmark,
              positions: await fetchTrackedPositions(bookmark),
            })),
          ),
        ]);
        if (!active) return;

        const snapshots = readSnapshots();
        const freshAlerts: TraderAlert[] = [];

        for (const batch of positionBatches) {
          const address = batch.bookmark.address.toLowerCase();
          const previous = snapshots[address];
          const meta = metaByAddress.get(address);

          if (previous) {
            const changes = diffTrackedPositions(previous.positions, batch.positions, SIZE_CHANGE_THRESHOLD);
            for (const change of changes) {
              if (!shouldEmitSmartAlert(change, meta)) continue;
              const specialist = isSpecialistPosition(meta, change.coin);
              const timestamp = Date.now();
              freshAlerts.push({
                id: `${address}-${change.venue}-${change.coin}-${timestamp}-${freshAlerts.length}`,
                address,
                displayName: batch.bookmark.displayName ?? null,
                coin: change.coin,
                venue: change.venue as TrackedVenue,
                kind: change.kind,
                details: formatAlertDetails(
                  change.kind,
                  change.venue as TrackedVenue,
                  change.coin,
                  change.isLong,
                  change.sizeUsd,
                  change.prevSizeUsd,
                  specialist,
                ),
                sizeUsd: change.sizeUsd,
                isLong: change.isLong,
                timestamp,
                tier: meta?.tier ?? null,
                traderType: meta?.traderType ?? null,
                signalScore: meta?.signalScore ?? null,
                specialist,
              });
            }
          }

          snapshots[address] = {
            address,
            fetchedAt: Date.now(),
            positions: batch.positions,
          };
        }

        if (!active) return;
        writeJson(SNAPSHOT_KEY, snapshots);

        if (freshAlerts.length > 0) {
          const existing: TraderAlert[] = readJson(FEED_KEY, []);
          const combined = [...freshAlerts, ...existing].slice(0, MAX_FEED);
          writeJson(FEED_KEY, combined);

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            for (const alert of freshAlerts.slice(0, 3)) {
              try {
                new Notification(`${alert.displayName || alert.address.slice(0, 10)}...`, {
                  body: alert.details,
                  tag: `${alert.address}-${alert.venue}-${alert.coin}`,
                });
              } catch {
                // Browser may reject or throttle notifications.
              }
            }
          }
        }

        if (active) setLastCheck(Date.now());
      } finally {
        running = false;
      }
    }

    pollOnce();
    pollingRef.current = setInterval(pollOnce, POLL_INTERVAL);

    return () => {
      active = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, bookmarks, getSmartMoneyMetadata]);

  return { feed, clearFeed, enabled, toggleEnabled, lastCheck };
}
