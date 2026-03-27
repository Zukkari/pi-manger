import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/NavBar', () => ({
  NavBar: () => <nav aria-label="main navigation" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div />,
}));

import { LayoutMain } from './LayoutMain';

describe('LayoutMain', () => {
  it('renders the app name in the header', () => {
    render(<LayoutMain />);
    expect(screen.getByText('Pi Manager')).toBeInTheDocument();
  });

  it('renders the NavBar', () => {
    render(<LayoutMain />);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });
});
