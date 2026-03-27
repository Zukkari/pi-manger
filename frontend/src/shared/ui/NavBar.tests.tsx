import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useRouterState: vi.fn(),
  useNavigate: vi.fn(),
}));

import { useNavigate, useRouterState } from '@tanstack/react-router';
import { NavBar } from './NavBar';

const mockUseRouterState = vi.mocked(useRouterState);
const mockUseNavigate = vi.mocked(useNavigate);

describe('NavBar', () => {
  it('marks Home as active on the root route', () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/' } } as ReturnType<typeof useRouterState>);
    mockUseNavigate.mockReturnValue(vi.fn());

    render(<NavBar />);

    expect(screen.getByRole('button', { name: /home/i })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /files/i })).not.toHaveAttribute('data-active', 'true');
  });

  it('marks Files as active on the /files route', () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/files' } } as ReturnType<typeof useRouterState>);
    mockUseNavigate.mockReturnValue(vi.fn());

    render(<NavBar />);

    expect(screen.getByRole('button', { name: /files/i })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /home/i })).not.toHaveAttribute('data-active', 'true');
  });

  it('navigates to / when Home is clicked', async () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/files' } } as ReturnType<typeof useRouterState>);
    const navigate = vi.fn();
    mockUseNavigate.mockReturnValue(navigate);

    render(<NavBar />);
    await userEvent.click(screen.getByRole('button', { name: /home/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('navigates to /files when Files is clicked', async () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/' } } as ReturnType<typeof useRouterState>);
    const navigate = vi.fn();
    mockUseNavigate.mockReturnValue(navigate);

    render(<NavBar />);
    await userEvent.click(screen.getByRole('button', { name: /files/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: undefined } });
  });
});
