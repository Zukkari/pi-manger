import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(),
  useNavigate: vi.fn(),
  Link: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => <a onClick={onClick} className={className}>{children}</a>,
}));
vi.mock('../queries/useFiles');
vi.mock('../queries/useDeleteFile');
vi.mock('../queries/useFileSearch');
vi.mock('@/shared/lib/useDebouncedValue', () => ({
  useDebouncedValue: (v: unknown) => v,
}));

import { useNavigate, useSearch } from '@tanstack/react-router';
import * as filesHook from '../queries/useFiles';
import * as deleteFileHook from '../queries/useDeleteFile';
import * as fileSearchHook from '../queries/useFileSearch';
import { FileBrowserWidget } from './FileBrowserWidget';

const mockUseSearch = vi.mocked(useSearch);
const mockUseNavigate = vi.mocked(useNavigate);
const mockUseFiles = vi.spyOn(filesHook, 'useFiles');
const mockUseDeleteFile = vi.spyOn(deleteFileHook, 'useDeleteFile');
const mockUseFileSearch = vi.spyOn(fileSearchHook, 'useFileSearch');

const defaultSearchReturn = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof fileSearchHook.useFileSearch>;

const rootEntries = [
  { id: 1, parent_id: null, name: 'backups', path: '/backups', size: 0, is_dir: true, modified_at: 0 },
  { id: 2, parent_id: null, name: 'config.yaml', path: '/config.yaml', size: 4096, is_dir: false, modified_at: 0 },
];

describe('FileBrowserWidget', () => {
  beforeEach(() => {
    mockUseFileSearch.mockReturnValue(defaultSearchReturn);
  });

  it('renders a loading spinner while fetching', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText(/failed to load files/i)).toBeInTheDocument();
  });

  it('renders file entries on success', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('backups')).toBeInTheDocument();
    expect(screen.getByText('config.yaml')).toBeInTheDocument();
  });

  it('does not render the .. row at root', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.queryByText('..')).not.toBeInTheDocument();
  });

  it('renders the .. row when inside a folder', () => {
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(vi.fn());
    const children = [
      { id: 3, parent_id: 1, name: 'jan.tar.gz', path: '/backups/jan.tar.gz', size: 1024, is_dir: false, modified_at: 0 },
    ];
    mockUseFiles.mockReturnValue({ data: children, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('navigates into a folder when a directory row is clicked', async () => {
    const navigate = vi.fn();
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(navigate);
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);
    await userEvent.click(screen.getByText('backups'));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: 1 } });
  });

  it('navigates up when the .. row is clicked', async () => {
    const navigate = vi.fn();
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(navigate);
    const children = [
      { id: 3, parent_id: 1, name: 'jan.tar.gz', path: '/backups/jan.tar.gz', size: 1024, is_dir: false, modified_at: 0 },
    ];
    mockUseFiles.mockReturnValue({ data: children, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);
    await userEvent.click(screen.getByRole('button', { name: /go to parent directory/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: undefined } });
  });

  it('renders without crashing when inside an empty folder on refresh', () => {
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('navigates to root when .. is clicked inside an empty folder on refresh', async () => {
    const navigate = vi.fn();
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(navigate);
    mockUseFiles.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);
    await userEvent.click(screen.getByRole('button', { name: /go to parent directory/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: undefined } });
  });

  it('renders an empty state message when the directory has no files', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText(/empty directory/i)).toBeInTheDocument();
  });

  it('shows search results instead of the folder listing while searching', async () => {
    // Arrange: folder listing has two entries; search returns one hit.
    // useDebouncedValue is mocked as identity so typing immediately triggers search mode.
    const searchEntry = { id: 99, parent_id: 1, name: 'note.txt', path: '/backups/note.txt', size: 100, is_dir: false, modified_at: 0 };
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);
    mockUseFileSearch.mockReturnValue({
      data: [searchEntry],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileSearchHook.useFileSearch>);

    render(<FileBrowserWidget />);

    // Before search: folder entries visible, breadcrumb nav present
    expect(screen.getByText('backups')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();

    // Act: type a query long enough to trigger isSearching (≥2 chars)
    await userEvent.type(screen.getByRole('searchbox', { name: /search files/i }), 'no');

    // Assert: search results visible, breadcrumb nav gone
    expect(screen.getByText('note.txt')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
  });

  it('clearing the search returns to the folder listing', async () => {
    // Arrange: start in search mode with a hit
    const searchEntry = { id: 99, parent_id: 1, name: 'note.txt', path: '/backups/note.txt', size: 100, is_dir: false, modified_at: 0 };
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);
    mockUseFileSearch.mockReturnValue({
      data: [searchEntry],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileSearchHook.useFileSearch>);

    render(<FileBrowserWidget />);

    // Type a query to enter search mode
    await userEvent.type(screen.getByRole('searchbox', { name: /search files/i }), 'no');
    expect(screen.getByText('note.txt')).toBeInTheDocument();

    // Act: clear via the clear button
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));

    // Assert: folder listing back, breadcrumb nav visible
    expect(screen.getByText('backups')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});
