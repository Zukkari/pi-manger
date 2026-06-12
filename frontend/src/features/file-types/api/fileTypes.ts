import { apiClient } from '@/shared/api/client';

import type { FileTypes } from '../file-types.types';

export const fetchFileTypes = (): Promise<FileTypes> => apiClient<FileTypes>('/file-types');
