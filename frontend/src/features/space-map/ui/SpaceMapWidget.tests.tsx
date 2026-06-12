import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/shared/theme/ThemeProvider';

import * as directoryUsageHook from '../queries/useDirectoryUsage';

import { SpaceMapWidget } from './SpaceMapWidget';

vi.mock('../queries/useDirectoryUsage');

const mockUseDirectoryUsage = vi.spyOn(directoryUsageHook, 'useDirectoryUsage');

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

// eslint-disable-next-line react-refresh/only-export-components -- test wrapper component
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

const renderWidget = () => render(<SpaceMapWidget />, { wrapper: Wrapper });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

const mockDir = { id: 1, name: 'media', is_dir: true, total_bytes: 18 * 1024 ** 3 };
const mockFile = { id: 2, name: 'big.iso', is_dir: false, total_bytes: 2 * 1024 ** 3 };

describe('SpaceMapWidget', () => {
  it('shows a loading skeleton', () => {
    stubMatchMedia();
    mockUseDirectoryUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    expect(screen.getByRole('status', { name: /loading space map/i })).toBeInTheDocument();
  });

  it('shows an error card with retry', async () => {
    stubMatchMedia();
    const refetch = vi.fn();
    const user = userEvent.setup();
    mockUseDirectoryUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    expect(screen.getByText(/failed to load space map/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders children with sizes and drills into a directory', async () => {
    stubMatchMedia();
    const user = userEvent.setup();

    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: null, parent_path: null, children: [mockDir, mockFile] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    const legend = screen.getByTestId('space-map-legend');

    // Both entries visible
    expect(legend).toHaveTextContent('media');
    expect(legend).toHaveTextContent('big.iso');

    // Sizes formatted
    expect(legend).toHaveTextContent('18.0 GB');
    expect(legend).toHaveTextContent('2.0 GB');

    // Clicking the directory entry drills in
    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: 1, parent_path: '/media', children: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    await user.click(screen.getByRole('button', { name: /media/i }));

    // Hook should have been called with the dir id at some point
    const calls = mockUseDirectoryUsage.mock.calls;
    const calledWithDirId = calls.some(([id]) => id === mockDir.id);
    expect(calledWithDirId).toBe(true);

    // Breadcrumb shows the directory name
    expect(screen.getByRole('navigation', { name: /space map path/i })).toHaveTextContent('media');
  });

  it('does not log chart-size warnings during the pre-measurement render', () => {
    stubMatchMedia();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: null, parent_path: null, children: [mockDir, mockFile] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    const sizeWarnings = warnSpy.mock.calls.filter(([message]) =>
      String(message).includes('should be greater than 0'),
    );
    expect(sizeWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('climbs back via breadcrumb', async () => {
    stubMatchMedia();
    const user = userEvent.setup();

    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: null, parent_path: null, children: [mockDir] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    // Drill into the dir
    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: 1, parent_path: '/media', children: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    await user.click(screen.getByRole('button', { name: /media/i }));

    // Now click the Root breadcrumb to climb back
    const rootCrumb = screen.getByRole('button', { name: /root/i });
    await user.click(rootCrumb);

    // Hook should have been called with undefined (root)
    const calls = mockUseDirectoryUsage.mock.calls;
    const calledWithRoot = calls.some(([id]) => id === undefined);
    expect(calledWithRoot).toBe(true);
  });

  it('recovers from a drilled error via the breadcrumb', async () => {
    stubMatchMedia();
    const user = userEvent.setup();

    // Start at root with one drillable directory
    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: null, parent_path: null, children: [mockDir] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    renderWidget();

    // Drill into the directory; the next fetch fails
    mockUseDirectoryUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    await user.click(screen.getByRole('button', { name: /media/i }));

    // Breadcrumb root crumb must still be present even in the error state
    expect(screen.getByRole('navigation', { name: /space map path/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /root/i })).toBeInTheDocument();

    // Clicking Root re-queries with undefined (root level)
    mockUseDirectoryUsage.mockReturnValue({
      data: { parent_id: null, parent_path: null, children: [mockDir] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryUsageHook.useDirectoryUsage>);

    await user.click(screen.getByRole('button', { name: /root/i }));

    const calls = mockUseDirectoryUsage.mock.calls;
    const calledWithRoot = calls.some(([id]) => id === undefined);
    expect(calledWithRoot).toBe(true);
  });
});
