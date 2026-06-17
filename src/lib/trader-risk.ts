export interface RiskPositionLike {
  symbol: string;
  sizeUsd: number;
  unrealizedPnl: number;
}

export interface LiveRiskSummary {
  activeAssets: string[];
  openNotionalUsd: number;
  liveUnrealizedPnlUsd: number;
  livePositiveUnrealizedPnlUsd: number;
  liveNegativeUnrealizedPnlUsd: number;
}

export function summariseLiveRisk(positions: RiskPositionLike[]): LiveRiskSummary {
  const activeAssets = Array.from(new Set(
    positions
      .map((position) => position.symbol.trim().toUpperCase())
      .filter(Boolean),
  ));

  let openNotionalUsd = 0;
  let liveUnrealizedPnlUsd = 0;
  let livePositiveUnrealizedPnlUsd = 0;
  let liveNegativeUnrealizedPnlUsd = 0;

  for (const position of positions) {
    const sizeUsd = Number(position.sizeUsd) || 0;
    const unrealizedPnl = Number(position.unrealizedPnl) || 0;

    openNotionalUsd += Math.abs(sizeUsd);
    liveUnrealizedPnlUsd += unrealizedPnl;
    if (unrealizedPnl > 0) livePositiveUnrealizedPnlUsd += unrealizedPnl;
    if (unrealizedPnl < 0) liveNegativeUnrealizedPnlUsd += unrealizedPnl;
  }

  return {
    activeAssets,
    openNotionalUsd,
    liveUnrealizedPnlUsd,
    livePositiveUnrealizedPnlUsd,
    liveNegativeUnrealizedPnlUsd,
  };
}

export function computeTruePnlUsd(realizedPnlUsd: number, liveUnrealizedPnlUsd: number): number {
  return (Number(realizedPnlUsd) || 0) + (Number(liveUnrealizedPnlUsd) || 0);
}

export function computeRoiPct(pnlUsd: number, navUsd: number | null | undefined): number | null {
  const nav = Number(navUsd);
  if (!Number.isFinite(nav) || nav <= 0) return null;
  return (pnlUsd / nav) * 100;
}

export function computeOpenRiskPct(openNotionalUsd: number, navUsd: number | null | undefined): number | null {
  const nav = Number(navUsd);
  if (!Number.isFinite(nav) || nav <= 0) return null;
  return (openNotionalUsd / nav) * 100;
}
