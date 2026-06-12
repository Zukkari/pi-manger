import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/NavBar', () => ({
  NavBar: () => <nav aria-label="main navigation" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div />,
}));

import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { LayoutMain } from './LayoutMain';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LayoutMain', () => {
  it('renders the app name in the header', () => {
    render(<ThemeProvider><LayoutMain /></ThemeProvider>);
    expect(screen.getByText('Pi Manager')).toBeInTheDocument();
  });

  it('renders the NavBar', () => {
    render(<ThemeProvider><LayoutMain /></ThemeProvider>);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });
});
