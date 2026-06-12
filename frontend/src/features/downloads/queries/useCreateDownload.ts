import { useMutation, useQueryClient } from '@tanstack/react-query';

import { postDownload } from '../api/downloads';

import { QueryKeys } from './queryKeys';

export const useCreateDownload = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.DOWNLOADS] });
    },
  });
};
