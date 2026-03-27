import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeading } from './PageHeading';

describe('PageHeading', () => {
  it('renders children as an h1 heading', () => {
    render(<PageHeading>Dashboard</PageHeading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });
});
