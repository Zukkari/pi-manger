import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as foldersHook from '../queries/useFolders';

import { FolderPicker } from './FolderPicker';

vi.mock('../queries/useFolders');
const mockUseFolders = vi.spyOn(foldersHook, 'useFolders');

beforeEach(() => {
  mockUseFolders.mockReset();
});

describe('FolderPicker', () => {
  it('lists folders and selects the current path on Use', () => {
    mockUseFolders.mockReturnValue({
      data: [{ id: 1, name: 'downloads' }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /use this folder/i }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('accumulates the relative path as the user drills in', () => {
    mockUseFolders.mockReturnValue({
      data: [{ id: 1, name: 'downloads' }],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /downloads/ }));
    fireEvent.click(screen.getByRole('button', { name: /use this folder/i }));
    expect(onSelect).toHaveBeenCalledWith('downloads');
  });

  it('creates a subfolder under the current path', () => {
    mockUseFolders.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/new subfolder/i), { target: { value: 'iso' } });
    fireEvent.click(screen.getByRole('button', { name: /create & use/i }));
    expect(onSelect).toHaveBeenCalledWith('iso');
  });
});
