import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime } from './formatRelativeTime';

describe('formatRelativeTime', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-06-12T12:00:00Z')));
  afterEach(() => vi.useRealTimers());

  const at = (secondsAgo: number) => Math.floor(Date.now() / 1000) - secondsAgo;

  it('formats seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(at(5))).toBe('5s ago');
    expect(formatRelativeTime(at(90))).toBe('1m ago');
    expect(formatRelativeTime(at(2 * 3600))).toBe('2h ago');
    expect(formatRelativeTime(at(3 * 86400))).toBe('3d ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(formatRelativeTime(at(-30))).toBe('just now');
  });
});
