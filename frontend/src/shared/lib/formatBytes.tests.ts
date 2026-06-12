import { describe, expect, it } from 'vitest';

import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('formats across magnitudes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5 MB');
    expect(formatBytes(1.55 * 1024 ** 3)).toBe('1.6 GB');
  });
});
