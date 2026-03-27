import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const entry: FileEntry = {
  id: 1, parent_id: null, name: 'report.pdf',
  path: '/data/report.pdf', size: 1024, is_dir: false, modified_at: 0,
};

describe('DeleteConfirmDialog', () => {
  it('shows the entry name in the title', () => {
    render(
      <DeleteConfirmDialog entry={entry} isPending={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/report\.pdf/)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <DeleteConfirmDialog entry={entry} isPending={false} onConfirm={vi.fn()} onCancel={onCancel} />
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmDialog entry={entry} isPending={false} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables both buttons while isPending', () => {
    render(
      <DeleteConfirmDialog entry={entry} isPending={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });
});
