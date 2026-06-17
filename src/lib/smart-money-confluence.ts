import { hyperliquidWalletClient } from '@/lib/wallet-clients/hyperliquid';
import type { NormalizedPosition } from '@/lib/exchange-clients/types';
import { buildSmartMoneyFeed, type SmartMoneyEntry, type TraderSignalTier, type TraderType } from './smart-money';

export interface ConfluenceTraderRow {
  address: string;
  label: string;
  tier: TraderSignalTier;
  traderType: TraderType;
  signalScore: number;
  sizeUsd: number;
  leverage: number | null;
  unrealizedPnlUsd: number;
  specialist: boolean;
  bestAsset: string | null;
  bestAssetPnlUsd: number | null;
}

export interface ConfluenceSignal {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  confluenceScore: number;
  walletCount: number;
  specialistCount: number;
  totalNotionalUsd: number;
  avgSignalScore: number;
  avgLeverage: number | null;
  netUnrealizedPnlUsd: number;
  tierCounts: Record<TraderSignalTier, number>;
  traderTypeCounts: Partial<Record<TraderType, number>>;
  traders: ConfluenceTraderRow[];
}

export interface SmartMoneyConfluenceFeed {
  ts: number;
  scanned: number;
  lookbackDays: number;
  walletsConsidered: number;
  minTier: TraderSignalTier;
  minWallets: number;
  assetFilter: string | null;
  availableSymbols: string[];
  signals: ConfluenceSignal[];
}

export interface ConfluenceCandidate {
  entry: SmartMoneyEntry;
  positions: NormalizedPosition[];
}

const TIER_RANK: Record<TraderSignalTier, number> = {
  A: 4,
  B: 3,
  C: 2,
  Watch: 1,
};

function positionSizeUsd(position: NormalizedPosition): number {
  return Math.abs(position.positionValue ?? 0);
}

function normalizeLabel(entry: SmartMoneyEntry): string {
  return entry.label === entry.address || entry.label.startsWith('0x')
    ? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`
    : entry.label;
}

export function buildConfluenceSignals(
  candidates: ConfluenceCandidate[],
  opts: { minTier?: TraderSignalTier; minWallets?: number; minPositionUsd?: number; assetFilter?: string | null } = {},
): ConfluenceSignal[] {
  const minTier = opts.minTier ?? 'B';
  const minWallets = Math.max(1, opts.minWallets ?? 2);
  const minPositionUsd = Math.max(0, opts.minPositionUsd ?? 25_000);
  const assetFilter = opts.assetFilter?.trim().toUpperCase() || null;
  const minTierRank = TIER_RANK[minTier];

  const groups = new Map<string, {
    symbol: string;
    side: 'long' | 'short';
    walletCount: number;
    specialistCount: number;
    totalNotionalUsd: number;
    signalScoreSum: number;
    leverageSum: number;
    leverageCount: number;
    netUnrealizedPnlUsd: number;
    tierCounts: Record<TraderSignalTier, number>;
    traderTypeCounts: Partial<Record<TraderType, number>>;
    traders: ConfluenceTraderRow[];
  }>();

  for (const candidate of candidates) {
    const entry = candidate.entry;
    if (TIER_RANK[entry.tier] < minTierRank) continue;

    const bestAsset = entry.assetBreakdown[0];
    const seenKeys = new Set<string>();

    for (const position of candidate.positions) {
      const symbol = (position.symbol || '').toUpperCase().trim();
      const side = position.side;
      const sizeUsd = positionSizeUsd(position);
      if (!symbol || sizeUsd < minPositionUsd) continue;
      if (assetFilter && symbol !== assetFilter) continue;

      const key = `${symbol}:${side}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const specialist = !!bestAsset && bestAsset.symbol === symbol && bestAsset.realizedPnlUsd > 0;
      const group = groups.get(key) ?? {
        symbol,
        side,
        walletCount: 0,
        specialistCount: 0,
        totalNotionalUsd: 0,
        signalScoreSum: 0,
        leverageSum: 0,
        leverageCount: 0,
        netUnrealizedPnlUsd: 0,
        tierCounts: { A: 0, B: 0, C: 0, Watch: 0 },
        traderTypeCounts: {},
        traders: [],
      };

      group.walletCount += 1;
      group.specialistCount += specialist ? 1 : 0;
      group.totalNotionalUsd += sizeUsd;
      group.signalScoreSum += entry.signalScore;
      group.netUnrealizedPnlUsd += position.unrealizedPnl ?? 0;
      group.tierCounts[entry.tier] += 1;
      group.traderTypeCounts[entry.traderType] = (group.traderTypeCounts[entry.traderType] ?? 0) + 1;
      if (position.leverage != null && Number.isFinite(position.leverage)) {
        group.leverageSum += position.leverage;
        group.leverageCount += 1;
      }
      group.traders.push({
        address: entry.address,
        label: normalizeLabel(entry),
        tier: entry.tier,
        traderType: entry.traderType,
        signalScore: entry.signalScore,
        sizeUsd,
        leverage: position.leverage,
        unrealizedPnlUsd: position.unrealizedPnl ?? 0,
        specialist,
        bestAsset: bestAsset?.symbol ?? null,
        bestAssetPnlUsd: bestAsset?.realizedPnlUsd ?? null,
      });

      groups.set(key, group);
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.walletCount >= minWallets)
    .map((group) => {
      const avgSignalScore = group.walletCount > 0 ? group.signalScoreSum / group.walletCount : 0;
      const avgLeverage = group.leverageCount > 0 ? group.leverageSum / group.leverageCount : null;
      const tierPoints = group.tierCounts.A * 20 + group.tierCounts.B * 12 + group.tierCounts.C * 6 + group.tierCounts.Watch * 2;
      const sizePoints = Math.min(25, group.totalNotionalUsd / 200_000);
      const specialistPoints = group.specialistCount * 8;
      const confluenceScore = Math.round(
        Math.min(100, group.walletCount * 10 + tierPoints + specialistPoints + avgSignalScore * 0.35 + sizePoints),
      );

      return {
        id: `${group.symbol}-${group.side}`,
        symbol: group.symbol,
        side: group.side,
        confluenceScore,
        walletCount: group.walletCount,
        specialistCount: group.specialistCount,
        totalNotionalUsd: group.totalNotionalUsd,
        avgSignalScore: Math.round(avgSignalScore),
        avgLeverage: avgLeverage != null ? Math.round(avgLeverage * 10) / 10 : null,
        netUnrealizedPnlUsd: group.netUnrealizedPnlUsd,
        tierCounts: group.tierCounts,
        traderTypeCounts: group.traderTypeCounts,
        traders: group.traders
          .sort((a, b) => {
            if (b.signalScore !== a.signalScore) return b.signalScore - a.signalScore;
            return b.sizeUsd - a.sizeUsd;
          })
          .slice(0, 8),
      } satisfies ConfluenceSignal;
    })
    .sort((a, b) => {
      if (b.confluenceScore !== a.confluenceScore) return b.confluenceScore - a.confluenceScore;
      if (b.walletCount !== a.walletCount) return b.walletCount - a.walletCount;
      return b.totalNotionalUsd - a.totalNotionalUsd;
    });
}

export async function buildSmartMoneyConfluenceFeed(opts: {
  topN?: number;
  lookbackDays?: number;
  minTier?: TraderSignalTier;
  minWallets?: number;
  minPositionUsd?: number;
  assetFilter?: string | null;
} = {}): Promise<SmartMoneyConfluenceFeed> {
  const topN = Math.min(Math.max(opts.topN ?? 50, 5), 100);
  const lookbackDays = Math.min(Math.max(opts.lookbackDays ?? 90, 1), 180);
  const minTier = opts.minTier ?? 'B';
  const minWallets = Math.max(1, opts.minWallets ?? 2);
  const minPositionUsd = Math.max(0, opts.minPositionUsd ?? 25_000);
  const assetFilter = opts.assetFilter?.trim().toUpperCase() || null;

  const leaderboard = await buildSmartMoneyFeed({ topN, lookbackDays });
  const candidates: ConfluenceCandidate[] = [];

  await Promise.all(
    leaderboard.entries.map(async (entry) => {
      try {
        const positions = await hyperliquidWalletClient.fetchPositions(entry.address);
        candidates.push({ entry, positions });
      } catch {
        candidates.push({ entry, positions: [] });
      }
    }),
  );

  const availableSymbols = Array.from(new Set(
    candidates.flatMap((candidate) =>
      candidate.positions
        .filter((position) => positionSizeUsd(position) >= minPositionUsd)
        .map((position) => (position.symbol || '').toUpperCase().trim())
        .filter(Boolean),
    ),
  )).sort();

  return {
    ts: Date.now(),
    scanned: leaderboard.scanned,
    lookbackDays: leaderboard.lookbackDays,
    walletsConsidered: candidates.filter((candidate) => candidate.positions.length > 0).length,
    minTier,
    minWallets,
    assetFilter,
    availableSymbols,
    signals: buildConfluenceSignals(candidates, { minTier, minWallets, minPositionUsd, assetFilter }),
  };
}
