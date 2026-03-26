import { apiClient } from '@/shared/api/client';

import type { DiskUsage } from '../disk-usage.types';

export const fetchDiskUsage = (): Promise<DiskUsage> => apiClient<DiskUsage>('/disk');
