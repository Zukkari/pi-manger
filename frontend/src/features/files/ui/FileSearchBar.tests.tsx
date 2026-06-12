import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileSearchBar } from './FileSearchBar';

describe('FileSearchBar', () => {
  it('renders the search input with the given value', () => {
    render(<FileSearchBar value="dune" onChange={vi.fn()} />);

    expect(screen.getByRole('searchbox', { name: /search files/i })).toHaveValue('dune');
  });

  it('reports typed input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileSearchBar value="" onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: /search files/i }), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('clears via the clear button, which only shows when there is text', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<FileSearchBar value="" onChange={onChange} />);

    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();

    rerender(<FileSearchBar value="dune" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /clear search/i }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
