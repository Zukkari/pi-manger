import { useQuery } from '@tanstack/react-query';

import { fetchFolders } from '../api/folders';
import { QueryKeys } from './queryKeys';

export const useFolders = (parentId?: number) =>
  useQuery({
    queryKey: [QueryKeys.FOLDERS, parentId ?? null],
    queryFn: () => fetchFolders(parentId),
  });
