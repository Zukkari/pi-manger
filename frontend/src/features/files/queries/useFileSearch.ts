import { useQuery } from '@tanstack/react-query';

import { searchFiles } from '../api/files';
import { QueryKeys } from './queryKeys';

const MIN_QUERY_LENGTH = 2;

export const useFileSearch = (query: string) =>
  useQuery({
    queryKey: [QueryKeys.FILE_SEARCH, query],
    queryFn: () => searchFiles({ q: query }),
    enabled: query.trim().length >= MIN_QUERY_LENGTH,
  });
