import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as fileTypesHook from '../queries/useFileTypes';

import { FileTypesWidget } from './FileTypesWidget';

vi.mock('../queries/useFileTypes');

const mockUseFileTypes = vi.spyOn(fileTypesHook, 'useFileTypes');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileTypesWidget', () => {
  it('shows a loading skeleton', () => {
    mockUseFileTypes.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileTypesHook.useFileTypes>);

    render(<FileTypesWidget />);

    expect(screen.getByRole('status', { name: /loading file types/i })).toBeInTheDocument();
  });

  it('shows an error card with retry', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    mockUseFileTypes.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof fileTypesHook.useFileTypes>);

    render(<FileTypesWidget />);

    expect(screen.getByText(/failed to load file types/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders a segment and legend entry per category', () => {
    mockUseFileTypes.mockReturnValue({
      data: {
        total_bytes: 180 * 1024 ** 3,
        categories: [
          {
            category: 'video',
            total_bytes: 150 * 1024 ** 3,
            extensions: [
              { extension: 'mkv', total_bytes: 100 * 1024 ** 3 },
              { extension: 'mp4', total_bytes: 50 * 1024 ** 3 },
            ],
          },
          {
            category: 'image',
            total_bytes: 30 * 1024 ** 3,
            extensions: [{ extension: 'jpg', total_bytes: 30 * 1024 ** 3 }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileTypesHook.useFileTypes>);

    render(<FileTypesWidget />);

    // Legend shows category names (capitalized)
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Image')).toBeInTheDocument();

    // Formatted sizes present
    expect(screen.getByText('150.0 GB')).toBeInTheDocument();
    expect(screen.getByText('30.0 GB')).toBeInTheDocument();

    // Extension names joined
    expect(screen.getByText('mkv, mp4')).toBeInTheDocument();
    expect(screen.getByText('jpg')).toBeInTheDocument();

    // Bar has one child per category
    const bar = screen.getByTestId('file-types-bar');
    expect(bar.children).toHaveLength(2);

    // Video segment width is proportional: 150/180 * 100 ≈ 83.3%
    const videoSegment = bar.children[0] as HTMLElement;
    expect(videoSegment.style.width).toContain('83.3');
  });

  it('shows empty state when there are no files', () => {
    mockUseFileTypes.mockReturnValue({
      data: {
        total_bytes: 0,
        categories: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof fileTypesHook.useFileTypes>);

    render(<FileTypesWidget />);

    expect(screen.getByText(/no files yet/i)).toBeInTheDocument();
  });
});
