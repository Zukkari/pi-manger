import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteFile } from '../api/files';
import { QueryKeys } from './queryKeys';

export const useDeleteFile = (parentId: number | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.FILES, parentId] });
    },
  });
};
