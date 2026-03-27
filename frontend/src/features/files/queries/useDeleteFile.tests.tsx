import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryProvider } from '@/app/providers/QueryProvider';

import * as filesApi from '../api/files';
import { useDeleteFile } from './useDeleteFile';

vi.mock('../api/files');
const mockDeleteFile = vi.mocked(filesApi.deleteFile);

describe('useDeleteFile', () => {
  it('calls deleteFile with the given id', async () => {
    mockDeleteFile.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteFile(undefined), {
      wrapper: QueryProvider,
    });

    act(() => {
      result.current.mutate(42);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteFile).toHaveBeenCalledWith(42);
  });

  it('exposes isPending while mutation is in flight', async () => {
    let resolve!: () => void;
    mockDeleteFile.mockReturnValue(new Promise<void>(r => { resolve = r; }));

    const { result } = renderHook(() => useDeleteFile(undefined), {
      wrapper: QueryProvider,
    });

    act(() => {
      result.current.mutate(1);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    act(() => resolve());
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
