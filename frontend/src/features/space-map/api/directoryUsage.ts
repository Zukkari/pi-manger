import { apiClient } from '@/shared/api/client';

import type { DirectoryUsage } from '../space-map.types';

export const fetchDirectoryUsage = (directoryId?: number): Promise<DirectoryUsage> =>
  apiClient<DirectoryUsage>(`/directories/${directoryId ?? 'root'}/usage`);
