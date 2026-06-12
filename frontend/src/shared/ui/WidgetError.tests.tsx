import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WidgetError } from './WidgetError';

describe('WidgetError', () => {
  it('shows the message', () => {
    render(<WidgetError message="Failed to load disk usage. Is the API running?" />);

    expect(screen.getByText('Failed to load disk usage. Is the API running?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<WidgetError message="Boom" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
