import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DownloadJob } from '../downloads.types';
import * as downloadsHook from '../queries/useDownloads';

import { DownloadsList } from './DownloadsList';

vi.mock('../queries/useDownloads');
const mockUseDownloads = vi.spyOn(downloadsHook, 'useDownloads');

const job = (over: Partial<DownloadJob>): DownloadJob => ({
  id: 'a',
  url: 'http://x/y',
  dir: 'd',
  name: 'file.iso',
  status: 'downloading',
  bytes_downloaded: 5,
  total_bytes: 10,
  error: '',
  created_at: 1,
  finished_at: 0,
  ...over,
});

beforeEach(() => mockUseDownloads.mockReset());

describe('DownloadsList', () => {
  it('renders a progress bar for an active download', () => {
    mockUseDownloads.mockReturnValue({ data: [job({})], isLoading: false, isError: false } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText('file.iso')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows the error message for a failed download', () => {
    mockUseDownloads.mockReturnValue({
      data: [job({ status: 'failed', error: 'unexpected status 404' })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText('unexpected status 404')).toBeInTheDocument();
  });

  it('shows the empty state when there are no downloads', () => {
    mockUseDownloads.mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });

  it('shows the completed status for a finished download without a progress bar', () => {
    mockUseDownloads.mockReturnValue({
      data: [job({ status: 'completed', bytes_downloaded: 10, total_bytes: 10, finished_at: 2 })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseDownloads.mockReturnValue({ data: undefined, isLoading: true, isError: false } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state when the query fails', () => {
    mockUseDownloads.mockReturnValue({ data: undefined, isLoading: false, isError: true } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText(/couldn.t load downloads/i)).toBeInTheDocument();
  });
});
