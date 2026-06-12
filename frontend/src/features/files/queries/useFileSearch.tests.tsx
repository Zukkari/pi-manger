import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';
import * as filesApi from '../api/files';

import { useFileSearch } from './useFileSearch';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe('useFileSearch', () => {
  it('is disabled for queries shorter than 2 characters', () => {
    const spy = vi.spyOn(filesApi, 'searchFiles');
    const { result } = renderHook(() => useFileSearch('a'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches results for queries of 2+ characters', async () => {
    const entry: FileEntry = {
      id: 7, parent_id: 2, name: 'note.txt', path: '/data/docs/note.txt',
      size: 100, is_dir: false, modified_at: 1718000000,
    };
    vi.spyOn(filesApi, 'searchFiles').mockResolvedValue([entry]);

    const { result } = renderHook(() => useFileSearch('note'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
    expect(filesApi.searchFiles).toHaveBeenCalledWith({ q: 'note' });
  });
});
