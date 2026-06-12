import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const description = (
  <>
    <strong>report.pdf</strong>
    {' '}will be permanently removed. This cannot be undone.
  </>
);

describe('DeleteConfirmDialog', () => {
  it('shows the entry name in the title', () => {
    render(
      <DeleteConfirmDialog title="Delete file?" description={description} isPending={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/report\.pdf/)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <DeleteConfirmDialog title="Delete file?" description={description} isPending={false} onConfirm={vi.fn()} onCancel={onCancel} />
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Delete is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmDialog title="Delete file?" description={description} isPending={false} onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables both buttons while isPending', () => {
    render(
      <DeleteConfirmDialog title="Delete file?" description={description} isPending={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
