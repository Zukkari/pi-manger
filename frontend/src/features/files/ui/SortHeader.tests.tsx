import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortHeader } from './SortHeader';

describe('SortHeader', () => {
  it('marks the active column with the sort direction', () => {
    render(<SortHeader sort={{ key: 'size', dir: 'desc' }} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /size/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button', { name: /name/i })).not.toHaveAttribute('aria-sort');
  });

  it('clicking the active column flips direction; clicking another column selects it ascending', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SortHeader sort={{ key: 'name', dir: 'asc' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(onChange).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });

    await user.click(screen.getByRole('button', { name: /modified/i }));
    expect(onChange).toHaveBeenCalledWith({ key: 'modified', dir: 'asc' });
  });
});
