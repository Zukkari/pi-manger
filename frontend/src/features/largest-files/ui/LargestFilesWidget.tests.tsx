import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopFilesResponse } from '../largest-files.types';
import * as largestFilesHook from '../queries/useLargestFiles';

import { LargestFilesWidget } from './LargestFilesWidget';

vi.mock('../queries/useLargestFiles');

const mockUseLargestFiles = vi.spyOn(largestFilesHook, 'useLargestFiles');

// jsdom doesn't implement ResizeObserver — Recharts' ResponsiveContainer needs it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  mockUseLargestFiles.mockReset();
});

const rootResponse: TopFilesResponse = {
  parent_id: null,
  parent_path: null,
  entries: [
    { id: 10, name: 'movies', is_dir: true,  size_bytes: 8_000_000_000 },
    { id: 20, name: 'photos', is_dir: true,  size_bytes: 2_000_000_000 },
    { id: 30, name: 'big.iso', is_dir: false, size_bytes: 1_000_000_000 },
  ],
  other_bytes: 500_000,
  total_bytes: 11_000_500_000,
};

const moviesResponse: TopFilesResponse = {
  parent_id: 10,
  parent_path: '/data/movies',
  entries: [
    { id: 100, name: 'a.mkv', is_dir: false, size_bytes: 5_000_000_000 },
  ],
  other_bytes: 0,
  total_bytes: 5_000_000_000,
};

const mockReturn = (data: TopFilesResponse | undefined, opts: { loading?: boolean; error?: boolean } = {}) =>
  ({
    data,
    isLoading: !!opts.loading,
    isError: !!opts.error,
  }) as ReturnType<typeof largestFilesHook.useLargestFiles>;

describe('LargestFilesWidget', () => {
  it('shows a loading skeleton while fetching', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(undefined, { loading: true }));

    render(<LargestFilesWidget />);

    expect(screen.getByRole('status', { name: /loading largest files/i })).toBeInTheDocument();
  });

  it('shows an error message when the query fails', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(undefined, { error: true }));

    render(<LargestFilesWidget />);

    expect(screen.getByText(/couldn'?t load directory sizes/i)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no entries', () => {
    mockUseLargestFiles.mockReturnValue(
      mockReturn({ parent_id: null, parent_path: null, entries: [], other_bytes: 0, total_bytes: 0 }),
    );

    render(<LargestFilesWidget />);

    expect(screen.getByText(/no files to display/i)).toBeInTheDocument();
  });

  it('shows the "no files in this folder" message when entries exist but total is zero', () => {
    mockUseLargestFiles.mockReturnValue(
      mockReturn({
        parent_id: null,
        parent_path: null,
        entries: [{ id: 1, name: 'empty', is_dir: true, size_bytes: 0 }],
        other_bytes: 0,
        total_bytes: 0,
      }),
    );

    render(<LargestFilesWidget />);

    expect(screen.getByText(/no files in this folder/i)).toBeInTheDocument();
  });

  it('renders the breadcrumb with only "Root" when viewing the root', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    const nav = screen.getByRole('navigation', { name: /folder path/i });
    expect(within(nav).getByText('Root')).toBeInTheDocument();
  });

  it('drills into a folder when a folder slice is clicked', () => {
    // Use mockImplementation keyed on parentId so re-renders during a state
    // transition resolve consistently regardless of how many times the hook
    // is called.
    mockUseLargestFiles.mockImplementation(parentId =>
      mockReturn(parentId === null ? rootResponse : moviesResponse),
    );

    render(<LargestFilesWidget />);

    // Click the slice for "movies" — the widget exposes hidden buttons per
    // slice for keyboard accessibility and testability.
    fireEvent.click(screen.getByTestId('largest-files-slice-10'));

    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(10);
    expect(screen.getByRole('navigation', { name: /folder path/i })).toHaveTextContent(/Root.*movies/);
  });

  it('does not drill when a file slice is clicked', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-30')); // big.iso file

    // No re-render with a new parent — hook is still called with null.
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });

  it('does not drill when the "Other" slice is clicked', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-other'));

    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });

  it('rewinds the path when a breadcrumb is clicked', () => {
    mockUseLargestFiles.mockImplementation(parentId =>
      mockReturn(parentId === null ? rootResponse : moviesResponse),
    );

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-10')); // drill into movies
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(10);

    fireEvent.click(screen.getByRole('button', { name: 'Root' })); // back to root
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });
});
