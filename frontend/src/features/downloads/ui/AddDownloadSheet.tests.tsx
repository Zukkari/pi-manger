import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as createHook from '../queries/useCreateDownload';
import * as foldersHook from '../queries/useFolders';

import { AddDownloadSheet } from './AddDownloadSheet';

vi.mock('../queries/useCreateDownload');
vi.mock('../queries/useFolders');

const mockUseCreate = vi.spyOn(createHook, 'useCreateDownload');
const mockUseFolders = vi.spyOn(foldersHook, 'useFolders');

beforeEach(() => {
  mockUseFolders.mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as ReturnType<typeof foldersHook.useFolders>);
});

describe('AddDownloadSheet', () => {
  it('submits the url and selected folder', () => {
    const mutate = vi.fn();
    mockUseCreate.mockReturnValue({ mutate, isPending: false, isError: false, error: null } as unknown as ReturnType<typeof createHook.useCreateDownload>);

    render(<AddDownloadSheet onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/paste link/i), { target: { value: 'https://x/y.iso' } });
    fireEvent.click(screen.getByRole('button', { name: /start download/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x/y.iso', dir: '' }),
      expect.anything(),
    );
  });

  it('shows a validation error from the mutation', () => {
    mockUseCreate.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error('url must be http or https'),
    } as unknown as ReturnType<typeof createHook.useCreateDownload>);

    render(<AddDownloadSheet onClose={vi.fn()} />);
    expect(screen.getByText('url must be http or https')).toBeInTheDocument();
  });

  it('disables submit when the url is empty', () => {
    mockUseCreate.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null } as unknown as ReturnType<typeof createHook.useCreateDownload>);
    render(<AddDownloadSheet onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /start download/i })).toBeDisabled();
  });
});
