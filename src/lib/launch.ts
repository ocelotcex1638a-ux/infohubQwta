/**
 * Shared launch-cutover timing.
 *
 * "Free during launch" remains active through the end of Saturday,
 * June 21, 2026 in Pacific Time. The paywall / downgrade cutover
 * happens one second later, at the start of June 22, 2026 PT.
 */

export const LAUNCH_CUTOVER_AT_ISO = '2026-06-22T00:00:00Z';
export const LAUNCH_CUTOVER_LABEL = 'June 22, 2026';
export const LAUNCH_CUTOVER_DAY_LABEL = 'June 22, 2026';

export function getLaunchCutoverAt(): Date {
  return new Date(LAUNCH_CUTOVER_AT_ISO);
}

export function isLaunchAccessWindow(nowMs: number = Date.now()): boolean {
  return nowMs < getLaunchCutoverAt().getTime();
}

export function isLaunchCutoverReached(nowMs: number = Date.now()): boolean {
  return nowMs >= getLaunchCutoverAt().getTime();
}

export function getLaunchCountdown(nowMs: number = Date.now()) {
  const diffMs = Math.max(0, getLaunchCutoverAt().getTime() - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return {
    live: diffMs > 0,
    totalSeconds,
    days,
    hours,
    minutes,
    seconds,
  };
}
