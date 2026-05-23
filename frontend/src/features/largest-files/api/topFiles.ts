import { apiClient } from '@/shared/api/client';

import type { TopFilesResponse } from '../largest-files.types';

export const fetchTopFiles = (parentId: number | null): Promise<TopFilesResponse> => {
  const path = parentId === null ? '/files/top' : `/files/top?parent_id=${parentId}`;
  return apiClient<TopFilesResponse>(path);
};
