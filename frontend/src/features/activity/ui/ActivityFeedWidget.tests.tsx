import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as changesHook from '../queries/useChanges';

import { ActivityFeedWidget } from './ActivityFeedWidget';

vi.mock('../queries/useChanges');

const mockUseChanges = vi.spyOn(changesHook, 'useChanges');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActivityFeedWidget', () => {
  it('shows a loading skeleton', () => {
    mockUseChanges.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changesHook.useChanges>);

    render(<ActivityFeedWidget />);

    expect(screen.getByRole('status', { name: /loading recent changes/i })).toBeInTheDocument();
  });

  it('shows an error card with retry', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    mockUseChanges.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof changesHook.useChanges>);

    render(<ActivityFeedWidget />);

    expect(screen.getByText(/failed to load recent changes/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders one row per change with type styling', () => {
    mockUseChanges.mockReturnValue({
      data: [
        { id: 1, path: '/data/video.mkv', change_type: 'added', bytes_delta: 5368709120, detected_at: 1718193600 },
        { id: 2, path: '/data/old.txt', change_type: 'removed', bytes_delta: -1024, detected_at: 1718193500 },
        { id: 3, path: '/data/log.log', change_type: 'grown', bytes_delta: 2048, detected_at: 1718193400 },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changesHook.useChanges>);

    render(<ActivityFeedWidget />);

    // Paths are visible
    expect(screen.getByText('/data/video.mkv')).toBeInTheDocument();
    expect(screen.getByText('/data/old.txt')).toBeInTheDocument();
    expect(screen.getByText('/data/log.log')).toBeInTheDocument();

    // data-change-type attributes match their respective change types
    const rows = document.querySelectorAll('[data-change-type]');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('data-change-type')).toBe('added');
    expect(rows[1].getAttribute('data-change-type')).toBe('removed');
    expect(rows[2].getAttribute('data-change-type')).toBe('grown');

    // Sizes formatted via formatBytes(Math.abs(bytes_delta))
    expect(screen.getByText('5.0 GB')).toBeInTheDocument(); // 5368709120
    expect(screen.getByText('1 KB')).toBeInTheDocument();   // 1024
    expect(screen.getByText('2 KB')).toBeInTheDocument();   // 2048
  });

  it('shows empty state when there are no changes', () => {
    mockUseChanges.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof changesHook.useChanges>);

    render(<ActivityFeedWidget />);

    expect(screen.getByText(/no recent changes/i)).toBeInTheDocument();
  });
});
