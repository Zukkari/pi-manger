import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DiskUsageBar } from './DiskUsageBar';
import type { DiskUsageBarProps } from './DiskUsageBar.types';

const baseProps: DiskUsageBarProps = {
  data: {
    path: '/data',
    total_bytes: 100 * 1024 ** 3,
    used_bytes: 50 * 1024 ** 3,
    free_bytes: 50 * 1024 ** 3,
    used_percent: 50,
  },
};

describe('DiskUsageBar', () => {
  it('renders the mount path', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByText('/data')).toBeInTheDocument();
  });

  it('renders the rounded usage percentage', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders used, free, and total formatted sizes', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByText(/50\.0 GB used/)).toBeInTheDocument();
    expect(screen.getByText(/50\.0 GB free/)).toBeInTheDocument();
    expect(screen.getByText(/100\.0 GB total/)).toBeInTheDocument();
  });

  it('uses blue bar color when usage is below 70%', () => {
    render(<DiskUsageBar {...baseProps} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('bg-blue-500');
  });

  it('uses amber bar color when usage is between 70% and 89%', () => {
    render(
      <DiskUsageBar
        data={{ ...baseProps.data, used_percent: 75 }}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('bg-amber-400');
  });

  it('uses red bar color when usage is 90% or above', () => {
    render(
      <DiskUsageBar
        data={{ ...baseProps.data, used_percent: 92 }}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('bg-red-400');
  });

  it('sets bar width to the usage percent', () => {
    render(<DiskUsageBar {...baseProps} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle({ width: '50%' });
  });
});
