import { useQuery } from '@tanstack/react-query';

import { searchFiles } from '../api/files';
import { QueryKeys } from './queryKeys';

export const MIN_QUERY_LENGTH = 2;

export const useFileSearch = (query: string) => {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [QueryKeys.FILE_SEARCH, trimmed],
    queryFn: () => searchFiles({ q: trimmed }),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
  });
};
