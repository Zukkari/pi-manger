import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '@/features/disk-usage/queries/useDiskUsage';
import * as downloadsHook from '@/features/downloads/queries/useDownloads';
import * as largestFilesHook from '@/features/largest-files/queries/useLargestFiles';

import { PageDashboard } from './PageDashboard';

vi.mock('@/features/disk-usage/queries/useDiskUsage');
vi.mock('@/features/downloads/queries/useDownloads');
vi.mock('@/features/largest-files/queries/useLargestFiles');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');
const mockUseDownloads = vi.spyOn(downloadsHook, 'useDownloads');
const mockUseLargestFiles = vi.spyOn(largestFilesHook, 'useLargestFiles');

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

describe('PageDashboard', () => {
  it('renders the heading, disk usage widget, and largest files widget', () => {
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

    mockUseLargestFiles.mockReturnValue({
      data: {
        parent_id: null,
        parent_path: null,
        entries: [{ id: 1, name: 'movies', is_dir: true, size_bytes: 1024 }],
        other_bytes: 0,
        total_bytes: 1024,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof largestFilesHook.useLargestFiles>);

    mockUseDownloads.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof downloadsHook.useDownloads>);

    render(<PageDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /folder path/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add download/i })).toBeInTheDocument();
  });
});
