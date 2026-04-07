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
    render(<FileRow entry={dir} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('backups')).toBeInTheDocument();
  });

  it('shows — as size for directories', () => {
    render(<FileRow entry={dir} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows formatted size for files', () => {
    render(<FileRow entry={file} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('230 MB')).toBeInTheDocument();
  });

  it('calls onClick when a directory row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={dir} onClick={onClick} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByText('backups'));
    expect(onClick).toHaveBeenCalledWith(dir);
  });

  it('does not call onClick when a file row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={file} onClick={onClick} onDelete={vi.fn()} />);
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

  it('shows three-dot menu button', () => {
    render(<FileRow entry={file} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
  });

  it('opens dropdown when three-dot button is clicked', async () => {
    render(<FileRow entry={file} onClick={vi.fn()} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onDelete and closes menu when Delete is selected', async () => {
    const onDelete = vi.fn();
    render(<FileRow entry={file} onClick={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('does not call onClick when three-dot button is clicked on a directory', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={dir} onClick={onClick} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows the formatted modified date for files', () => {
    // 1712448000 = Apr 7, 2024 UTC
    const fileWithDate = { ...file, modified_at: 1712448000 };
    render(<FileRow entry={fileWithDate} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Apr 7')).toBeInTheDocument();
  });

  it('applies staggered animation delay based on index prop', () => {
    const { container } = render(<FileRow entry={file} index={2} onClick={vi.fn()} onDelete={vi.fn()} />);
    const row = container.firstChild as HTMLElement;
    expect(row).toHaveStyle({ animationDelay: '100ms' });
  });

  it('does not render the action menu button for the parent row', () => {
    render(<FileRow isParent onParentClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /more options/i })).not.toBeInTheDocument();
  });
});
