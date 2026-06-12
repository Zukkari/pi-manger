import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as filesApi from '../api/files';

import { useBulkDeleteFiles } from './useBulkDeleteFiles';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe('useBulkDeleteFiles', () => {
  it('deletes every id and reports no failures', async () => {
    const spy = vi.spyOn(filesApi, 'deleteFile').mockResolvedValue(undefined);
    const { result } = renderHook(() => useBulkDeleteFiles(undefined), { wrapper });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual({ failedIds: [] });
  });

  it('reports which ids failed without rejecting the mutation', async () => {
    vi.spyOn(filesApi, 'deleteFile').mockImplementation(id =>
      id === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );
    const { result } = renderHook(() => useBulkDeleteFiles(undefined), { wrapper });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ failedIds: [2] });
  });
});
