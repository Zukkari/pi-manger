import { useQuery } from '@tanstack/react-query';

import { fetchFileTypes } from '../api/fileTypes';

import { QueryKeys } from './queryKeys';

export const useFileTypes = () =>
  useQuery({
    queryKey: [QueryKeys.FILE_TYPES],
    queryFn: fetchFileTypes,
  });
