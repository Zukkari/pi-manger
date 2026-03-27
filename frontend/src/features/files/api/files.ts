import { apiClient } from '@/shared/api/client';

import type { FileEntry } from '../files.types';

export const fetchFiles = (parentId?: number): Promise<FileEntry[]> => {
  const path = parentId !== undefined ? `/files?parent_id=${parentId}` : '/files';
  return apiClient<FileEntry[]>(path);
};

export const deleteFile = (id: number): Promise<void> =>
  apiClient<void>(`/files/${id}`, { method: 'DELETE' });
