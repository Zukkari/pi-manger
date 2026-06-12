import { apiClient } from '@/shared/api/client';

import type { FolderEntry } from '../downloads.types';

interface FileApiEntry {
  id: number;
  name: string;
  is_dir: boolean;
}

// fetchFolders returns only the directory children of the given folder, using
// the existing /api/files tree endpoint. Pass undefined for the root.
export const fetchFolders = async (parentId?: number): Promise<FolderEntry[]> => {
  const path = parentId !== undefined ? `/files?parent_id=${parentId}` : '/files';
  const entries = await apiClient<FileApiEntry[]>(path);
  return entries.filter(e => e.is_dir).map(e => ({ id: e.id, name: e.name }));
};
