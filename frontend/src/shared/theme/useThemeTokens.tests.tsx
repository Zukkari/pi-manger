import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './ThemeProvider';
import { useThemeTokens } from './useThemeTokens';

const stubMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
};

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.style.removeProperty('--accent');
  delete document.documentElement.dataset.mode;
});

describe('useThemeTokens', () => {
  it('reads the computed values of the requested CSS variables', () => {
    stubMatchMedia();
    document.documentElement.style.setProperty('--accent', '#0d9488');

    const { result } = renderHook(() => useThemeTokens(['--accent']), { wrapper });

    expect(result.current['--accent']).toBe('#0d9488');
  });
});
