import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeProvider';

type MediaListener = (e: { matches: boolean }) => void;

const stubMatchMedia = (prefersDark: boolean) => {
  const listeners: MediaListener[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: (_: string, cb: MediaListener) => listeners.push(cb),
      removeEventListener: vi.fn(),
    }),
  );
  return { fireChange: (matches: boolean) => listeners.forEach(cb => cb({ matches })) };
};

const Probe = () => {
  const { preference, resolvedMode, cyclePreference } = useTheme();
  return (
    <button type="button" onClick={cyclePreference}>
      {preference}:{resolvedMode}
    </button>
  );
};

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

describe('ThemeProvider', () => {
  it('defaults to system preference and resolves the OS mode', () => {
    stubMatchMedia(true);
    renderProbe();

    expect(screen.getByRole('button')).toHaveTextContent('system:dark');
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('cycles system → light → dark → system and persists the preference', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light:light');
    expect(localStorage.getItem('pi-manager-theme')).toBe('light');
    expect(document.documentElement.dataset.mode).toBe('light');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark:dark');
    expect(localStorage.getItem('pi-manager-theme')).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('system:dark');
  });

  it('reads a persisted preference on mount', () => {
    stubMatchMedia(false);
    localStorage.setItem('pi-manager-theme', 'dark');
    renderProbe();

    expect(screen.getByRole('button')).toHaveTextContent('dark:dark');
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('follows live OS scheme changes while preference is system', () => {
    const media = stubMatchMedia(true);
    renderProbe();
    expect(document.documentElement.dataset.mode).toBe('dark');

    act(() => media.fireChange(false));

    expect(screen.getByRole('button')).toHaveTextContent('system:light');
    expect(document.documentElement.dataset.mode).toBe('light');
  });

  it('ignores OS scheme changes while preference is explicit', async () => {
    const media = stubMatchMedia(true);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light:light');

    act(() => media.fireChange(false));
    act(() => media.fireChange(true));

    expect(screen.getByRole('button')).toHaveTextContent('light:light');
    expect(document.documentElement.dataset.mode).toBe('light');
  });

  it('falls back to system when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    stubMatchMedia(false);
    renderProbe();

    expect(screen.getByRole('button')).toHaveTextContent('system:light');
  });
});
