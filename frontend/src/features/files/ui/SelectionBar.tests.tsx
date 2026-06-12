import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectionBar } from './SelectionBar';

describe('SelectionBar', () => {
  it('shows the selection count and disables delete at zero', () => {
    render(<SelectionBar count={0} onDelete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/0 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
  });

  it('fires onDelete and onCancel', async () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<SelectionBar count={2} onDelete={onDelete} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    await user.click(screen.getByRole('button', { name: /cancel selection/i }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
