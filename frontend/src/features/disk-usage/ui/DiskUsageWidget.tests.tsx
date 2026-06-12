import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '../queries/useDiskUsage';

import { DiskUsageWidget } from './DiskUsageWidget';

vi.mock('../queries/useDiskUsage');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');

const mockData = {
  path: '/data',
  total_bytes: 100 * 1024 ** 3,
  used_bytes: 40 * 1024 ** 3,
  free_bytes: 60 * 1024 ** 3,
  used_percent: 40,
};

describe('DiskUsageWidget', () => {
  it('renders a skeleton and no progress bar while fetching', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByText(/failed to load disk usage/i)).toBeInTheDocument();
  });

  it('calls refetch when the retry button is clicked in error state', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders DiskUsageBar with data on success', () => {
    mockUseDiskUsage.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('/data')).toBeInTheDocument();
  });
});
