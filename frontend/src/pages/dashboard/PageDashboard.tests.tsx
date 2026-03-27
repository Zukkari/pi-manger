import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '@/features/disk-usage/queries/useDiskUsage';

import { PageDashboard } from './PageDashboard';

vi.mock('@/features/disk-usage/queries/useDiskUsage');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');

describe('PageDashboard', () => {
  it('renders the page heading and disk usage widget', () => {
    mockUseDiskUsage.mockReturnValue({
      data: {
        path: '/data',
        total_bytes: 100 * 1024 ** 3,
        used_bytes: 40 * 1024 ** 3,
        free_bytes: 60 * 1024 ** 3,
        used_percent: 40,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<PageDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
