import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LayoutDashboard } from './LayoutDashboard';

describe('LayoutDashboard', () => {
  it('renders its children', () => {
    render(
      <LayoutDashboard>
        <p>Widget A</p>
        <p>Widget B</p>
      </LayoutDashboard>,
    );
    expect(screen.getByText('Widget A')).toBeInTheDocument();
    expect(screen.getByText('Widget B')).toBeInTheDocument();
  });
});
