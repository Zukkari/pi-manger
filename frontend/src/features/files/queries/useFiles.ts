import { useQuery } from '@tanstack/react-query';

import { fetchFiles } from '../api/files';
import { QueryKeys } from './queryKeys';

export const useFiles = (parentId: number | undefined) =>
  useQuery({
    queryKey: [QueryKeys.FILES, parentId],
    queryFn: () => fetchFiles(parentId),
  });
