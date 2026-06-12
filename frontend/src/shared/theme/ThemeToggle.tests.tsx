import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

const stubMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

describe('ThemeToggle', () => {
  it('shows the current preference and cycles on click', async () => {
    stubMatchMedia();
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /system theme/i });

    await user.click(button);
    expect(screen.getByRole('button', { name: /light theme/i })).toBeInTheDocument();

    await user.click(button);
    expect(screen.getByRole('button', { name: /dark theme/i })).toBeInTheDocument();
  });
});
