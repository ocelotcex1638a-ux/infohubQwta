import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('watch page UI', () => {
  it('includes chain select with arbitrum option', () => {
    const p = join(process.cwd(), 'src', 'app', 'watch', 'page.tsx');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('option value="arbitrum"');
    expect(src).toContain('aria-label="Chain / venue"');
  });
});
