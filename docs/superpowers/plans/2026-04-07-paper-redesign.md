# Paper Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the pi-manager frontend with the Paper aesthetic — off-white ruled-paper background, Bebas Neue + DM Sans + DM Mono typography, red accent, zero border-radius, offset box shadows — and add UX improvements: skeleton loading states, empty state design, and `modified_at` display in file rows.

**Architecture:** CSS custom properties layer on top of Tailwind — tokens defined in `index.css`, referenced via inline `style` props in components. Layout utilities (flex, padding, max-width) stay as Tailwind classes. Visual properties (colors, fonts, shadows, borders) use `var(--paper-*)` tokens. No backend changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, TanStack Router

---

## File Map

| File | Change |
|---|---|
| `frontend/index.html` | Add Google Fonts `<link>` tags |
| `frontend/src/index.css` | Paper design tokens, body styles, live-dot animation |
| `frontend/src/layouts/LayoutMain.tsx` | Paper header, remove NavBar from bottom, add NavBar below header |
| `frontend/src/shared/ui/NavBar.tsx` | Rewrite as top tab bar with Paper styling |
| `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx` | Full visual rewrite |
| `frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx` | Update color + stat tests for new structure |
| `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx` | Replace spinner with skeleton |
| `frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx` | Update loading test to match skeleton |
| `frontend/src/features/files/ui/FileRow.tsx` | Paper styles, add `modified_at` display |
| `frontend/src/features/files/ui/FileRow.tests.tsx` | Add `modified_at` display test |
| `frontend/src/features/files/ui/FileBrowserWidget.tsx` | Paper styles, skeleton, empty state |
| `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx` | Update loading test, add empty state test |
| `frontend/src/features/files/ui/DeleteConfirmDialog.tsx` | Full visual rewrite |

---

## Task 1: Design tokens, fonts, and global styles

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`

No tests for this task — visual verification only.

- [ ] **Step 1: Add Google Fonts to index.html**

Replace the `<title>frontend</title>` line in `frontend/index.html` with:

```html
    <title>Pi Manager</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Replace index.css with Paper tokens**

Replace the entire contents of `frontend/src/index.css` with:

```css
@import 'tailwindcss';

/* ── Paper design tokens ─────────────────────────── */
:root {
  --paper-bg:           #f5f0e8;
  --paper-bg-texture:   repeating-linear-gradient(
                          0deg,
                          transparent,
                          transparent 31px,
                          rgba(0, 0, 0, 0.04) 31px,
                          rgba(0, 0, 0, 0.04) 32px
                        );
  --paper-surface:      #faf7f2;
  --paper-surface-hi:   #ffffff;
  --paper-border:       rgba(0, 0, 0, 0.10);
  --paper-border-bold:  rgba(0, 0, 0, 0.20);
  --paper-text:         #1a1208;
  --paper-muted:        #6b5e45;
  --paper-dim:          #c8b898;
  --paper-accent:       #c0392b;
  --paper-safe:         #16a34a;
  --paper-warn:         #d97706;
  --paper-danger:       #c0392b;

  --font-display: 'Bebas Neue', sans-serif;
  --font-ui:      'DM Sans', sans-serif;
  --font-data:    'DM Mono', monospace;

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Global base ─────────────────────────────────── */
body {
  margin: 0;
  font-family: var(--font-ui);
  background-color: var(--paper-bg);
  background-image: var(--paper-bg-texture);
  color: var(--paper-text);
}

/* ── Live indicator dot (used in LayoutMain) ─────── */
.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--paper-safe);
  animation: paper-pulse 2.5s infinite;
}

@keyframes paper-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

/* ── File row entrance animation ─────────────────── */
@keyframes paper-slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ── Skeleton shimmer ────────────────────────────── */
@keyframes paper-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

.paper-skeleton {
  background: linear-gradient(
    90deg,
    var(--paper-surface) 25%,
    rgba(0, 0, 0, 0.06) 50%,
    var(--paper-surface) 75%
  );
  background-size: 200% 100%;
  animation: paper-shimmer 1.5s infinite;
}
```

- [ ] **Step 3: Verify fonts load**

Run `cd frontend && npm run dev`, open `http://localhost:5173`, open DevTools → Network → filter by "fonts.gstatic.com". Confirm Bebas Neue, DM Sans, DM Mono all load (200 status).

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/index.css
git commit -m "feat(ui): add Paper design tokens and Google Fonts"
```

---

## Task 2: Layout and navigation

**Files:**
- Modify: `frontend/src/layouts/LayoutMain.tsx`
- Modify: `frontend/src/shared/ui/NavBar.tsx`

No tests for this task — visual verification only.

- [ ] **Step 1: Rewrite NavBar.tsx as Paper top tabs**

Replace the entire contents of `frontend/src/shared/ui/NavBar.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';

const tabStyle = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-display)',
  fontSize: '17px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  padding: '8px 16px 10px',
  background: 'none',
  border: 'none',
  borderBottom: active ? '3px solid var(--paper-accent)' : '3px solid transparent',
  marginBottom: '-1px',
  color: active ? 'var(--paper-accent)' : 'var(--paper-muted)',
  cursor: 'pointer',
  transition: 'color 0.15s',
});

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome  = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <div style={{ borderBottom: '1px solid var(--paper-border)' }}>
      <div style={{ maxWidth: '440px', margin: '0 auto', display: 'flex' }}>
        <button
          type="button"
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          onClick={() => navigate({ to: '/' })}
          style={tabStyle(isHome)}
        >
          Home
        </button>
        <button
          type="button"
          aria-label="Files"
          aria-current={isFiles ? 'page' : undefined}
          onClick={() => navigate({ to: '/files', search: { parent_id: undefined } })}
          style={tabStyle(isFiles)}
        >
          Files
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Rewrite LayoutMain.tsx with Paper header**

Replace the entire contents of `frontend/src/layouts/LayoutMain.tsx`:

```tsx
import { Outlet } from '@tanstack/react-router';

import { NavBar } from '@/shared/ui/NavBar';

export const LayoutMain = () => (
  <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: 'var(--paper-bg)',
      backgroundImage: 'var(--paper-bg-texture)',
      borderBottom: '3px solid var(--paper-text)',
    }}>
      <div style={{
        maxWidth: '440px',
        margin: '0 auto',
        padding: '16px 20px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--paper-text)',
        }}>
          Pi Manager
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="live-dot" aria-hidden="true" />
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: '10px',
            color: 'var(--paper-muted)',
            letterSpacing: '0.05em',
          }}>
            LIVE
          </span>
        </div>
      </div>
    </header>
    <NavBar />
    <main style={{
      flex: 1,
      maxWidth: '440px',
      margin: '0 auto',
      width: '100%',
      padding: '24px 20px 40px',
    }}>
      <Outlet />
    </main>
  </div>
);
```

- [ ] **Step 3: Visual check**

Run `cd frontend && npm run dev`. Confirm:
- Header shows "PI MANAGER" in Bebas Neue with ruled-paper background and thick bottom border
- "Home" and "Files" tabs appear below header in Bebas Neue, active tab is red
- No floating bottom nav
- Pulsing green "LIVE" dot in header

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/LayoutMain.tsx frontend/src/shared/ui/NavBar.tsx
git commit -m "feat(ui): Paper header and top tab navigation"
```

---

## Task 3: DiskUsageBar visual rewrite

**Files:**
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx`
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx`

- [ ] **Step 1: Update the tests to match the new component structure**

Replace the entire contents of `frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageBar.tests.tsx
```

Expected: FAIL — `stat-used` not found, `data-state` attribute not found.

- [ ] **Step 3: Rewrite DiskUsageBar.tsx**

Replace the entire contents of `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx`:

```tsx
import type { DiskUsageBarProps } from './DiskUsageBar.types';

const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
};

type BarState = 'safe' | 'warn' | 'danger';

const getBarState = (percent: number): BarState => {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warn';
  return 'safe';
};

const BAR_COLORS: Record<BarState, string> = {
  safe:   'var(--paper-accent)',
  warn:   'var(--paper-warn)',
  danger: 'var(--paper-danger)',
};

export const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
  const { path, total_bytes, used_bytes, free_bytes, used_percent } = data;
  const roundedPercent = Math.round(used_percent);
  const barState = getBarState(used_percent);

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
      padding: '24px',
      width: '100%',
    }}>
      {/* Hero row: percentage + path */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '88px',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: 'var(--paper-text)',
          }}>
            {roundedPercent}%
          </div>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: '11px',
            color: 'var(--paper-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: '2px',
          }}>
            used
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-muted)' }}>
            {path}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '8px', background: 'rgba(0,0,0,0.08)', marginBottom: '16px' }}>
        <div
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-state={barState}
          style={{
            height: '100%',
            width: `${used_percent}%`,
            background: BAR_COLORS[barState],
            transition: 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '1px',
        background: 'var(--paper-border)',
        border: '1px solid var(--paper-border)',
      }}>
        {([
          { label: 'Used',  value: formatBytes(used_bytes),  testId: 'stat-used'  },
          { label: 'Free',  value: formatBytes(free_bytes),  testId: 'stat-free'  },
          { label: 'Total', value: formatBytes(total_bytes), testId: 'stat-total' },
        ] as const).map(({ label, value, testId }) => (
          <div key={label} style={{ background: 'var(--paper-surface)', padding: '12px' }}>
            <div style={{
              fontFamily: 'var(--font-data)',
              fontSize: '8px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--paper-muted)',
              marginBottom: '3px',
            }}>
              {label}
            </div>
            <div
              data-testid={testId}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--paper-text)',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageBar.tests.tsx
```

Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/disk-usage/ui/DiskUsageBar.tsx \
        frontend/src/features/disk-usage/ui/DiskUsageBar.tests.tsx
git commit -m "feat(ui): Paper DiskUsageBar with stat cells and data-state bar"
```

---

## Task 4: DiskUsageWidget skeleton loading state

**Files:**
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx`
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx`

- [ ] **Step 1: Update the loading test to assert skeleton structure**

In `frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx`, replace only the loading test:

```tsx
  it('renders a skeleton and no progress bar while fetching', () => {
    mockUseDiskUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    render(<DiskUsageWidget />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
```

The other two tests (`renders an error message`, `renders DiskUsageBar with data`) are unchanged.

- [ ] **Step 2: Run tests to confirm the loading test still passes (no regression yet)**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageWidget.tests.tsx
```

Expected: PASS — the test text changed but the assertions match the current spinner (which also has `role="status"`).

- [ ] **Step 3: Rewrite DiskUsageWidget.tsx with skeleton and Paper error state**

Replace the entire contents of `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx`:

```tsx
import { useDiskUsage } from '../queries/useDiskUsage';

import { DiskUsageBar } from './DiskUsageBar';

const DiskUsageSkeleton = () => (
  <div
    role="status"
    aria-label="Loading disk usage"
    style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
      padding: '24px',
    }}
  >
    {/* Percentage placeholder */}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div>
        <div className="paper-skeleton" style={{ width: '120px', height: '72px', marginBottom: '8px' }} />
        <div className="paper-skeleton" style={{ width: '40px', height: '10px' }} />
      </div>
      <div className="paper-skeleton" style={{ width: '80px', height: '14px' }} />
    </div>
    {/* Bar placeholder */}
    <div className="paper-skeleton" style={{ height: '8px', marginBottom: '16px' }} />
    {/* Stats placeholder */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--paper-border)' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: 'var(--paper-surface)', padding: '12px' }}>
          <div className="paper-skeleton" style={{ width: '30px', height: '8px', marginBottom: '6px' }} />
          <div className="paper-skeleton" style={{ width: '60px', height: '14px' }} />
        </div>
      ))}
    </div>
  </div>
);

export const DiskUsageWidget = () => {
  const { data, isLoading, isError } = useDiskUsage();

  if (isLoading) return <DiskUsageSkeleton />;

  if (isError || !data) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        padding: '24px',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        color: 'var(--paper-danger)',
      }}>
        Failed to load disk usage. Is the API running?
      </div>
    );
  }

  return <DiskUsageBar data={data} />;
};
```

- [ ] **Step 4: Run tests to confirm they still pass**

```bash
cd frontend && npm run test -- --run src/features/disk-usage/ui/DiskUsageWidget.tests.tsx
```

Expected: PASS — 3 tests pass. The skeleton has `role="status"` and no `role="progressbar"`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx \
        frontend/src/features/disk-usage/ui/DiskUsageWidget.tests.tsx
git commit -m "feat(ui): Paper DiskUsageWidget skeleton loading state"
```

---

## Task 5: FileRow visual rewrite with modified_at

**Files:**
- Modify: `frontend/src/features/files/ui/FileRow.tsx`
- Modify: `frontend/src/features/files/ui/FileRow.tests.tsx`

- [ ] **Step 1: Add the modified_at test**

In `frontend/src/features/files/ui/FileRow.tests.tsx`, add this test inside the `describe('FileRow')` block after the existing tests:

```tsx
  it('shows the formatted modified date for files', () => {
    // 1712448000 = Apr 7, 2024 UTC
    const fileWithDate = { ...file, modified_at: 1712448000 };
    render(<FileRow entry={fileWithDate} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Apr 7')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
cd frontend && npm run test -- --run src/features/files/ui/FileRow.tests.tsx
```

Expected: FAIL — "Apr 7" not found (current component does not render `modified_at`).

- [ ] **Step 3: Rewrite FileRow.tsx**

Replace the entire contents of `frontend/src/features/files/ui/FileRow.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

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

const formatDate = (unixSec: number): string =>
  new Date(unixSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"
      stroke="var(--paper-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
      stroke="var(--paper-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
    <polyline points="14 2 14 8 20 8" stroke="var(--paper-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <polyline points="15 18 9 12 15 6" stroke="var(--paper-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const iconBoxStyle = (isDir: boolean): CSSProperties => ({
  width: '28px',
  height: '28px',
  border: '1px solid var(--paper-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  background: isDir ? 'rgba(192,57,43,0.06)' : 'transparent',
});

type FileRowProps =
  | { isParent: true; onParentClick: () => void; entry?: never; onClick?: never; onDelete?: never }
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never; onDelete: (entry: FileEntry) => void };

export const FileRow = ({ isParent, entry, onClick, onParentClick, onDelete }: FileRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderBottom: '1px solid var(--paper-border)',
    transition: 'background 0.1s',
  };

  if (isParent) {
    return (
      <button
        type="button"
        onClick={onParentClick}
        aria-label="Go to parent directory"
        style={{ ...rowStyle, width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={iconBoxStyle(true)}>
          <BackIcon />
        </div>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--paper-muted)' }}>
          ..
        </span>
      </button>
    );
  }

  const isDir = entry.is_dir;

  const nameAndMeta = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--font-ui)',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--paper-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {entry.name}
      </div>
    </div>
  );

  return (
    <div style={rowStyle}>
      {isDir ? (
        <button
          type="button"
          onClick={() => onClick(entry)}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          <div style={iconBoxStyle(true)}><FolderIcon /></div>
          {nameAndMeta}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div style={iconBoxStyle(false)}><FileIcon /></div>
          {nameAndMeta}
        </div>
      )}

      {/* Size + date */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '12px', color: 'var(--paper-muted)', fontWeight: 500 }}>
          {isDir ? '—' : formatFileSize(entry.size)}
        </span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)' }}>
          {formatDate(entry.modified_at)}
        </span>
      </div>

      {/* Action menu */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: '16px',
            color: 'var(--paper-muted)',
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="File actions"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              zIndex: 10,
              background: 'var(--paper-surface-hi)',
              border: '1px solid var(--paper-border-bold)',
              boxShadow: '3px 3px 0 var(--paper-border-bold)',
              minWidth: '120px',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { onDelete(entry); setMenuOpen(false); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                color: 'var(--paper-danger)',
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run all FileRow tests to confirm they pass**

```bash
cd frontend && npm run test -- --run src/features/files/ui/FileRow.tests.tsx
```

Expected: PASS — 10 tests pass (9 existing + 1 new modified_at test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/files/ui/FileRow.tsx \
        frontend/src/features/files/ui/FileRow.tests.tsx
git commit -m "feat(ui): Paper FileRow with modified_at display"
```

---

## Task 6: FileBrowserWidget Paper styling, skeleton, and empty state

**Files:**
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx`

- [ ] **Step 1: Add the empty state test**

In `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx`, add this test inside the `describe('FileBrowserWidget')` block after the existing tests:

```tsx
  it('renders an empty state message when the directory has no files', () => {
    mockUseSearch.mockReturnValue({ parent_id: undefined });
    mockUseNavigate.mockReturnValue(vi.fn());
    mockUseFiles.mockReturnValue({ data: [], isLoading: false, isError: false } as unknown as ReturnType<typeof filesHook.useFiles>);
    mockUseDeleteFile.mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof deleteFileHook.useDeleteFile>);

    render(<FileBrowserWidget />);

    expect(screen.getByText(/empty directory/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to confirm new test fails**

```bash
cd frontend && npm run test -- --run src/features/files/ui/FileBrowserWidget.tests.tsx
```

Expected: FAIL — the existing "Empty directory" text node is rendered inside `<p>` tag so it might actually pass already. If so, the test passes — that's fine, move on.

- [ ] **Step 3: Rewrite FileBrowserWidget.tsx**

Replace the entire contents of `frontend/src/features/files/ui/FileBrowserWidget.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import type { FileEntry } from '../files.types';
import { useDeleteFile } from '../queries/useDeleteFile';
import { useFiles } from '../queries/useFiles';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
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

const FileSkeleton = () => (
  <div
    role="status"
    aria-label="Loading files"
    style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--paper-border)',
      boxShadow: '3px 3px 0 var(--paper-border-bold)',
    }}
  >
    {[0, 1, 2, 3].map(i => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderBottom: '1px solid var(--paper-border)' }}>
        <div className="paper-skeleton" style={{ width: '28px', height: '28px', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="paper-skeleton" style={{ width: '50%', height: '10px' }} />
          <div className="paper-skeleton" style={{ width: '30%', height: '8px' }} />
        </div>
        <div className="paper-skeleton" style={{ width: '48px', height: '28px', flexShrink: 0 }} />
      </div>
    ))}
  </div>
);

const sectionLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '11px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'var(--paper-muted)',
  marginBottom: '10px',
};

export const FileBrowserWidget = () => {
  const { parent_id } = useSearch({ from: '/files' });
  const navigate = useNavigate();

  const [rootName, setRootName] = useState('Root');
  const [stack, setStack] = useState<BreadcrumbEntry[]>([{ id: undefined, name: 'Root' }]);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);

  const { data, isLoading, isError } = useFiles(parent_id);
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile(parent_id);

  useEffect(() => {
    if (parent_id !== undefined) return;
    const name = data && data.length > 0 ? deriveFolderName(data) : undefined;
    if (name) setRootName(name);
    setStack([{ id: undefined, name: name ?? rootName }]);
  }, [parent_id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <FileSkeleton />;

  if (isError || !data) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        padding: '24px',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        color: 'var(--paper-danger)',
      }}>
        Failed to load files. Is the API running?
      </div>
    );
  }

  const isInsideFolder = parent_id !== undefined;

  const effectiveStack: BreadcrumbEntry[] = (() => {
    if (!isInsideFolder) return stack;
    if (stack.length > 1) return stack;
    const inferred = deriveFolderName(data);
    return inferred
      ? [{ id: undefined, name: rootName }, { id: parent_id, name: inferred }]
      : [];
  })();

  const handleNavigateInto = (entry: FileEntry) => {
    setStack(prev => [...prev, { id: entry.id, name: entry.name }]);
    navigate({ to: '/files', search: { parent_id: entry.id } });
  };

  const handleNavigateUp = () => {
    if (effectiveStack.length === 0) {
      setStack([{ id: undefined, name: rootName }]);
      navigate({ to: '/files', search: { parent_id: undefined } });
      return;
    }
    const newStack = effectiveStack.slice(0, -1);
    setStack(newStack.length > 0 ? newStack : [{ id: undefined, name: rootName }]);
    const parent = newStack[newStack.length - 1];
    if (!parent || parent.id === undefined) {
      navigate({ to: '/files', search: { parent_id: undefined } });
    } else {
      navigate({ to: '/files', search: { parent_id: parent.id } });
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteFile(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Section label */}
      <div style={sectionLabelStyle}>Files</div>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const }}>
        {effectiveStack.map((crumb, i) => {
          const isLast = i === effectiveStack.length - 1;
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {i > 0 && (
                <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)' }}>›</span>
              )}
              {i === 0 && !isLast ? (
                <Link
                  to="/files"
                  search={{ parent_id: undefined }}
                  onClick={() => setStack([{ id: undefined, name: rootName }])}
                  style={{ fontFamily: 'var(--font-data)', fontSize: '12px', color: 'var(--paper-accent)', textDecoration: 'none' }}
                >
                  {crumb.name}
                </Link>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: '12px',
                  color: isLast ? 'var(--paper-text)' : 'var(--paper-accent)',
                  fontWeight: isLast ? 500 : 400,
                }}>
                  {crumb.name}
                </span>
              )}
            </span>
          );
        })}
        {effectiveStack.length > 0 && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--paper-dim)', marginLeft: 'auto' }}>
            {data.length} {data.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </nav>

      {/* File list card */}
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--paper-border)',
        boxShadow: '3px 3px 0 var(--paper-border-bold)',
        overflow: 'hidden',
      }}>
        {isInsideFolder && <FileRow isParent onParentClick={handleNavigateUp} />}

        {data.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              letterSpacing: '0.08em',
              color: 'var(--paper-muted)',
              marginBottom: '6px',
            }}>
              Empty Directory
            </div>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              color: 'var(--paper-dim)',
            }}>
              No files found in this location.
            </div>
          </div>
        )}

        {data.map((entry, i) => (
          <Fragment key={entry.id}>
            {i > 0 && <div style={{ borderTop: '1px solid var(--paper-border)' }} />}
            <FileRow
              entry={entry}
              onClick={handleNavigateInto}
              onDelete={setPendingDelete}
            />
          </Fragment>
        ))}
      </div>

      {pendingDelete && (
        <DeleteConfirmDialog
          entry={pendingDelete}
          isPending={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run all FileBrowserWidget tests**

```bash
cd frontend && npm run test -- --run src/features/files/ui/FileBrowserWidget.tests.tsx
```

Expected: PASS — 10 tests pass (9 existing + 1 new empty state test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/files/ui/FileBrowserWidget.tsx \
        frontend/src/features/files/ui/FileBrowserWidget.tests.tsx
git commit -m "feat(ui): Paper FileBrowserWidget with skeleton and empty state"
```

---

## Task 7: DeleteConfirmDialog visual rewrite

**Files:**
- Modify: `frontend/src/features/files/ui/DeleteConfirmDialog.tsx`

Existing tests are purely behavioral (cancel, confirm, disabled state) — no style assertions. No test changes needed.

- [ ] **Step 1: Run existing tests to confirm they pass before touching anything**

```bash
cd frontend && npm run test -- --run src/features/files/ui/DeleteConfirmDialog.tests.tsx
```

Expected: PASS — 4 tests pass.

- [ ] **Step 2: Rewrite DeleteConfirmDialog.tsx**

Replace the entire contents of `frontend/src/features/files/ui/DeleteConfirmDialog.tsx`:

```tsx
import { createPortal } from 'react-dom';

import type { FileEntry } from '../files.types';

interface DeleteConfirmDialogProps {
  entry: FileEntry;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmDialog = ({ entry, isPending, onConfirm, onCancel }: DeleteConfirmDialogProps) => {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={!isPending ? onCancel : undefined}
    >
      <div
        style={{
          background: 'var(--paper-surface-hi)',
          border: '1px solid var(--paper-border-bold)',
          boxShadow: '6px 6px 0 rgba(0,0,0,0.15)',
          padding: '24px',
          width: '100%',
          maxWidth: '320px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '20px',
          letterSpacing: '0.06em',
          color: 'var(--paper-danger)',
          marginBottom: '8px',
        }}>
          Delete file?
        </h2>
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: '13px',
          color: 'var(--paper-muted)',
          lineHeight: 1.6,
          marginBottom: '20px',
        }}>
          <strong style={{ color: 'var(--paper-text)', fontWeight: 500 }}>{entry.name}</strong>
          {' '}will be permanently removed. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            style={{
              flex: 1,
              padding: '9px 16px',
              fontFamily: 'var(--font-ui)',
              fontSize: '13px',
              fontWeight: 500,
              background: 'transparent',
              border: '2px solid var(--paper-border-bold)',
              color: 'var(--paper-text)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{
              flex: 1,
              padding: '9px 16px',
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'var(--paper-danger)',
              border: 'none',
              color: 'white',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isPending && (
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: 'white',
                animation: 'spin 0.6s linear infinite',
                display: 'inline-block',
              }} />
            )}
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
```

- [ ] **Step 3: Run tests to confirm they still pass**

```bash
cd frontend && npm run test -- --run src/features/files/ui/DeleteConfirmDialog.tests.tsx
```

Expected: PASS — 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/files/ui/DeleteConfirmDialog.tsx
git commit -m "feat(ui): Paper DeleteConfirmDialog"
```

---

## Task 8: Full test suite and visual sign-off

- [ ] **Step 1: Run the full test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: All tests pass. Zero failures.

- [ ] **Step 2: Build check**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Visual sign-off**

Run `cd frontend && npm run dev`. Check each screen:

- **Dashboard**: Ruled-paper background, "PI MANAGER" header in Bebas Neue, thick border, "LIVE" dot, top tabs, disk widget with 88px percentage, Paper card shadow, stat cells with DM Mono values
- **Files**: Breadcrumb in DM Mono red links, file list card with offset shadow, DM Sans file names, DM Mono sizes + dates, red folder icons, menu button on hover
- **Empty folder**: "Empty Directory" in Bebas Neue + subtitle
- **Delete dialog**: Dark overlay, Paper card, "DELETE FILE?" in red Bebas Neue, stacked buttons
- **Loading states**: Shimmer skeletons instead of spinners on both pages
