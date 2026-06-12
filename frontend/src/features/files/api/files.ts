import { apiClient } from '@/shared/api/client';

import type { FileEntry } from '../files.types';

export const fetchFiles = (parentId?: number): Promise<FileEntry[]> => {
  const path = parentId !== undefined ? `/files?parent_id=${parentId}` : '/files';
  return apiClient<FileEntry[]>(path);
};

export const deleteFile = (id: number): Promise<void> =>
  apiClient<void>(`/files/${id}`, { method: 'DELETE' });

export interface FileSearchParams {
  q: string;
  extension?: string;
  min_size?: number;
  limit?: number;
}

export const searchFiles = (params: FileSearchParams): Promise<FileEntry[]> => {
  const search = new URLSearchParams({ q: params.q });
  if (params.extension) search.set('extension', params.extension);
  if (params.min_size !== undefined) search.set('min_size', String(params.min_size));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  return apiClient<FileEntry[]>(`/files?${search.toString()}`);
};
