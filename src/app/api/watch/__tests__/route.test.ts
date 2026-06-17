import { describe, it, expect } from 'vitest';
import { determineVenue } from '@/lib/watch-service';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('/api/watch helpers', () => {
  it('maps chain "arbitrum" -> venue "gtrade"', () => {
    expect(determineVenue('arbitrum')).toBe('gtrade');
    expect(determineVenue('ARBITRUM')).toBe('gtrade');
  });

  it('maps GMX venue aliases to the canonical watch venue', () => {
    expect(determineVenue('gmx-arbitrum')).toBe('gmx');
    expect(determineVenue('gmx-avalanche')).toBe('gmx');
  });

  it('route file contains venue column usage (sanity)', () => {
    const p = join(process.cwd(), 'src', 'app', 'api', 'watch', 'wallets', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('venue');
    expect(src).toMatch(/INSERT INTO hl_watched_wallets[\s\S]*venue/);
  });
});
