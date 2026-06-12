import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GlassCard } from './GlassCard';

describe('GlassCard', () => {
  it('renders children inside a glass surface', () => {
    render(<GlassCard data-testid="card">hello</GlassCard>);

    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('hello');
    expect(card).toHaveClass('glass-card');
  });

  it('merges extra class names', () => {
    render(<GlassCard data-testid="card" className="p-6" />);

    expect(screen.getByTestId('card')).toHaveClass('glass-card', 'p-6');
  });
});
