import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';
import { FileRow } from './FileRow';

const dir: FileEntry = {
  id: 1, parent_id: null, name: 'backups',
  path: '/backups', size: 0, is_dir: true, modified_at: 0,
};

const file: FileEntry = {
  id: 2, parent_id: 1, name: 'backup.tar.gz',
  path: '/backups/backup.tar.gz', size: 230 * 1024 * 1024, is_dir: false, modified_at: 0,
};

describe('FileRow', () => {
  it('renders the entry name', () => {
    render(<FileRow entry={dir} onClick={vi.fn()} />);
    expect(screen.getByText('backups')).toBeInTheDocument();
  });

  it('shows — as size for directories', () => {
    render(<FileRow entry={dir} onClick={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows formatted size for files', () => {
    render(<FileRow entry={file} onClick={vi.fn()} />);
    expect(screen.getByText('230 MB')).toBeInTheDocument();
  });

  it('calls onClick when a directory row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={dir} onClick={onClick} />);
    await userEvent.click(screen.getByText('backups'));
    expect(onClick).toHaveBeenCalledWith(dir);
  });

  it('does not call onClick when a file row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={file} onClick={onClick} />);
    await userEvent.click(screen.getByText('backup.tar.gz'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a .. row when isParent is true', () => {
    render(<FileRow isParent onParentClick={vi.fn()} />);
    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('calls onParentClick when .. row is clicked', async () => {
    const onParentClick = vi.fn();
    render(<FileRow isParent onParentClick={onParentClick} />);
    await userEvent.click(screen.getByText('..'));
    expect(onParentClick).toHaveBeenCalled();
  });
});
