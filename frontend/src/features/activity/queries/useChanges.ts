import { useQuery } from '@tanstack/react-query';

import { fetchChanges } from '../api/changes';

import { QueryKeys } from './queryKeys';

// The scanner syncs every 60s; polling at half that keeps the feed fresh
// without hammering the Pi.
const REFETCH_INTERVAL_MS = 30_000;

export const useChanges = () =>
  useQuery({
    queryKey: [QueryKeys.CHANGES],
    queryFn: fetchChanges,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
