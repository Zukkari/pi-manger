import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as activityHook from '@/features/activity/queries/useChanges';
import * as diskUsageHook from '@/features/disk-usage/queries/useDiskUsage';
import * as downloadsHook from '@/features/downloads/queries/useDownloads';
import * as fileTypesHook from '@/features/file-types/queries/useFileTypes';
import * as spaceMapHook from '@/features/space-map/queries/useDirectoryUsage';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

vi.mock('@/features/activity/queries/useChanges');
vi.mock('@/features/disk-usage/queries/useDiskUsage');
vi.mock('@/features/downloads/queries/useDownloads');
vi.mock('@/features/file-types/queries/useFileTypes');
vi.mock('@/features/space-map/queries/useDirectoryUsage');

import { PageDashboard } from './PageDashboard';

// eslint-disable-next-line react-refresh/only-export-components -- test wrapper component
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

const mockUseChanges = vi.spyOn(activityHook, 'useChanges');
const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');
const mockUseDownloads = vi.spyOn(downloadsHook, 'useDownloads');
const mockUseFileTypes = vi.spyOn(fileTypesHook, 'useFileTypes');
const mockUseDirectoryUsage = vi.spyOn(spaceMapHook, 'useDirectoryUsage');

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);

  // matchMedia is required by SpaceMapWidget → useThemeTokens → ThemeProvider
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

describe('PageDashboard', () => {
  it('renders all six widgets', () => {
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

    mockUseDownloads.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof downloadsHook.useDownloads>);

    mockUseDirectoryUsage.mockReturnValue({
      data: { total_bytes: 0, children: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof spaceMapHook.useDirectoryUsage>);

    mockUseFileTypes.mockReturnValue({
      data: { total_bytes: 0, categories: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileTypesHook.useFileTypes>);

    mockUseChanges.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof activityHook.useChanges>);

    render(<PageDashboard />, { wrapper: Wrapper });

    // Heading
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    // DiskUsageWidget
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    // SpaceMapWidget — renders the "Space map" heading
    expect(screen.getByText('Space map')).toBeInTheDocument();
    // FileTypesWidget — renders the "By file type" heading
    expect(screen.getByText('By file type')).toBeInTheDocument();
    // ActivityFeedWidget — renders the "Recent changes" heading
    expect(screen.getByText('Recent changes')).toBeInTheDocument();
    // AddDownloadButton
    expect(screen.getByRole('button', { name: /add download/i })).toBeInTheDocument();
  });
});
