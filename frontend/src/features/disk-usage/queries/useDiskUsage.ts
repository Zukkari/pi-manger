import { useQuery } from '@tanstack/react-query';

import { fetchDiskUsage } from '../api/disk';
import { QueryKeys } from './queryKeys';

export const useDiskUsage = () =>
  useQuery({
    queryKey: [QueryKeys.DISK_USAGE],
    queryFn: fetchDiskUsage,
    refetchInterval: 30_000,
  });
