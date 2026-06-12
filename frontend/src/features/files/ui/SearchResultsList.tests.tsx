import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';

import { SearchResultsList } from './SearchResultsList';

const file = (over: Partial<FileEntry>): FileEntry => ({
  id: 1, parent_id: 2, name: 'note.txt', path: '/data/docs/note.txt',
  size: 100, is_dir: false, modified_at: 1718000000, ...over,
});

describe('SearchResultsList', () => {
  it('shows each result with its containing path', () => {
    render(<SearchResultsList results={[file({})]} onNavigate={vi.fn()} />);

    expect(screen.getByText('note.txt')).toBeInTheDocument();
    expect(screen.getByText('/data/docs')).toBeInTheDocument();
  });

  it('navigates into a directory result by its own id', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchResultsList
        results={[file({ id: 5, name: 'docs', is_dir: true, path: '/data/docs', parent_id: 1 })]}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /docs/i }));

    expect(onNavigate).toHaveBeenCalledWith(5);
  });

  it('navigates to a file result by its parent id', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SearchResultsList results={[file({ id: 7, parent_id: 3 })]} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /note\.txt/i }));

    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('shows an empty state when there are no results', () => {
    render(<SearchResultsList results={[]} onNavigate={vi.fn()} />);

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
