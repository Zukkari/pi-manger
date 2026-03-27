import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryProvider } from '@/app/providers/QueryProvider';

import * as filesApi from '../api/files';
import { useFiles } from './useFiles';

vi.mock('../api/files');
const mockFetchFiles = vi.mocked(filesApi.fetchFiles);

const mockEntry = {
  id: 1, parent_id: null, name: 'backups',
  path: '/backups', size: 0, is_dir: true, modified_at: 0,
};

describe('useFiles', () => {
  it('fetches root entries when no parentId is given', async () => {
    mockFetchFiles.mockResolvedValue([mockEntry]);

    const { result } = renderHook(() => useFiles(undefined), {
      wrapper: QueryProvider,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchFiles).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([mockEntry]);
  });

  it('fetches children when parentId is provided', async () => {
    mockFetchFiles.mockResolvedValue([]);

    const { result } = renderHook(() => useFiles(42), {
      wrapper: QueryProvider,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchFiles).toHaveBeenCalledWith(42);
  });
});
