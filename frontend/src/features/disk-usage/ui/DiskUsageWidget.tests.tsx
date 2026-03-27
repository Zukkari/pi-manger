import { render, screen } from '@testing-library/react';
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
  it('renders a loading spinner and no progress bar while fetching', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByText(/failed to load disk usage/i)).toBeInTheDocument();
  });

  it('renders DiskUsageBar with data on success', () => {
    mockUseDiskUsage.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('/data')).toBeInTheDocument();
  });
});
