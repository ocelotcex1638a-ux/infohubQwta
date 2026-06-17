export type BrowserAlertKind = 'opened' | 'closed' | 'increased' | 'decreased' | 'flipped';
export type AlertTraderType = 'scalper' | 'day' | 'swing' | 'hodler' | 'algo' | 'dca-heavy';
export type AlertTier = 'A' | 'B' | 'C' | 'Watch';

export interface TraderAlertMeta {
  tier?: AlertTier | null;
  traderType?: AlertTraderType | null;
  signalScore?: number | null;
  bestAsset?: string | null;
}

export interface TrackedPosition {
  key: string;
  venue: string;
  coin: string;
  isLong: boolean;
  sizeUsd: number;
}

export interface PositionChange {
  kind: BrowserAlertKind;
  venue: string;
  coin: string;
  isLong: boolean;
  sizeUsd: number;
  prevSizeUsd?: number;
  deltaPct?: number;
}

export interface SmartAlertRules {
  resizePct: number;
  specialistResizePct: number;
  scalperResizePct: number;
  watchTierResizePct: number;
}

export const DEFAULT_SMART_ALERT_RULES: SmartAlertRules = {
  resizePct: 0.25,
  specialistResizePct: 0.15,
  scalperResizePct: 0.35,
  watchTierResizePct: 0.5,
};

export function isSpecialistPosition(meta: TraderAlertMeta | null | undefined, coin: string): boolean {
  return !!meta?.bestAsset && meta.bestAsset.toUpperCase() === coin.toUpperCase();
}

export function diffTrackedPositions(
  prev: TrackedPosition[],
  curr: TrackedPosition[],
  sizeChangeThreshold = 0.10,
): PositionChange[] {
  const changes: PositionChange[] = [];
  const prevByKey = new Map(prev.map((position) => [position.key, position]));
  const currByKey = new Map(curr.map((position) => [position.key, position]));

  currByKey.forEach((position, key) => {
    const before = prevByKey.get(key);
    if (!before) {
      changes.push({
        kind: 'opened',
        venue: position.venue,
        coin: position.coin,
        isLong: position.isLong,
        sizeUsd: position.sizeUsd,
      });
      return;
    }

    if (before.isLong !== position.isLong) {
      changes.push({
        kind: 'flipped',
        venue: position.venue,
        coin: position.coin,
        isLong: position.isLong,
        sizeUsd: position.sizeUsd,
        prevSizeUsd: before.sizeUsd,
      });
      return;
    }

    const delta = position.sizeUsd - before.sizeUsd;
    const pctChange = before.sizeUsd > 0 ? Math.abs(delta) / before.sizeUsd : 1;
    if (pctChange >= sizeChangeThreshold) {
      changes.push({
        kind: delta >= 0 ? 'increased' : 'decreased',
        venue: position.venue,
        coin: position.coin,
        isLong: position.isLong,
        sizeUsd: position.sizeUsd,
        prevSizeUsd: before.sizeUsd,
        deltaPct: before.sizeUsd > 0 ? delta / before.sizeUsd : undefined,
      });
    }
  });

  prevByKey.forEach((position, key) => {
    if (currByKey.has(key)) return;
    changes.push({
      kind: 'closed',
      venue: position.venue,
      coin: position.coin,
      isLong: position.isLong,
      sizeUsd: position.sizeUsd,
      prevSizeUsd: position.sizeUsd,
    });
  });

  return changes;
}

export function shouldEmitSmartAlert(
  change: PositionChange,
  meta: TraderAlertMeta | null | undefined,
  rules: SmartAlertRules = DEFAULT_SMART_ALERT_RULES,
): boolean {
  if (change.kind === 'opened' || change.kind === 'closed' || change.kind === 'flipped') {
    return true;
  }

  const specialist = isSpecialistPosition(meta, change.coin);
  const deltaPct = Math.abs(change.deltaPct ?? 0);

  if (meta?.traderType === 'scalper') {
    return deltaPct >= (specialist ? rules.resizePct : rules.scalperResizePct);
  }

  if (meta?.tier === 'Watch') {
    return deltaPct >= (specialist ? rules.resizePct : rules.watchTierResizePct);
  }

  return deltaPct >= (specialist ? rules.specialistResizePct : rules.resizePct);
}

export function formatVenueLabel(venue: string): string {
  if (venue === 'hyperliquid') return 'HL';
  if (venue === 'gtrade') return 'gTrade';
  if (venue === 'gmx-arbitrum') return 'GMX Arb';
  if (venue === 'gmx-avalanche') return 'GMX Avax';
  return venue;
}
