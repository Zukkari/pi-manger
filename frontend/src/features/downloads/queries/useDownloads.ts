import { useQuery } from '@tanstack/react-query';

import { fetchDownloads } from '../api/downloads';
import type { DownloadJob } from '../downloads.types';

import { QueryKeys } from './queryKeys';

const POLL_INTERVAL_MS = 1500;

const hasActiveJob = (jobs: DownloadJob[] | undefined): boolean =>
  jobs?.some(job => job.status === 'queued' || job.status === 'downloading') ?? false;

export const useDownloads = () =>
  useQuery({
    queryKey: [QueryKeys.DOWNLOADS],
    queryFn: fetchDownloads,
    refetchInterval: query => (hasActiveJob(query.state.data) ? POLL_INTERVAL_MS : false),
  });
