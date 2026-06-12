import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import { SpaceMapCell } from './SpaceMapCell';

const baseProps: ComponentProps<typeof SpaceMapCell> = {
  x: 0,
  y: 0,
  width: 160,
  height: 80,
  depth: 1,
  name: 'media',
  fill: '#0d9488',
  id: 1,
  is_dir: true,
  total_bytes: 18 * 1024 ** 3,
};

const renderCell = (overrides: Partial<ComponentProps<typeof SpaceMapCell>> = {}) =>
  render(
    <svg>
      <SpaceMapCell {...baseProps} {...overrides} />
    </svg>,
  );

describe('SpaceMapCell', () => {
  it('shows the name and formatted size when the block has room', () => {
    renderCell();

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(screen.getByText('18.0 GB')).toBeInTheDocument();
  });

  it('drops the size line when the block is too short for two lines', () => {
    renderCell({ height: 30 });

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(screen.queryByText('18.0 GB')).not.toBeInTheDocument();
  });

  it('drops all labels when the block is too small to read', () => {
    const { container } = renderCell({ width: 30, height: 18 });

    expect(container.querySelector('text')).not.toBeInTheDocument();
    expect(container.querySelector('rect')).toBeInTheDocument();
  });

  it('renders nothing for the synthetic root node', () => {
    const { container } = renderCell({ depth: 0 });

    expect(container.querySelector('rect')).not.toBeInTheDocument();
  });

  it('marks directories as clickable with a pointer cursor', () => {
    const { container } = renderCell({ is_dir: true });

    expect(container.querySelector('g')).toHaveStyle({ cursor: 'pointer' });
  });

  it('does not mark files as clickable', () => {
    const { container } = renderCell({ is_dir: false });

    expect(container.querySelector('g')).not.toHaveStyle({ cursor: 'pointer' });
  });

  it('uses dark label text on light fills and light text on dark fills', () => {
    renderCell({ fill: '#fbbf24', name: 'on-light' });
    renderCell({ fill: '#0d9488', name: 'on-dark' });

    const onLight = screen.getByText('on-light');
    const onDark = screen.getByText('on-dark');
    expect(onLight.getAttribute('fill')).not.toBe(onDark.getAttribute('fill'));
    expect(onLight.getAttribute('fill')).toBe('#10182e');
  });
});
