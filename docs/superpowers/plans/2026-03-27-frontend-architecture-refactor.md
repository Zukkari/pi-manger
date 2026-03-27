# Frontend Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the React frontend so components own their data fetching, pages contain no raw HTML, and all exports are named.

**Architecture:** Extract data-fetching + loading/error handling into a new `DiskUsageWidget`. Introduce `LayoutDashboard` and `PageHeading` so `PageDashboard` is composed entirely of layouts and components. Convert all `export default` to named exports throughout.

**Tech Stack:** React 19, TypeScript, TanStack React Query, Vitest, Testing Library, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `features/disk-usage/ui/DiskUsageBar.tsx` | Remove `export default`, add named export |
| Modify | `features/disk-usage/ui/DiskUsageBar.tests.tsx` | Update import to named |
| Modify | `features/disk-usage/index.ts` | Fix barrel re-export |
| Modify | `app/providers/QueryProvider.tsx` | Remove `export default`, add named export |
| Modify | `main.tsx` | Update QueryProvider import |
| Modify | `layouts/LayoutMain.tsx` | Remove `export default`, add named export |
| Modify | `app/router.tsx` | Update LayoutMain and PageDashboard imports |
| Create | `shared/ui/PageHeading.tsx` | Reusable `<h1>` component |
| Create | `shared/ui/PageHeading.tests.tsx` | Tests for PageHeading |
| Create | `layouts/LayoutDashboard.tsx` | `flex flex-col gap-6` wrapper |
| Create | `layouts/LayoutDashboard.tests.tsx` | Tests for LayoutDashboard |
| Create | `features/disk-usage/ui/DiskUsageWidget.tsx` | Data-fetching widget (loading/error/success) |
| Create | `features/disk-usage/ui/DiskUsageWidget.tests.tsx` | Tests for all three states |
| Modify | `features/disk-usage/index.ts` | Add `DiskUsageWidget` export |
| Modify | `pages/dashboard/PageDashboard.tsx` | Compose from layouts + components only |
| Modify | `pages/dashboard/PageDashboard.tests.tsx` | Page-level composition test only |

---

## Task 1: Convert default exports to named exports

**Files:**
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx`
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx`
- Modify: `frontend/src/features/disk-usage/index.ts`
- Modify: `frontend/src/app/providers/QueryProvider.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/layouts/LayoutMain.tsx`
- Modify: `frontend/src/app/router.tsx`

- [ ] **Step 1: Convert DiskUsageBar to named export**

In `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx`, replace the last line:
```tsx
// Before:
export default DiskUsageBar;

// After:
export { DiskUsageBar };
```

And change the component declaration from:
```tsx
const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
```
to:
```tsx
export const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
```
Remove the standalone `export { DiskUsageBar };` line at the bottom.

- [ ] **Step 2: Update DiskUsageBar.tests.tsx import**

In `frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx`, line 4:
```tsx
// Before:
import DiskUsageBar from './DiskUsageBar';

// After:
import { DiskUsageBar } from './DiskUsageBar';
```

- [ ] **Step 3: Fix barrel re-export in index.ts**

Replace `frontend/src/features/disk-usage/index.ts` entirely:
```ts
export { DiskUsageBar } from './ui/DiskUsageBar';
export { useDiskUsage } from './queries/useDiskUsage';
```

- [ ] **Step 4: Convert QueryProvider to named export**

In `frontend/src/app/providers/QueryProvider.tsx`, change:
```tsx
const QueryProvider = ({ children }: QueryProviderProps) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

export default QueryProvider;
```
to:
```tsx
export const QueryProvider = ({ children }: QueryProviderProps) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
```

- [ ] **Step 5: Update QueryProvider import in main.tsx**

In `frontend/src/main.tsx`, line 5:
```tsx
// Before:
import QueryProvider from './app/providers/QueryProvider';

// After:
import { QueryProvider } from './app/providers/QueryProvider';
```

- [ ] **Step 6: Convert LayoutMain to named export**

In `frontend/src/layouts/LayoutMain.tsx`, change:
```tsx
const LayoutMain = () => (
  // ...
);

export default LayoutMain;
```
to:
```tsx
export const LayoutMain = () => (
  // ... (body unchanged)
);
```

- [ ] **Step 7: Update router.tsx imports**

In `frontend/src/app/router.tsx`, lines 3–4:
```tsx
// Before:
import LayoutMain from '@/layouts/LayoutMain';
import PageDashboard from '@/pages/dashboard/PageDashboard';

// After:
import { LayoutMain } from '@/layouts/LayoutMain';
import { PageDashboard } from '@/pages/dashboard/PageDashboard';
```

Note: `PageDashboard` still has `export default` at this point — that's fine, it will be fixed in Task 5. The import change here will be compatible once Task 5 is done.

Actually — convert `PageDashboard` now too to avoid a two-step import change. In `frontend/src/pages/dashboard/PageDashboard.tsx`:
```tsx
// Before:
const PageDashboard = () => { ... };
export default PageDashboard;

// After:
export const PageDashboard = () => { ... };
// (remove export default line)
```

- [ ] **Step 8: Update PageDashboard.tests.tsx import**

In `frontend/src/pages/dashboard/PageDashboard.tests.tsx`, line 6:
```tsx
// Before:
import PageDashboard from './PageDashboard';

// After:
import { PageDashboard } from './PageDashboard';
```

- [ ] **Step 9: Run all tests to verify nothing is broken**

```bash
cd frontend && npm run test -- --run
```

Expected: all existing tests pass. If any fail, the import conversions above are incomplete — check the error message for which import is still pointing to a default export.

- [ ] **Step 10: Commit**

```bash
cd frontend && git add src/features/disk-usage/ui/DiskUsageBar.tsx src/features/disk-usage/ui/DiskUsageBar.tests.tsx src/features/disk-usage/index.ts src/app/providers/QueryProvider.tsx src/main.tsx src/layouts/LayoutMain.tsx src/app/router.tsx src/pages/dashboard/PageDashboard.tsx src/pages/dashboard/PageDashboard.tests.tsx && git commit -m "refactor: convert all default exports to named exports"
```

---

## Task 2: Create `PageHeading` component

**Files:**
- Create: `frontend/src/shared/ui/PageHeading.tsx`
- Create: `frontend/src/shared/ui/PageHeading.tests.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/shared/ui/PageHeading.tests.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeading } from './PageHeading';

describe('PageHeading', () => {
  it('renders children as an h1 heading', () => {
    render(<PageHeading>Dashboard</PageHeading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- --run src/shared/ui/PageHeading.tests.tsx
```

Expected: FAIL — `Cannot find module './PageHeading'`

- [ ] **Step 3: Implement `PageHeading`**

Create `frontend/src/shared/ui/PageHeading.tsx`:
```tsx
import type { ReactNode } from 'react';

interface PageHeadingProps {
  children: ReactNode;
}

export const PageHeading = ({ children }: PageHeadingProps) => (
  <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">{children}</h1>
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm run test -- --run src/shared/ui/PageHeading.tests.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/shared/ui/PageHeading.tsx src/shared/ui/PageHeading.tests.tsx && git commit -m "feat: add PageHeading shared component"
```

---

## Task 3: Create `LayoutDashboard`

**Files:**
- Create: `frontend/src/layouts/LayoutDashboard.tsx`
- Create: `frontend/src/layouts/LayoutDashboard.tests.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/layouts/LayoutDashboard.tests.tsx`:
```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- --run src/layouts/LayoutDashboard.tests.tsx
```

Expected: FAIL — `Cannot find module './LayoutDashboard'`

- [ ] **Step 3: Implement `LayoutDashboard`**

Create `frontend/src/layouts/LayoutDashboard.tsx`:
```tsx
import type { ReactNode } from 'react';

interface LayoutDashboardProps {
  children: ReactNode;
}

export const LayoutDashboard = ({ children }: LayoutDashboardProps) => (
  <div className="flex flex-col gap-6">{children}</div>
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm run test -- --run src/layouts/LayoutDashboard.tests.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/layouts/LayoutDashboard.tsx src/layouts/LayoutDashboard.tests.tsx && git commit -m "feat: add LayoutDashboard layout"
```

---

## Task 4: Create `DiskUsageWidget`

**Files:**
- Create: `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx`
- Create: `frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx`
- Modify: `frontend/src/features/disk-usage/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '../queries/useDiskUsage';

import { DiskUsageWidget } from './DiskUsageWidget';

vi.mock('../queries/useDiskUsage');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');

const mockData = {
  path: '/data',
  total_bytes: 100 * 1024 ** 3,
  used_bytes: 40 * 1024 ** 3,
  free_bytes: 60 * 1024 ** 3,
  used_percent: 40,
};

describe('DiskUsageWidget', () => {
  it('renders a loading spinner and no progress bar while fetching', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders an error message when the query fails', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByText(/failed to load disk usage/i)).toBeInTheDocument();
  });

  it('renders DiskUsageBar with data on success', () => {
    mockUseDiskUsage.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('/data')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageWidget.tests.tsx
```

Expected: FAIL — `Cannot find module './DiskUsageWidget'`

- [ ] **Step 3: Implement `DiskUsageWidget`**

Create `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx`:
```tsx
import { useDiskUsage } from '../queries/useDiskUsage';

import { DiskUsageBar } from './DiskUsageBar';

export const DiskUsageWidget = () => {
  const { data, isLoading, isError } = useDiskUsage();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-500">
        Failed to load disk usage. Is the API running?
      </div>
    );
  }

  return <DiskUsageBar data={data} />;
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageWidget.tests.tsx
```

Expected: 3 tests PASS

- [ ] **Step 5: Export DiskUsageWidget from the feature barrel**

In `frontend/src/features/disk-usage/index.ts`:
```ts
export { DiskUsageBar } from './ui/DiskUsageBar';
export { DiskUsageWidget } from './ui/DiskUsageWidget';
export { useDiskUsage } from './queries/useDiskUsage';
```

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/features/disk-usage/ui/DiskUsageWidget.tsx src/features/disk-usage/ui/DiskUsageWidget.tests.tsx src/features/disk-usage/index.ts && git commit -m "feat: add DiskUsageWidget with self-contained data fetching"
```

---

## Task 5: Refactor `PageDashboard` to layouts + components only

**Files:**
- Modify: `frontend/src/pages/dashboard/PageDashboard.tsx`
- Modify: `frontend/src/pages/dashboard/PageDashboard.tests.tsx`

- [ ] **Step 1: Update PageDashboard tests**

Replace `frontend/src/pages/dashboard/PageDashboard.tests.tsx` entirely:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '@/features/disk-usage/queries/useDiskUsage';

import { PageDashboard } from './PageDashboard';

vi.mock('@/features/disk-usage/queries/useDiskUsage');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');

describe('PageDashboard', () => {
  it('renders the page heading and disk usage widget', () => {
    mockUseDiskUsage.mockReturnValue({
      data: {
        path: '/data',
        total_bytes: 100 * 1024 ** 3,
        used_bytes: 40 * 1024 ** 3,
        free_bytes: 60 * 1024 ** 3,
        used_percent: 40,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<PageDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- --run src/pages/dashboard/PageDashboard.tests.tsx
```

Expected: FAIL — the heading assertion fails because `PageDashboard` currently renders `<h1>` directly but the test now expects a proper heading role. (If it passes already, move on — the refactor will keep it green.)

- [ ] **Step 3: Rewrite `PageDashboard`**

Replace `frontend/src/pages/dashboard/PageDashboard.tsx` entirely:
```tsx
import { DiskUsageWidget } from '@/features/disk-usage';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
  </LayoutDashboard>
);
```

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests PASS. If any fail, check import paths — the `@/` alias maps to `src/`.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/pages/dashboard/PageDashboard.tsx src/pages/dashboard/PageDashboard.tests.tsx && git commit -m "refactor: PageDashboard composed from layouts and components only"
```
