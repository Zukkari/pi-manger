import { useQuery } from '@tanstack/react-query';

import { fetchDirectoryUsage } from '../api/directoryUsage';
import { QueryKeys } from './queryKeys';

export const useDirectoryUsage = (directoryId: number | undefined) =>
  useQuery({
    queryKey: [QueryKeys.DIRECTORY_USAGE, directoryId ?? 'root'],
    queryFn: () => fetchDirectoryUsage(directoryId),
  });
