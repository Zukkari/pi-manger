import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as downloadsHook from '../queries/useDownloads';
import type { DownloadJob } from '../downloads.types';

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

  it('renders nothing notable when there are no downloads', () => {
    mockUseDownloads.mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });
});
