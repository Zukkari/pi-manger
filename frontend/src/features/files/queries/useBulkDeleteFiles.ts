import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteFile } from '../api/files';
import { QueryKeys } from './queryKeys';

export interface BulkDeleteResult {
  failedIds: number[];
}

// Deletes each id via the existing single-file endpoint. Partial failures
// resolve (not reject) so the UI can keep failed rows selected.
export const useBulkDeleteFiles = (parentId: number | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]): Promise<BulkDeleteResult> => {
      const outcomes = await Promise.allSettled(ids.map(id => deleteFile(id)));
      const failedIds = ids.filter((_, i) => outcomes[i].status === 'rejected');
      return { failedIds };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.FILES, parentId] });
    },
  });
};
