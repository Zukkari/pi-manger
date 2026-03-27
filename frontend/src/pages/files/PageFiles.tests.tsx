import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/files', () => ({
  FileBrowserWidget: () => <div data-testid="file-browser" />,
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(() => ({ parent_id: undefined })),
  useNavigate: vi.fn(() => vi.fn()),
}));

import { PageFiles } from './PageFiles';

describe('PageFiles', () => {
  it('renders the page heading and FileBrowserWidget', () => {
    render(<PageFiles />);
    expect(screen.getByRole('heading', { level: 1, name: 'Files' })).toBeInTheDocument();
    expect(screen.getByTestId('file-browser')).toBeInTheDocument();
  });
});
