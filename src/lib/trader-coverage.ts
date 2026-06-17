export type TraderVenue = 'hyperliquid' | 'gmx-arbitrum' | 'gmx-avalanche' | 'gtrade' | string;
export type CoverageKind = 'hl-only' | 'gmx-only' | 'gtrade-only' | 'cross-platform' | 'unknown';

function uniqueVenues(venues: TraderVenue[]): TraderVenue[] {
  return Array.from(new Set(venues.filter(Boolean)));
}

function hasGmxVenue(venues: TraderVenue[]): boolean {
  return venues.includes('gmx-arbitrum') || venues.includes('gmx-avalanche');
}

export function getCoverageKind(venues: TraderVenue[]): CoverageKind {
  const unique = uniqueVenues(venues);
  if (unique.length === 0) return 'unknown';

  const hasHl = unique.includes('hyperliquid');
  const hasGmx = hasGmxVenue(unique);
  const hasGTrade = unique.includes('gtrade');
  const familyCount = [hasHl, hasGmx, hasGTrade].filter(Boolean).length;

  if (familyCount >= 2) return 'cross-platform';
  if (hasHl) return 'hl-only';
  if (hasGmx) return 'gmx-only';
  if (hasGTrade) return 'gtrade-only';
  return 'unknown';
}

export function formatCoverageLabel(venues: TraderVenue[]): string {
  const kind = getCoverageKind(venues);
  if (kind === 'hl-only') return 'HL only';
  if (kind === 'gmx-only') return 'GMX only';
  if (kind === 'gtrade-only') return 'gTrade only';
  if (kind === 'cross-platform') return 'Cross-platform';
  return 'Coverage unclear';
}

export function formatVenueCoverageDetails(venues: TraderVenue[]): string {
  const unique = uniqueVenues(venues);
  if (unique.length === 0) return 'No confirmed venue activity';

  const labels = unique.map((venue) => {
    if (venue === 'hyperliquid') return 'HL';
    if (venue === 'gmx-arbitrum') return 'GMX Arb';
    if (venue === 'gmx-avalanche') return 'GMX Avax';
    if (venue === 'gtrade') return 'gTrade';
    return venue;
  });

  return labels.join(' + ');
}
