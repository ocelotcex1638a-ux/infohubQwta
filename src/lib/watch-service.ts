/**
 * Small service helpers for the watch API — pure logic extracted so
 * it can be unit-tested without importing Next.js route handler runtime.
 */
export function determineVenue(vraw?: unknown): string {
  const raw = (vraw ?? '').toString().trim().toLowerCase();
  if (!raw) return 'hyperliquid';
  if (raw === 'arbitrum') return 'gtrade';
  if (raw === 'gmx-arbitrum' || raw === 'gmx-avalanche') return 'gmx';
  // Accepted canonical venues
  if (['hyperliquid', 'gtrade', 'gmx'].includes(raw)) return raw;
  throw new Error(`unsupported venue/chain: ${raw}`);
}

export function normalizeAddress(addr?: unknown): string {
  return (addr ?? '').toString().trim().toLowerCase();
}
