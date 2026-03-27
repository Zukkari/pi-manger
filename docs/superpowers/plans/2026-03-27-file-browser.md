# File Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file browser page with GitHub-style breadcrumb navigation and a persistent bottom tab bar (Home / Files) in an Apple-inspired frosted glass style.

**Architecture:** A new `features/files` module owns data fetching and rendering. `FileBrowserWidget` holds a navigation stack in component state and reads/writes `parent_id` as a URL search param. The `NavBar` component lives in `shared/ui` and is rendered inside `LayoutMain`.

**Tech Stack:** React 18, TypeScript, TanStack Router v1, TanStack Query v5, Tailwind CSS, Vitest + React Testing Library

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/features/files/files.types.ts` | `FileEntry` interface matching backend `fileResponse` |
| Create | `src/features/files/api/files.ts` | `fetchFiles(parentId?)` — calls `/api/files` |
| Create | `src/features/files/queries/queryKeys.ts` | Query key constants |
| Create | `src/features/files/queries/useFiles.ts` | React Query hook wrapping `fetchFiles` |
| Create | `src/features/files/ui/FileRow.tsx` | Single row: icon + name + size + optional chevron |
| Create | `src/features/files/ui/FileRow.tests.tsx` | Tests for FileRow |
| Create | `src/features/files/ui/FileBrowserWidget.tsx` | Breadcrumb + `..` row + file list, owns nav stack state |
| Create | `src/features/files/ui/FileBrowserWidget.tests.tsx` | Tests for FileBrowserWidget |
| Create | `src/features/files/index.ts` | Barrel: re-exports `FileBrowserWidget` |
| Create | `src/shared/ui/NavBar.tsx` | Bottom tab bar (Home + Files tabs) |
| Create | `src/shared/ui/NavBar.tests.tsx` | Tests for NavBar |
| Create | `src/pages/files/PageFiles.tsx` | Page — composes layout + heading + widget |
| Create | `src/pages/files/PageFiles.tests.tsx` | Smoke test for PageFiles |
| Modify | `src/app/router.tsx` | Add `filesRoute` with `parent_id` search param |
| Modify | `src/layouts/LayoutMain.tsx` | Add `<NavBar />`, add `pb-24` to `<main>` |

---

## Task 1: FileEntry type + API function

**Files:**
- Create: `src/features/files/files.types.ts`
- Create: `src/features/files/api/files.ts`

The backend returns an array of `fileResponse` objects. The relevant fields:

```json
[
  { "id": 1, "parent_id": null, "name": "backups", "path": "/backups",
    "size": 0, "is_dir": true, "modified_at": 1706000000 }
]
```

- [ ] **Step 1: Create the FileEntry type**

```ts
// src/features/files/files.types.ts
export interface FileEntry {
  id: number;
  parent_id: number | null;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  modified_at: number;
}
```

- [ ] **Step 2: Create the API fetch function**

```ts
// src/features/files/api/files.ts
import { apiClient } from '@/shared/api/client';

import type { FileEntry } from '../files.types';

export const fetchFiles = (parentId?: number): Promise<FileEntry[]> => {
  const path = parentId !== undefined ? `/files?parent_id=${parentId}` : '/files';
  return apiClient<FileEntry[]>(path);
};
```

- [ ] **Step 3: Commit**

```bash
git add src/features/files/files.types.ts src/features/files/api/files.ts
git commit -m "feat: add FileEntry type and fetchFiles API function"
```

---

## Task 2: React Query hook

**Files:**
- Create: `src/features/files/queries/queryKeys.ts`
- Create: `src/features/files/queries/useFiles.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/files/queries/useFiles.tests.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryProvider } from '@/app/providers/QueryProvider';

import * as filesApi from '../api/files';
import { useFiles } from './useFiles';

vi.mock('../api/files');
const mockFetchFiles = vi.mocked(filesApi.fetchFiles);

const mockEntry = {
  id: 1, parent_id: null, name: 'backups',
  path: '/backups', size: 0, is_dir: true, modified_at: 0,
};

describe('useFiles', () => {
  it('fetches root entries when no parentId is given', async () => {
    mockFetchFiles.mockResolvedValue([mockEntry]);

    const { result } = renderHook(() => useFiles(undefined), {
      wrapper: QueryProvider,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchFiles).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([mockEntry]);
  });

  it('fetches children when parentId is provided', async () => {
    mockFetchFiles.mockResolvedValue([]);

    const { result } = renderHook(() => useFiles(42), {
      wrapper: QueryProvider,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchFiles).toHaveBeenCalledWith(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- useFiles
```

Expected: FAIL — `useFiles` not found

- [ ] **Step 3: Create query keys**

```ts
// src/features/files/queries/queryKeys.ts
export const QueryKeys = {
  FILES: 'files',
} as const;
```

- [ ] **Step 4: Create the hook**

```ts
// src/features/files/queries/useFiles.ts
import { useQuery } from '@tanstack/react-query';

import { fetchFiles } from '../api/files';
import { QueryKeys } from './queryKeys';

export const useFiles = (parentId: number | undefined) =>
  useQuery({
    queryKey: [QueryKeys.FILES, parentId],
    queryFn: () => fetchFiles(parentId),
  });
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm run test -- useFiles
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/files/queries/
git commit -m "feat: add useFiles React Query hook"
```

---

## Task 3: NavBar component

**Files:**
- Create: `src/shared/ui/NavBar.tsx`
- Create: `src/shared/ui/NavBar.tests.tsx`

NavBar reads the current pathname from `useRouterState` to determine which tab is active. It uses `useNavigate` to change routes on click.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/shared/ui/NavBar.tests.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useRouterState: vi.fn(),
  useNavigate: vi.fn(),
}));

import { useNavigate, useRouterState } from '@tanstack/react-router';
import { NavBar } from './NavBar';

const mockUseRouterState = vi.mocked(useRouterState);
const mockUseNavigate = vi.mocked(useNavigate);

describe('NavBar', () => {
  it('marks Home as active on the root route', () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/' } } as ReturnType<typeof useRouterState>);
    mockUseNavigate.mockReturnValue(vi.fn());

    render(<NavBar />);

    expect(screen.getByRole('button', { name: /home/i })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /files/i })).not.toHaveAttribute('data-active', 'true');
  });

  it('marks Files as active on the /files route', () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/files' } } as ReturnType<typeof useRouterState>);
    mockUseNavigate.mockReturnValue(vi.fn());

    render(<NavBar />);

    expect(screen.getByRole('button', { name: /files/i })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /home/i })).not.toHaveAttribute('data-active', 'true');
  });

  it('navigates to / when Home is clicked', async () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/files' } } as ReturnType<typeof useRouterState>);
    const navigate = vi.fn();
    mockUseNavigate.mockReturnValue(navigate);

    render(<NavBar />);
    await userEvent.click(screen.getByRole('button', { name: /home/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('navigates to /files when Files is clicked', async () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: '/' } } as ReturnType<typeof useRouterState>);
    const navigate = vi.fn();
    mockUseNavigate.mockReturnValue(navigate);

    render(<NavBar />);
    await userEvent.click(screen.getByRole('button', { name: /files/i }));

    expect(navigate).toHaveBeenCalledWith({ to: '/files' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- NavBar.tests
```

Expected: FAIL — `NavBar` not found

- [ ] **Step 3: Implement NavBar**

```tsx
// src/shared/ui/NavBar.tsx
import { useNavigate, useRouterState } from '@tanstack/react-router';

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 22V12h6v10"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FilesIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke={active ? '#3b82f6' : '#aeaeb2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-2xl px-4 py-2 shadow-md ring-1 ring-black/[0.06]">
        <button
          aria-label="Home"
          data-active={isHome || undefined}
          onClick={() => navigate({ to: '/' })}
          className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-xl transition-colors ${
            isHome ? 'bg-blue-50' : ''
          }`}
        >
          <HomeIcon active={isHome} />
          <span className={`text-[10px] font-${isHome ? 'bold' : 'medium'} ${isHome ? 'text-blue-500' : 'text-gray-400'}`}>
            Home
          </span>
        </button>

        <button
          aria-label="Files"
          data-active={isFiles || undefined}
          onClick={() => navigate({ to: '/files' })}
          className={`flex flex-col items-center gap-1 px-5 py-1.5 rounded-xl transition-colors ${
            isFiles ? 'bg-blue-50' : ''
          }`}
        >
          <FilesIcon active={isFiles} />
          <span className={`text-[10px] font-${isFiles ? 'bold' : 'medium'} ${isFiles ? 'text-blue-500' : 'text-gray-400'}`}>
            Files
          </span>
        </button>
      </div>
    </nav>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test -- NavBar.tests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/NavBar.tsx src/shared/ui/NavBar.tests.tsx
git commit -m "feat: add NavBar bottom tab component"
```

---

## Task 4: LayoutMain

**Files:**
- Modify: `src/layouts/LayoutMain.tsx`

- [ ] **Step 1: Write the LayoutMain test**

```tsx
// src/layouts/LayoutMain.tests.tsx  (already exists — ADD this test to it)
```

First read the existing file to see what's already there, then add:

```tsx
it('renders the NavBar', () => {
  // mock useRouterState for NavBar
  // render LayoutMain with a RouterProvider or by mocking the router hooks
});
```

Actually LayoutMain renders `<Outlet />` and `<NavBar />`. Since NavBar uses router hooks and Outlet requires a router, testing LayoutMain in isolation is complex. A smoke test verifying the nav landmark renders is sufficient.

Read `src/layouts/LayoutDashboard.tests.tsx` for the existing pattern, then add to `src/layouts/LayoutMain.tests.tsx`:

- [ ] **Step 1: Read existing LayoutMain tests**

```bash
cat frontend/src/layouts/LayoutDashboard.tests.tsx
```

- [ ] **Step 2: Add NavBar smoke test to LayoutMain.tests.tsx**

Open `src/layouts/LayoutMain.tests.tsx`. It doesn't exist yet — create it:

```tsx
// src/layouts/LayoutMain.tests.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/NavBar', () => ({
  NavBar: () => <nav aria-label="main navigation" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div />,
}));

import { LayoutMain } from './LayoutMain';

describe('LayoutMain', () => {
  it('renders the app name in the header', () => {
    render(<LayoutMain />);
    expect(screen.getByText('Pi Manager')).toBeInTheDocument();
  });

  it('renders the NavBar', () => {
    render(<LayoutMain />);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend && npm run test -- LayoutMain.tests
```

Expected: FAIL — NavBar not in LayoutMain yet

- [ ] **Step 4: Update LayoutMain**

```tsx
// src/layouts/LayoutMain.tsx
import { Outlet } from '@tanstack/react-router';

import { NavBar } from '@/shared/ui/NavBar';

export const LayoutMain = () => (
  <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 h-12 flex items-center">
        <span className="text-sm font-semibold text-gray-800 tracking-tight">Pi Manager</span>
      </div>
    </header>
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 pb-24">
      <Outlet />
    </main>
    <NavBar />
  </div>
);
```

- [ ] **Step 5: Run tests to verify LayoutMain tests pass**

```bash
cd frontend && npm run test -- LayoutMain.tests
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/layouts/LayoutMain.tsx src/layouts/LayoutMain.tests.tsx
git commit -m "feat: add NavBar to LayoutMain"
```

---

## Task 5: FileRow component

**Files:**
- Create: `src/features/files/ui/FileRow.tsx`
- Create: `src/features/files/ui/FileRow.tests.tsx`

Each row shows: icon (folder blue / file gray), name, size (formatted for files, `—` for dirs), and a trailing chevron for folders only. The `..` row is a special case: gray back-chevron icon, muted `..` text, no size.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/files/ui/FileRow.tests.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';
import { FileRow } from './FileRow';

const dir: FileEntry = {
  id: 1, parent_id: null, name: 'backups',
  path: '/backups', size: 0, is_dir: true, modified_at: 0,
};

const file: FileEntry = {
  id: 2, parent_id: 1, name: 'backup.tar.gz',
  path: '/backups/backup.tar.gz', size: 230 * 1024 * 1024, is_dir: false, modified_at: 0,
};

describe('FileRow', () => {
  it('renders the entry name', () => {
    render(<FileRow entry={dir} onClick={vi.fn()} />);
    expect(screen.getByText('backups')).toBeInTheDocument();
  });

  it('shows — as size for directories', () => {
    render(<FileRow entry={dir} onClick={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows formatted size for files', () => {
    render(<FileRow entry={file} onClick={vi.fn()} />);
    expect(screen.getByText('230 MB')).toBeInTheDocument();
  });

  it('calls onClick when a directory row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={dir} onClick={onClick} />);
    await userEvent.click(screen.getByText('backups'));
    expect(onClick).toHaveBeenCalledWith(dir);
  });

  it('does not call onClick when a file row is clicked', async () => {
    const onClick = vi.fn();
    render(<FileRow entry={file} onClick={onClick} />);
    await userEvent.click(screen.getByText('backup.tar.gz'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a .. row when isParent is true', () => {
    render(<FileRow isParent onParentClick={vi.fn()} />);
    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('calls onParentClick when .. row is clicked', async () => {
    const onParentClick = vi.fn();
    render(<FileRow isParent onParentClick={onParentClick} />);
    await userEvent.click(screen.getByText('..'));
    expect(onParentClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- FileRow.tests
```

Expected: FAIL — `FileRow` not found

- [ ] **Step 3: Implement FileRow**

```tsx
// src/features/files/ui/FileRow.tsx
import type { FileEntry } from '../files.types';

const formatFileSize = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
      stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14 2 14 8 20 8" stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <polyline points="15 18 9 12 15 6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type FileRowProps =
  | { isParent: true; onParentClick: () => void; entry?: never; onClick?: never }
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never };

export const FileRow = ({ isParent, entry, onClick, onParentClick }: FileRowProps) => {
  if (isParent) {
    return (
      <button
        onClick={onParentClick}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <BackIcon />
        </div>
        <span className="text-sm text-gray-400">..</span>
      </button>
    );
  }

  const isDir = entry.is_dir;

  return (
    <button
      onClick={isDir ? () => onClick(entry) : undefined}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
        isDir ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        isDir ? 'bg-blue-50' : 'bg-gray-100'
      }`}>
        {isDir ? <FolderIcon /> : <FileIcon />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{isDir ? '—' : formatFileSize(entry.size)}</p>
      </div>
      {isDir && (
        <span className="text-gray-300 text-base shrink-0">›</span>
      )}
    </button>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test -- FileRow.tests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/files/ui/FileRow.tsx src/features/files/ui/FileRow.tests.tsx
git commit -m "feat: add FileRow component"
```

---

## Task 6: FileBrowserWidget

**Files:**
- Create: `src/features/files/ui/FileBrowserWidget.tsx`
- Create: `src/features/files/ui/FileBrowserWidget.tests.tsx`

**Navigation state design:**
- `stack`: `Array<{ id: number | undefined; name: string }>` — starts as `[{ id: undefined, name: 'Root' }]`
- URL `parent_id` is the source of truth for the current API call; `stack` is derived from navigation actions
- On navigate into a folder: push `{ id: entry.id, name: entry.name }` to stack, update URL
- On `..` click: pop stack, navigate URL to the previous entry's id
- On initial load with `parent_id` but empty stack (refresh): infer folder name from first child's path (take `dirname`, last segment); `..` goes to root

**Breadcrumb reconstruction on refresh:**
```
children[0].path = "/backups/2025/backup.tar.gz"
→ split('/').filter(Boolean) = ['backups', '2025', 'backup.tar.gz']
→ parent folder name = parts[parts.length - 2] = '2025'
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/files/ui/FileBrowserWidget.tests.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(),
  useNavigate: vi.fn(),
}));
vi.mock('../queries/useFiles');

import { useNavigate, useSearch } from '@tanstack/react-router';
import * as filesHook from '../queries/useFiles';
import { FileBrowserWidget } from './FileBrowserWidget';

const mockUseSearch = vi.mocked(useSearch);
const mockUseNavigate = vi.mocked(useNavigate);
const mockUseFiles = vi.spyOn(filesHook, 'useFiles');

const rootEntries = [
  { id: 1, parent_id: null, name: 'backups', path: '/backups', size: 0, is_dir: true, modified_at: 0 },
  { id: 2, parent_id: null, name: 'config.yaml', path: '/config.yaml', size: 4096, is_dir: false, modified_at: 0 },
];

describe('FileBrowserWidget', () => {
  it('renders a loading spinner while fetching', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText(/failed to load files/i)).toBeInTheDocument();
  });

  it('renders file entries on success', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('backups')).toBeInTheDocument();
    expect(screen.getByText('config.yaml')).toBeInTheDocument();
  });

  it('does not render the .. row at root', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.queryByText('..')).not.toBeInTheDocument();
  });

  it('renders the .. row when inside a folder', () => {
    mockUseSearch.mockReturnValue({ parent_id: 1 });
    mockUseNavigate.mockReturnValue(vi.fn());
    const children = [
      { id: 3, parent_id: 1, name: 'jan.tar.gz', path: '/backups/jan.tar.gz', size: 1024, is_dir: false, modified_at: 0 },
    ];
    mockUseFiles.mockReturnValue({ data: children, isLoading: false, isError: false } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);

    expect(screen.getByText('..')).toBeInTheDocument();
  });

  it('navigates into a folder when a directory row is clicked', async () => {
    const navigate = vi.fn();
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(navigate);
    mockUseFiles.mockReturnValue({ data: rootEntries, isLoading: false, isError: false } as ReturnType<typeof filesHook.useFiles>);

    render(<FileBrowserWidget />);
    await userEvent.click(screen.getByText('backups'));

    expect(navigate).toHaveBeenCalledWith({ to: '/files', search: { parent_id: 1 } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- FileBrowserWidget.tests
```

Expected: FAIL — `FileBrowserWidget` not found

- [ ] **Step 3: Implement FileBrowserWidget**

```tsx
// src/features/files/ui/FileBrowserWidget.tsx
import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import type { FileEntry } from '../files.types';
import { useFiles } from '../queries/useFiles';
import { FileRow } from './FileRow';

interface BreadcrumbEntry {
  id: number | undefined;
  name: string;
}

const deriveFolderName = (children: FileEntry[]): string | undefined => {
  if (children.length === 0) return undefined;
  const parts = children[0].path.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
};

export const FileBrowserWidget = () => {
  const { parent_id } = useSearch({ from: '/files' });
  const navigate = useNavigate();

  const [stack, setStack] = useState<BreadcrumbEntry[]>([{ id: undefined, name: 'Root' }]);

  const { data, isLoading, isError } = useFiles(parent_id);

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-500">
        Failed to load files. Is the API running?
      </div>
    );
  }

  // Derive breadcrumb name on refresh (stack only has Root)
  const isInsideFolder = parent_id !== undefined;
  const effectiveStack: BreadcrumbEntry[] = (() => {
    if (!isInsideFolder) return stack;
    if (stack.length > 1) return stack;
    // refreshed mid-tree — infer folder name from children
    const inferred = deriveFolderName(data);
    return inferred
      ? [{ id: undefined, name: 'Root' }, { id: parent_id, name: inferred }]
      : [{ id: undefined, name: 'Root' }];
  })();

  const handleNavigateInto = (entry: FileEntry) => {
    setStack(prev => [...prev, { id: entry.id, name: entry.name }]);
    navigate({ to: '/files', search: { parent_id: entry.id } });
  };

  const handleNavigateUp = () => {
    const newStack = effectiveStack.slice(0, -1);
    setStack(newStack);
    const parent = newStack[newStack.length - 1];
    if (parent.id === undefined) {
      navigate({ to: '/files', search: {} });
    } else {
      navigate({ to: '/files', search: { parent_id: parent.id } });
    }
  };

  const handleBreadcrumbRoot = () => {
    setStack([{ id: undefined, name: 'Root' }]);
    navigate({ to: '/files', search: {} });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 flex-wrap">
        {effectiveStack.map((crumb, i) => {
          const isLast = i === effectiveStack.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300 text-xs">›</span>}
              {i === 0 && !isLast ? (
                <button
                  onClick={handleBreadcrumbRoot}
                  className="text-xs font-medium text-blue-500 hover:underline"
                >
                  {crumb.name}
                </button>
              ) : (
                <span className={`text-xs font-${isLast ? 'semibold text-gray-900' : 'medium text-blue-500'}`}>
                  {crumb.name}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {/* File list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isInsideFolder && (
          <>
            <FileRow isParent onParentClick={handleNavigateUp} />
            <div className="border-t border-gray-50" />
          </>
        )}
        {data.length === 0 && !isInsideFolder && (
          <p className="text-sm text-gray-400 text-center py-10">Empty directory</p>
        )}
        {data.map((entry, i) => (
          <span key={entry.id}>
            {i > 0 && <div className="border-t border-gray-50 mx-4" />}
            <FileRow entry={entry} onClick={handleNavigateInto} />
          </span>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test -- FileBrowserWidget.tests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/files/ui/FileBrowserWidget.tsx src/features/files/ui/FileBrowserWidget.tests.tsx
git commit -m "feat: add FileBrowserWidget with breadcrumb navigation"
```

---

## Task 7: PageFiles + barrel exports

**Files:**
- Create: `src/pages/files/PageFiles.tsx`
- Create: `src/pages/files/PageFiles.tests.tsx`
- Create: `src/features/files/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/files/PageFiles.tests.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- PageFiles.tests
```

Expected: FAIL — `PageFiles` not found

- [ ] **Step 3: Create the barrel export**

```ts
// src/features/files/index.ts
export { FileBrowserWidget } from './ui/FileBrowserWidget';
```

- [ ] **Step 4: Create PageFiles**

```tsx
// src/pages/files/PageFiles.tsx
import { FileBrowserWidget } from '@/features/files';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageFiles = () => (
  <LayoutDashboard>
    <PageHeading>Files</PageHeading>
    <FileBrowserWidget />
  </LayoutDashboard>
);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && npm run test -- PageFiles.tests
```

Expected: PASS

- [ ] **Step 6: Add the /files route to router.tsx**

```tsx
// src/app/router.tsx
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { LayoutMain } from '@/layouts/LayoutMain';
import { PageDashboard } from '@/pages/dashboard/PageDashboard';
import { PageFiles } from '@/pages/files/PageFiles';

const rootRoute = createRootRoute({
  component: LayoutMain,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PageDashboard,
});

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files',
  validateSearch: (search: Record<string, unknown>) => ({
    parent_id: typeof search.parent_id === 'number' ? search.parent_id : undefined,
  }),
  component: PageFiles,
});

const routeTree = rootRoute.addChildren([dashboardRoute, filesRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 7: Run the full test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass

- [ ] **Step 8: Build to verify TypeScript is happy**

```bash
cd frontend && npm run build
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/features/files/index.ts src/pages/files/PageFiles.tsx src/pages/files/PageFiles.tests.tsx src/app/router.tsx
git commit -m "feat: add PageFiles page, wire up file browser, register /files route"
```
