/**
 * Cron: keep the in-process L1 caches for /api/smart-money and
 * /api/smart-money/leaderboard warm by hitting them periodically.
 *
 * Cold cost on these routes is ~20 s (per-wallet position aggregation
 * across 30+ Hyperliquid traders). When a real user lands on
 * /smart-money or /smart-money/leaderboard during a cold window the
 * page can hit a fetch timeout — see fix(smart-money-composite) auto-
 * retry in 673858c5. Pre-warming via cron means the L1 cache is
 * almost always populated when the user arrives.
 *
 * Caveat: serverless function instances aren't persistent. Hitting
 * the routes from the cron only keeps caches warm WITHIN whatever
 * instance happens to serve the cron call. DO Platform's keep-alive
 * window means subsequent user requests in the next ~5 min hit the
 * same instance and benefit. Beyond that we accept the cold cost.
 *
 * Schedule: every 25 min via systemd timer
 * (/etc/systemd/system/infohub-cron-warm-smart-money.timer).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server';
import { upsertWorkerHeartbeat } from '@/lib/db';
import { verifyCronAuth } from '../_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;

async function timed(label: string, url: string): Promise<{ label: string; ok: boolean; ms: number; status: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'InfoHub-cron-warm-smart-money' },
    });
    const ms = Date.now() - t0;
    return { label, ok: res.ok, ms, status: res.status };
  } catch {
    return { label, ok: false, ms: Date.now() - t0, status: 0 };
  }
}

export async function GET(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const origin = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

  // Hit all three endpoints in parallel — they share underlying lib data so
  // warming one helps the other. Confluence is warmed with Tier C + $10K
  // floor (the UI defaults) so the first real user request hits L1 cache.
  const [smartMoney, leaderboard, confluence] = await Promise.all([
    timed('smart-money',         `${origin}/api/smart-money?limit=50`),
    timed('smart-money/leaderboard', `${origin}/api/smart-money/leaderboard?topN=50&lookbackDays=90`),
    timed('smart-money/confluence',  `${origin}/api/smart-money/confluence?topN=50&lookbackDays=90&minTier=C&minWallets=2`),
  ]);

  if (!smartMoney.ok || !leaderboard.ok || !confluence.ok) {
    console.warn(
      '[warm-smart-money] partial failure: ' +
      `smartMoney=${smartMoney.ok}/${smartMoney.status}/${smartMoney.ms}ms, ` +
      `leaderboard=${leaderboard.ok}/${leaderboard.status}/${leaderboard.ms}ms, ` +
      `confluence=${confluence.ok}/${confluence.status}/${confluence.ms}ms`,
    );
  }

  const allOk = smartMoney.ok && leaderboard.ok && confluence.ok;
  await upsertWorkerHeartbeat(
    'cron:warm-smart-money',
    allOk ? 'ok' : 'degraded',
    {
      smartMoneyMs: smartMoney.ms,
      leaderboardMs: leaderboard.ms,
      confluenceMs: confluence.ms,
      smartMoneyStatus: smartMoney.status,
      leaderboardStatus: leaderboard.status,
      confluenceStatus: confluence.status,
    },
  ).catch(e => console.error('[warm-smart-money] heartbeat error:', e));

  return NextResponse.json(
    {
      ok: allOk,
      results: { smartMoney, leaderboard, confluence },
      ts: Date.now(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
