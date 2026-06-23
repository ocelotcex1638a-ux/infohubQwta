import { describe, expect, it } from 'vitest';
import {
  LAUNCH_CUTOVER_AT_ISO,
  getLaunchCountdown,
  isLaunchAccessWindow,
  isLaunchCutoverReached,
} from '../launch';

describe('launch cutover helpers', () => {
  it('treats times before the cutoff as inside the launch window', () => {
    expect(isLaunchAccessWindow(new Date('2026-06-21T23:59:58Z').getTime())).toBe(true);
    expect(isLaunchCutoverReached(new Date('2026-06-21T23:59:58Z').getTime())).toBe(false);
  });

  it('flips exactly at the configured cutover timestamp', () => {
    const cutoverMs = new Date(LAUNCH_CUTOVER_AT_ISO).getTime();
    expect(isLaunchAccessWindow(cutoverMs)).toBe(false);
    expect(isLaunchCutoverReached(cutoverMs)).toBe(true);
  });

  it('returns a zeroed countdown after the launch window closes', () => {
    const countdown = getLaunchCountdown(new Date('2026-06-22T00:00:05-07:00').getTime());
    expect(countdown.live).toBe(false);
    expect(countdown.totalSeconds).toBe(0);
    expect(countdown.days).toBe(0);
    expect(countdown.hours).toBe(0);
    expect(countdown.minutes).toBe(0);
    expect(countdown.seconds).toBe(0);
  });
});
