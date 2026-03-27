import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(),
  useNavigate: vi.fn(),
  Link: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => <a onClick={onClick} className={className}>{children}</a>,
}));
vi.mock('../queries/useFiles');

import { useNavigate, useSearch } from '@tanstack/react-router';
import * as filesHook from '../queries/useFiles';
import { FileBrowserWidget } from './FileBrowserWidget';

const mockUseSearch = vi.mocked(useSearch);
const mockUseNavigate = vi.mocked(useNavigate);
const mockUseFiles = vi.spyOn(filesHook, 'useFiles');

const rootEntries = [
  { id: 1, parent_id: null, name: 'backups', path: '/backups', size: 0, is_dir: true, modified_at: 0 },
  { id: 2, parent_id: null, name: 'config.yaml', path: '/config.yaml', size: 4096, is_dir: false, modified_at: 0 },
];

describe('FileBrowserWidget', () => {
  it('renders a loading spinner while fetching', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: true, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: false, isError: true } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText(/failed to load files/i)).toBeInTheDocument();
  });

  it('renders file entries on success', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('backups')).toBeInTheDocument();
    expect(screen.getByText('config.yaml')).toBeInTheDocument();
  });

  it('does not render the .. row at root', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.queryByText('..')).not.toBeInTheDocument();
  });

  it('renders the .. row when inside a folder', () => {
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(vi.fn());
    const children = [
      { id: 3, parent_id: 1, name: 'jan.tar.gz', path: '/backups/jan.tar.gz', size: 1024, is_dir: false, modified_at: 0 },
    ];
    mockUseFiles.mockReturnValue({ data: children, isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('navigates into a folder when a directory row is clicked', async () => {
    const navigate = vi.fn();
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(navigate);
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

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
    mockUseFiles.mockReturnValue({ data: children, isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);
    await userEvent.click(screen.getByRole('button', { name: /go to parent directory/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: undefined } });
  });

  it('renders without crashing when inside an empty folder on refresh', () => {
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as unknown as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('..')).toBeInTheDocument();
  });
});
