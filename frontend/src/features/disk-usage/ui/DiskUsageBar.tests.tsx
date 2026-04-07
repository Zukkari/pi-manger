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

  it('renders used, free, and total formatted sizes in separate stat cells', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByTestId('stat-used')).toHaveTextContent('50.0 GB');
    expect(screen.getByTestId('stat-free')).toHaveTextContent('50.0 GB');
    expect(screen.getByTestId('stat-total')).toHaveTextContent('100.0 GB');
  });

  it('sets data-state="safe" on the bar when usage is below 70%', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-state', 'safe');
  });

  it('sets data-state="warn" on the bar when usage is between 70% and 89%', () => {
    render(<DiskUsageBar data={{ ...baseProps.data, used_percent: 75 }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-state', 'warn');
  });

  it('sets data-state="danger" on the bar when usage is 90% or above', () => {
    render(<DiskUsageBar data={{ ...baseProps.data, used_percent: 92 }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-state', 'danger');
  });

  it('sets bar width to the usage percent', () => {
    render(<DiskUsageBar {...baseProps} />);
    expect(screen.getByRole('progressbar')).toHaveStyle({ width: '50%' });
  });
});
