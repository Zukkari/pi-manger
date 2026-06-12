import { apiClient } from '@/shared/api/client';

import type { FileChange } from '../activity.types';

export const fetchChanges = (): Promise<FileChange[]> => apiClient<FileChange[]>('/changes');
