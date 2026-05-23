import { useQuery } from '@tanstack/react-query';

import { fetchTopFiles } from '../api/topFiles';
import { QueryKeys } from './queryKeys';

export const useLargestFiles = (parentId: number | null) =>
  useQuery({
    queryKey: [QueryKeys.LARGEST_FILES, parentId],
    queryFn: () => fetchTopFiles(parentId),
  });
