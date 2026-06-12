# Aurora Design System Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Paper theme with the Aurora Glass design system — dark + light modes, OS-scheme default with manual toggle, Iosevka typography, Lucide icons — and restyle every existing component.

**Architecture:** CSS custom properties on `:root` (light) / `html[data-mode="dark"]` (dark), exposed to Tailwind 4 via `@theme inline` so components use semantic utilities (`bg-surface`, `text-ink`). A `ThemeProvider` resolves the `system|light|dark` preference to a concrete `data-mode` attribute. A `GlassCard` primitive defines the frosted surface once; all widgets wrap in it.

**Tech Stack:** React 19, Tailwind 4 (`@theme inline`), `@fontsource/iosevka-aile` + `@fontsource/iosevka`, `lucide-react`, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-12-ui-next-level-design.md`

**Branch:** `feature/aurora-design-system` (no Jira ticket — homelab project)

**Plan-level decisions (deviations from spec build order, flagged to user):**
- The `features/largest-files/` frontend module is removed in THIS phase (Task 10), not phase 3. Reason: phase 1 deletes the `--paper-*` tokens it depends on; restyling a component scheduled for deletion violates YAGNI. The dashboard goes without a disk-composition widget until the treemap lands in phase 3. The backend top-files endpoint is removed in phase 3 alongside the new directories/usage endpoint.
- Phase 2 (browser UX) and phase 3 (widgets) get their own plans, written after this phase merges.

**Working conventions for every task:**
- All commands run from `frontend/` unless stated otherwise.
- Run tests with `npx vitest run <path>` (non-watch).
- All restyled components MUST preserve existing roles, `aria-*` attributes, `data-testid`s, and user-facing strings — the existing test suite is the regression net (verified: no test asserts Paper class names or inline styles).
- Commit messages follow Conventional Commits.

---

### Task 1: Dependencies & fonts

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install dependencies**

```bash
npm install @fontsource/iosevka-aile @fontsource/iosevka lucide-react
```

Expected: all three added to `dependencies` in `package.json`.

- [ ] **Step 2: Import font weights in main.tsx**

Replace `frontend/src/main.tsx` with:

```tsx
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/iosevka-aile/400.css';
import '@fontsource/iosevka-aile/600.css';
import '@fontsource/iosevka/400.css';
import '@fontsource/iosevka/500.css';

import { QueryProvider } from './app/providers/QueryProvider';
import { router } from './app/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS (TypeScript check + Vite bundle, fonts bundled into `dist/assets`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main.tsx
git commit -m "feat(theme): add Iosevka fonts and lucide-react dependencies"
```

---

### Task 2: Aurora tokens & base CSS

**Files:**
- Modify: `frontend/src/index.css` (full rewrite, with temporary legacy block)

- [ ] **Step 1: Rewrite index.css**

Replace the entire content of `frontend/src/index.css` with:

```css
@import 'tailwindcss';

/* ── Aurora design tokens ────────────────────────── */
:root {
  --bg:           #f4f7fc;
  --aurora-1:     #c7e8ff;
  --aurora-2:     #e8d5ff;
  --aurora-3:     #c5f5e8;
  --surface:      rgba(255, 255, 255, 0.62);
  --surface-hi:   rgba(255, 255, 255, 0.85);
  --glass-border: rgba(26, 36, 64, 0.08);
  --glass-shadow: 0 8px 32px rgba(90, 110, 160, 0.12);
  --ink:          #1a2440;
  --muted:        #5a6a92;
  --dim:          #9aa7c7;
  --accent:       #0d9488;
  --accent-2:     #6366f1;
  --safe:         #0d9488;
  --warn:         #d97706;
  --danger:       #dc2626;
  --track:        rgba(26, 36, 64, 0.08);

  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html[data-mode='dark'] {
  --bg:           #0a0e1a;
  --aurora-1:     #1e3a5f;
  --aurora-2:     #2d1b4e;
  --aurora-3:     #0f3d3e;
  --surface:      rgba(255, 255, 255, 0.06);
  --surface-hi:   rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  --ink:          #f0f4ff;
  --muted:        #94a3c8;
  --dim:          #55628a;
  --accent:       #5eead4;
  --accent-2:     #818cf8;
  --safe:         #34d399;
  --warn:         #fbbf24;
  --danger:       #f87171;
  --track:        rgba(0, 0, 0, 0.35);
}

/* Expose tokens as Tailwind utilities: bg-surface, text-ink, border-glass, … */
@theme inline {
  --color-surface:    var(--surface);
  --color-surface-hi: var(--surface-hi);
  --color-glass:      var(--glass-border);
  --color-ink:        var(--ink);
  --color-muted:      var(--muted);
  --color-dim:        var(--dim);
  --color-accent:     var(--accent);
  --color-accent-2:   var(--accent-2);
  --color-safe:       var(--safe);
  --color-warn:       var(--warn);
  --color-danger:     var(--danger);
  --font-ui:          'Iosevka Aile', sans-serif;
  --font-data:        'Iosevka', monospace;
}

/* ── Global base ─────────────────────────────────── */
body {
  margin: 0;
  font-family: var(--font-ui);
  background: var(--bg);
  color: var(--ink);
}

/* ── Aurora background layer ─────────────────────── */
body::before {
  content: '';
  position: fixed;
  inset: -20%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(ellipse 60% 50% at 20% 10%, var(--aurora-1), transparent 65%),
    radial-gradient(ellipse 55% 45% at 80% 30%, var(--aurora-2), transparent 65%),
    radial-gradient(ellipse 65% 55% at 50% 95%, var(--aurora-3), transparent 65%);
  animation: aurora-drift 60s ease-in-out infinite alternate;
}

@keyframes aurora-drift {
  from { transform: translate3d(-2%, -1%, 0) scale(1); }
  to   { transform: translate3d(2%, 2%, 0) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  body::before { animation: none; }
}

/* ── Glass surface (defined once, used by GlassCard) ── */
.glass-card {
  background: var(--surface);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
}

/* ── Live indicator dot ──────────────────────────── */
.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--safe);
  animation: pulse 2.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}

/* ── Row entrance animation ──────────────────────── */
@keyframes slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

.row-enter {
  animation: slide-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Skeleton shimmer ────────────────────────────── */
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

.skeleton {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--surface-hi) 25%,
    var(--glass-border) 50%,
    var(--surface-hi) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* ── Row menu button: always visible on touch ────── */
@media (hover: none) {
  .row-menu-btn {
    opacity: 1 !important;
  }
}

/* ── Breadcrumb ancestor links ───────────────────── */
.breadcrumb-link {
  text-decoration: none;
  color: var(--accent);
  font-family: var(--font-data);
  font-size: 12px;
  cursor: pointer;
}
.breadcrumb-link:hover {
  text-decoration: underline;
}

/* ════════════════════════════════════════════════════
   LEGACY PAPER COMPATIBILITY — REMOVED IN TASK 11.
   Keeps not-yet-restyled components rendering during
   the migration. Do not add new references.
   ════════════════════════════════════════════════════ */
:root {
  --paper-bg:           #f5f0e8;
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
  --paper-bg-texture:   none;
}

@keyframes paper-slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes paper-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

.paper-skeleton {
  background: linear-gradient(90deg, var(--paper-surface) 25%, rgba(0, 0, 0, 0.06) 50%, var(--paper-surface) 75%);
  background-size: 200% 100%;
  animation: paper-shimmer 1.5s infinite;
}

@media (hover: none) {
  .paper-row-menu-btn { opacity: 1 !important; }
}

.paper-breadcrumb-link {
  text-decoration: none;
  color: var(--paper-accent);
  font-family: var(--font-data);
  font-size: 12px;
  cursor: pointer;
}
.paper-breadcrumb-link:hover { text-decoration: underline; }
```

Note: the legacy block intentionally drops `--font-display` and the Paper fonts — old Google-Fonts families are gone, so legacy components fall back to Iosevka during migration. That is acceptable mid-migration churn.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: PASS (no test asserts CSS).

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS. If `@theme inline` produces an error, check Tailwind version is ≥ 4.0 (`npm ls tailwindcss`).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): add Aurora Glass tokens, background layer, and Tailwind @theme mapping"
```

---

### Task 3: FOUC guard + ThemeProvider (TDD)

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/src/shared/theme/ThemeProvider.tsx`
- Test: `frontend/src/shared/theme/ThemeProvider.tests.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Add pre-React mode script to index.html**

In `frontend/index.html`, add as the FIRST child of `<head>`:

```html
<script>
  (function () {
    try {
      var stored = localStorage.getItem('pi-manager-theme');
      var dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    } catch (e) {
      document.documentElement.dataset.mode = 'light';
    }
  })();
</script>
```

This sets `data-mode` before first paint so a dark-OS user never sees a light flash.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/shared/theme/ThemeProvider.tests.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeProvider';

type MediaListener = (e: { matches: boolean }) => void;

const stubMatchMedia = (prefersDark: boolean) => {
  const listeners: MediaListener[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: (_: string, cb: MediaListener) => listeners.push(cb),
      removeEventListener: vi.fn(),
    }),
  );
  return { fireChange: (matches: boolean) => listeners.forEach(cb => cb({ matches })) };
};

const Probe = () => {
  const { preference, resolvedMode, cyclePreference } = useTheme();
  return (
    <button type="button" onClick={cyclePreference}>
      {preference}:{resolvedMode}
    </button>
  );
};

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

describe('ThemeProvider', () => {
  it('defaults to system preference and resolves the OS mode', () => {
    stubMatchMedia(true);
    renderProbe();

    expect(screen.getByRole('button')).toHaveTextContent('system:dark');
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('cycles system → light → dark → system and persists the preference', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light:light');
    expect(localStorage.getItem('pi-manager-theme')).toBe('light');
    expect(document.documentElement.dataset.mode).toBe('light');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark:dark');
    expect(localStorage.getItem('pi-manager-theme')).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('system:dark');
  });

  it('reads a persisted preference on mount', () => {
    stubMatchMedia(false);
    localStorage.setItem('pi-manager-theme', 'dark');
    renderProbe();

    expect(screen.getByRole('button')).toHaveTextContent('dark:dark');
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('follows live OS scheme changes while preference is system', () => {
    const media = stubMatchMedia(true);
    renderProbe();
    expect(document.documentElement.dataset.mode).toBe('dark');

    act(() => media.fireChange(false));

    expect(screen.getByRole('button')).toHaveTextContent('system:light');
    expect(document.documentElement.dataset.mode).toBe('light');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/shared/theme/ThemeProvider.tests.tsx
```

Expected: FAIL — `Cannot find module './ThemeProvider'`.

- [ ] **Step 4: Implement ThemeProvider**

Create `frontend/src/shared/theme/ThemeProvider.tsx`:

```tsx
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedMode = 'light' | 'dark';

const STORAGE_KEY = 'pi-manager-theme';

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const readStoredPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = (): boolean =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedMode: ResolvedMode;
  cyclePreference: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedMode: ResolvedMode =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.mode = resolvedMode;
  }, [resolvedMode]);

  const cyclePreference = () => {
    setPreference(prev => {
      const next = NEXT_PREFERENCE[prev];
      try {
        if (next === 'system') {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        // localStorage unavailable: keep the preference in memory only
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ preference, resolvedMode, cyclePreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
```

Note the test's matchMedia stub lacks `MediaQueryListEvent` typing — the listener receives `{ matches }` which is all the implementation reads.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/shared/theme/ThemeProvider.tests.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 6: Mount the provider**

In `frontend/src/main.tsx`, add the import and wrap QueryProvider:

```tsx
import { ThemeProvider } from './shared/theme/ThemeProvider';
```

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Run full suite and commit**

```bash
npx vitest run
git add index.html src/shared/theme/ src/main.tsx
git commit -m "feat(theme): add ThemeProvider with OS-scheme resolution and persistence"
```

---

### Task 4: ThemeToggle (TDD)

**Files:**
- Create: `frontend/src/shared/theme/ThemeToggle.tsx`
- Test: `frontend/src/shared/theme/ThemeToggle.tests.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/shared/theme/ThemeToggle.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

const stubMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.mode;
});

describe('ThemeToggle', () => {
  it('shows the current preference and cycles on click', async () => {
    stubMatchMedia();
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /system theme/i });

    await user.click(button);
    expect(screen.getByRole('button', { name: /light theme/i })).toBeInTheDocument();

    await user.click(button);
    expect(screen.getByRole('button', { name: /dark theme/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/shared/theme/ThemeToggle.tests.tsx
```

Expected: FAIL — `Cannot find module './ThemeToggle'`.

- [ ] **Step 3: Implement ThemeToggle**

Create `frontend/src/shared/theme/ThemeToggle.tsx`:

```tsx
import { Monitor, Moon, Sun } from 'lucide-react';

import type { ThemePreference } from './ThemeProvider';
import { useTheme } from './ThemeProvider';

const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const PREFERENCE_ICON: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export const ThemeToggle = () => {
  const { preference, cyclePreference } = useTheme();
  const Icon = PREFERENCE_ICON[preference];

  return (
    <button
      type="button"
      aria-label={`${PREFERENCE_LABEL[preference]} — switch theme`}
      title={PREFERENCE_LABEL[preference]}
      onClick={cyclePreference}
      className="w-8 h-8 flex items-center justify-center rounded-full border border-glass bg-surface-hi text-muted hover:text-ink transition-colors cursor-pointer"
    >
      <Icon size={15} aria-hidden />
    </button>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/shared/theme/ThemeToggle.tests.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme/ThemeToggle.tsx src/shared/theme/ThemeToggle.tests.tsx
git commit -m "feat(theme): add ThemeToggle cycling system, light, dark"
```

---

### Task 5: GlassCard + WidgetError primitives (TDD)

**Files:**
- Create: `frontend/src/shared/ui/GlassCard.tsx`
- Create: `frontend/src/shared/ui/WidgetError.tsx`
- Test: `frontend/src/shared/ui/GlassCard.tests.tsx`
- Test: `frontend/src/shared/ui/WidgetError.tests.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/shared/ui/GlassCard.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GlassCard } from './GlassCard';

describe('GlassCard', () => {
  it('renders children inside a glass surface', () => {
    render(<GlassCard data-testid="card">hello</GlassCard>);

    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('hello');
    expect(card).toHaveClass('glass-card');
  });

  it('merges extra class names', () => {
    render(<GlassCard data-testid="card" className="p-6" />);

    expect(screen.getByTestId('card')).toHaveClass('glass-card', 'p-6');
  });
});
```

Create `frontend/src/shared/ui/WidgetError.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WidgetError } from './WidgetError';

describe('WidgetError', () => {
  it('shows the message', () => {
    render(<WidgetError message="Failed to load disk usage. Is the API running?" />);

    expect(screen.getByText('Failed to load disk usage. Is the API running?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<WidgetError message="Boom" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/shared/ui/GlassCard.tests.tsx src/shared/ui/WidgetError.tests.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both primitives**

Create `frontend/src/shared/ui/GlassCard.tsx`:

```tsx
import type { HTMLAttributes } from 'react';

type GlassCardProps = HTMLAttributes<HTMLDivElement>;

export const GlassCard = ({ className, ...props }: GlassCardProps) => (
  <div className={className ? `glass-card ${className}` : 'glass-card'} {...props} />
);
```

Create `frontend/src/shared/ui/WidgetError.tsx`:

```tsx
import { GlassCard } from './GlassCard';

interface WidgetErrorProps {
  message: string;
  onRetry?: () => void;
}

export const WidgetError = ({ message, onRetry }: WidgetErrorProps) => (
  <GlassCard className="p-6">
    <p className="font-ui text-sm text-danger m-0">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 px-4 py-1.5 rounded-full border border-glass bg-surface-hi font-ui text-xs font-semibold text-ink hover:text-accent transition-colors cursor-pointer"
      >
        Retry
      </button>
    )}
  </GlassCard>
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/shared/ui/GlassCard.tests.tsx src/shared/ui/WidgetError.tests.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/GlassCard.tsx src/shared/ui/GlassCard.tests.tsx src/shared/ui/WidgetError.tsx src/shared/ui/WidgetError.tests.tsx
git commit -m "feat(ui): add GlassCard and WidgetError primitives"
```

---

### Task 6: Shell restyle — LayoutMain, NavBar, PageHeading

**Files:**
- Modify: `frontend/src/layouts/LayoutMain.tsx`
- Modify: `frontend/src/shared/ui/NavBar.tsx`
- Modify: `frontend/src/shared/ui/PageHeading.tsx`

- [ ] **Step 1: Rewrite LayoutMain**

Replace `frontend/src/layouts/LayoutMain.tsx` with:

```tsx
import { Outlet } from '@tanstack/react-router';

import { ThemeToggle } from '@/shared/theme/ThemeToggle';
import { NavBar } from '@/shared/ui/NavBar';

export const LayoutMain = () => (
  <div className="min-h-screen flex flex-col">
    <header className="sticky top-0 z-10 bg-surface backdrop-blur-xl border-b border-glass">
      <div className="max-w-md mx-auto px-5 pt-4 pb-3 flex items-center justify-between">
        <span className="font-ui text-lg font-semibold tracking-wide text-ink">
          Pi Manager
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="live-dot" aria-hidden="true" />
            <span className="font-data text-[10px] tracking-widest text-muted">LIVE</span>
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
    <NavBar />
    <main className="flex-1 max-w-md mx-auto w-full px-5 pt-6 pb-10">
      <Outlet />
    </main>
  </div>
);
```

- [ ] **Step 2: Rewrite NavBar**

Replace `frontend/src/shared/ui/NavBar.tsx` with:

```tsx
import { useNavigate, useRouterState } from '@tanstack/react-router';

const tabClass = (active: boolean): string =>
  'font-ui text-sm font-semibold tracking-wide px-4 py-1.5 rounded-full border transition-colors cursor-pointer ' +
  (active
    ? 'bg-surface-hi text-accent border-glass'
    : 'bg-transparent text-muted border-transparent hover:text-ink');

export const NavBar = () => {
  const { location } = useRouterState();
  const navigate = useNavigate();

  const isHome  = location.pathname === '/';
  const isFiles = location.pathname.startsWith('/files');

  return (
    <div className="border-b border-glass">
      <div className="max-w-md mx-auto flex gap-2 px-5 py-2">
        <button
          type="button"
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          onClick={() => navigate({ to: '/' })}
          className={tabClass(isHome)}
        >
          Home
        </button>
        <button
          type="button"
          aria-label="Files"
          aria-current={isFiles ? 'page' : undefined}
          onClick={() => navigate({ to: '/files', search: { parent_id: undefined } })}
          className={tabClass(isFiles)}
        >
          Files
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Rewrite PageHeading**

Replace `frontend/src/shared/ui/PageHeading.tsx` with:

```tsx
import type { ReactNode } from 'react';

interface PageHeadingProps {
  children: ReactNode;
}

export const PageHeading = ({ children }: PageHeadingProps) => (
  <h1 className="font-ui text-2xl font-semibold tracking-tight text-ink">{children}</h1>
);
```

- [ ] **Step 4: Run the affected tests**

```bash
npx vitest run src/layouts/LayoutMain.tests.tsx src/shared/ui/NavBar.tests.tsx src/shared/ui/PageHeading.tests.tsx
```

Expected: PASS — behavior (labels, aria-current, navigation) is unchanged. If a LayoutMain test renders without ThemeProvider and fails on `useTheme must be used within ThemeProvider`, wrap that test's render in `<ThemeProvider>` (import from `@/shared/theme/ThemeProvider`) and stub `matchMedia` as in `ThemeToggle.tests.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/LayoutMain.tsx src/shared/ui/NavBar.tsx src/shared/ui/PageHeading.tsx src/layouts/LayoutMain.tests.tsx
git commit -m "feat(theme): restyle app shell with Aurora glass header and pill navigation"
```

---

### Task 7: Disk usage restyle

**Files:**
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx`
- Modify: `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx`

- [ ] **Step 1: Rewrite DiskUsageBar**

Replace `frontend/src/features/disk-usage/ui/DiskUsageBar.tsx` with:

```tsx
import { GlassCard } from '@/shared/ui/GlassCard';

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

const BAR_FILLS: Record<BarState, string> = {
  safe:   'linear-gradient(90deg, var(--accent), var(--accent-2))',
  warn:   'var(--warn)',
  danger: 'var(--danger)',
};

export const DiskUsageBar = ({ data }: DiskUsageBarProps) => {
  const { path, total_bytes, used_bytes, free_bytes, used_percent } = data;
  const roundedPercent = Math.round(used_percent);
  const barState = getBarState(used_percent);

  return (
    <GlassCard className="p-6 w-full">
      {/* Hero row: percentage + path */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-data text-7xl leading-none tracking-tight text-ink">
            {roundedPercent}%
          </div>
          <div className="font-data text-[11px] uppercase tracking-widest text-muted mt-1">
            used
          </div>
        </div>
        <div className="font-data text-[11px] text-muted text-right">{path}</div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--track)' }}>
        <div
          role="progressbar"
          aria-valuenow={roundedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-state={barState}
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${used_percent}%`, background: BAR_FILLS[barState] }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { label: 'Used',  value: formatBytes(used_bytes),  testId: 'stat-used'  },
          { label: 'Free',  value: formatBytes(free_bytes),  testId: 'stat-free'  },
          { label: 'Total', value: formatBytes(total_bytes), testId: 'stat-total' },
        ] as const).map(({ label, value, testId }) => (
          <div key={label} className="rounded-xl border border-glass bg-surface-hi p-3">
            <div className="font-data text-[8px] uppercase tracking-widest text-muted mb-1">
              {label}
            </div>
            <div data-testid={testId} className="font-data text-sm font-medium text-ink">
              {value}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
```

- [ ] **Step 2: Rewrite DiskUsageWidget**

Replace `frontend/src/features/disk-usage/ui/DiskUsageWidget.tsx` with:

```tsx
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';

import { useDiskUsage } from '../queries/useDiskUsage';

import { DiskUsageBar } from './DiskUsageBar';

const DiskUsageSkeleton = () => (
  <GlassCard role="status" aria-label="Loading disk usage" className="p-6">
    {/* Percentage placeholder */}
    <div className="flex justify-between mb-5">
      <div>
        <div className="skeleton w-[120px] h-[72px] mb-2" />
        <div className="skeleton w-10 h-2.5" />
      </div>
      <div className="skeleton w-20 h-3.5" />
    </div>
    {/* Bar placeholder */}
    <div className="skeleton h-2 mb-4" />
    {/* Stats placeholder */}
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-xl border border-glass bg-surface-hi p-3">
          <div className="skeleton w-8 h-2 mb-1.5" />
          <div className="skeleton w-14 h-3.5" />
        </div>
      ))}
    </div>
  </GlassCard>
);

export const DiskUsageWidget = () => {
  const { data, isLoading, isError, refetch } = useDiskUsage();

  if (isLoading) return <DiskUsageSkeleton />;

  if (isError || !data) {
    return (
      <WidgetError
        message="Failed to load disk usage. Is the API running?"
        onRetry={() => refetch()}
      />
    );
  }

  return <DiskUsageBar data={data} />;
};
```

- [ ] **Step 3: Run the affected tests**

```bash
npx vitest run src/features/disk-usage
```

Expected: PASS — role/aria/test-ids/error text preserved.

- [ ] **Step 4: Commit**

```bash
git add src/features/disk-usage
git commit -m "feat(theme): restyle disk usage widget with Aurora glass"
```

---

### Task 8: File browser restyle — FileRow, FileBrowserWidget, DeleteConfirmDialog

**Files:**
- Modify: `frontend/src/features/files/ui/FileRow.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx`
- Modify: `frontend/src/features/files/ui/DeleteConfirmDialog.tsx`

- [ ] **Step 1: Rewrite FileRow**

Replace `frontend/src/features/files/ui/FileRow.tsx` with (logic — menu, pointerdown-outside, Escape — unchanged; icons become Lucide; hover handled by CSS `group`):

```tsx
import { CornerLeftUp, FileText, Folder, MoreHorizontal, Trash2 } from 'lucide-react';
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
  new Date(unixSec * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const IconBox = ({ isDir }: { isDir: boolean }) => (
  <div
    className={
      'w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 ' +
      (isDir ? 'bg-surface-hi text-accent' : 'bg-transparent text-muted')
    }
  >
    {isDir ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
  </div>
);

type FileRowProps =
  | { isParent: true; onParentClick: () => void; entry?: never; onClick?: never; onDelete?: never; index?: number; isLast?: never }
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never; onDelete: (entry: FileEntry) => void; index?: number; isLast?: boolean };

export const FileRow = ({ isParent, entry, onClick, onParentClick, onDelete, index, isLast }: FileRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    // Use pointerdown rather than mousedown: Firefox for Android fires pointer events
    // natively on the touched element, whereas its synthetic mouse events are delayed and
    // can mis-target, closing the menu before the "Delete" item's click is delivered.
    const handleClickOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const rowClass =
    'group row-enter flex items-center gap-3 px-3.5 py-2.5 min-h-11 transition-colors hover:bg-surface-hi';
  const rowDelay = { animationDelay: `${(index ?? 0) * 50}ms` };

  if (isParent) {
    return (
      <button
        type="button"
        onClick={onParentClick}
        aria-label="Go to parent directory"
        className={`${rowClass} w-full cursor-pointer text-left bg-transparent border-none`}
        style={rowDelay}
      >
        <div className="w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 bg-surface-hi text-muted">
          <CornerLeftUp size={14} aria-hidden />
        </div>
        <span className="font-ui text-sm text-muted">..</span>
      </button>
    );
  }

  const nameAndMeta = (
    <div className="flex-1 min-w-0">
      <div className="font-ui text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
        {entry.name}
      </div>
    </div>
  );

  return (
    <div className={rowClass} style={rowDelay}>
      {entry.is_dir ? (
        <button
          type="button"
          onClick={() => onClick(entry)}
          className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-left p-0"
        >
          <IconBox isDir />
          {nameAndMeta}
        </button>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <IconBox isDir={false} />
          {nameAndMeta}
        </div>
      )}

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-data text-xs font-medium text-muted">
          {entry.is_dir ? '—' : formatFileSize(entry.size)}
        </span>
        <span className="font-data text-[10px] text-dim">{formatDate(entry.modified_at)}</span>
      </div>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          className="row-menu-btn w-7 h-7 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted opacity-25 group-hover:opacity-100 transition-opacity"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="File actions"
            className={
              'absolute right-0 z-10 min-w-[130px] glass-card overflow-hidden ' +
              (isLast ? 'bottom-full' : 'top-full')
            }
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { onDelete(entry); setMenuOpen(false); }}
              className="w-full text-left px-3.5 py-2.5 bg-transparent border-none cursor-pointer font-ui text-[13px] text-danger flex items-center gap-2 hover:bg-surface-hi transition-colors"
            >
              <Trash2 size={13} aria-hidden />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Rewrite FileBrowserWidget**

Replace `frontend/src/features/files/ui/FileBrowserWidget.tsx` — all state/navigation/breadcrumb logic is IDENTICAL to the current file; only the presentational wrappers change:

- `FileSkeleton`: `<GlassCard role="status" aria-label="Loading files" className="overflow-hidden">` containing four rows of `<div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-glass">` with `skeleton` divs (28px icon box, 50%/30% width lines) — mirror the current structure, swapping `paper-skeleton` → `skeleton` and inline styles → the utility classes above.
- Error state: replace the inline-styled div with `<WidgetError message="Failed to load files. Is the API running?" onRetry={() => refetch()} />`; destructure `refetch` from the existing `useFiles(parent_id)` call.
- Section label: `<div className="font-data text-[11px] uppercase tracking-[0.2em] text-muted mb-2.5">Files</div>`.
- Breadcrumb: same structure; links use `className="breadcrumb-link"` (renamed from `paper-breadcrumb-link`); separator `›` spans use `className="font-data text-[10px] text-dim"`; current crumb `className="font-data text-xs font-medium text-ink"`; item-count span `className="font-data text-[10px] text-dim ml-auto"`.
- List container: `<GlassCard className="overflow-hidden">` instead of the bordered div.
- Row separators: `<div className="border-t border-glass" />` instead of the paper border.
- Empty state: outer div `className="px-6 py-12 text-center"`, title `className="font-ui text-base font-semibold tracking-wide text-muted mb-1.5"` with text `Empty directory`, subtitle `className="font-ui text-[13px] text-dim"` with text `No files found in this location.`

Add imports:

```tsx
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';
```

and remove the now-unused `CSSProperties` import and `sectionLabelStyle` constant.

- [ ] **Step 3: Rewrite DeleteConfirmDialog**

Replace `frontend/src/features/files/ui/DeleteConfirmDialog.tsx` with (Escape/portal/pending logic unchanged):

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { GlassCard } from '@/shared/ui/GlassCard';

import type { FileEntry } from '../files.types';

interface DeleteConfirmDialogProps {
  entry: FileEntry;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmDialog = ({ entry, isPending, onConfirm, onCancel }: DeleteConfirmDialogProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm"
      onClick={!isPending ? onCancel : undefined}
    >
      <GlassCard className="p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <h2 className="font-ui text-lg font-semibold text-danger mb-2">Delete file?</h2>
        <p className="font-ui text-[13px] text-muted leading-relaxed mb-5">
          <strong className="text-ink font-medium">{entry.name}</strong>
          {' '}will be permanently removed. This cannot be undone.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="w-full px-4 py-2.5 rounded-full font-ui text-sm font-semibold bg-danger text-white border-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {isPending && (
              <span
                className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white"
                style={{ animation: 'spin 0.6s linear infinite' }}
              />
            )}
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="w-full px-4 py-2.5 rounded-full font-ui text-[13px] font-medium bg-transparent border border-glass text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-surface-hi transition-colors"
          >
            Cancel
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body,
  );
};
```

Note: `GlassCard` spreads `HTMLAttributes<HTMLDivElement>`, so `onClick` passes through.

- [ ] **Step 4: Run the affected tests**

```bash
npx vitest run src/features/files
```

Expected: PASS — all roles (`status`, `menu`, `menuitem`, `progressbar` n/a here), aria labels, button names, and visible strings are preserved. The empty-state title changed case from `EMPTY DIRECTORY` to `Empty directory` — if a test matches it case-sensitively, update the assertion to `/empty directory/i`.

- [ ] **Step 5: Commit**

```bash
git add src/features/files
git commit -m "feat(theme): restyle file browser with Aurora glass and Lucide icons"
```

---

### Task 9: Downloads restyle — DownloadsList, AddDownloadButton, AddDownloadSheet, FolderPicker

**Files:**
- Modify: `frontend/src/features/downloads/ui/DownloadsList.tsx`
- Modify: `frontend/src/features/downloads/ui/AddDownloadButton.tsx`
- Modify: `frontend/src/features/downloads/ui/AddDownloadSheet.tsx`
- Modify: `frontend/src/features/downloads/ui/FolderPicker.tsx`

- [ ] **Step 1: Rewrite DownloadsList**

Replace `frontend/src/features/downloads/ui/DownloadsList.tsx` with:

```tsx
import { GlassCard } from '@/shared/ui/GlassCard';

import type { DownloadJob } from '../downloads.types';
import { useDownloads } from '../queries/useDownloads';

const percent = (job: DownloadJob): number =>
  job.total_bytes > 0 ? Math.min(100, Math.round((job.bytes_downloaded / job.total_bytes) * 100)) : 0;

const STATUS_CLASS: Record<DownloadJob['status'], string> = {
  queued: 'text-muted',
  downloading: 'text-muted',
  completed: 'text-safe',
  failed: 'text-danger',
};

const DownloadRow = ({ job }: { job: DownloadJob }) => (
  <div className="mb-3.5 font-ui text-[13px] text-ink">
    <div className="flex justify-between">
      <span className="overflow-hidden text-ellipsis whitespace-nowrap mr-3">{job.name || job.url}</span>
      {/* Show a percentage only when the server sent a Content-Length; otherwise
          fall back to the status word (the bar still renders, at 0% width). */}
      <span className={`font-data text-[11px] shrink-0 ${STATUS_CLASS[job.status]}`}>
        {job.status === 'downloading' && job.total_bytes > 0 ? `${percent(job)}%` : job.status}
      </span>
    </div>
    {(job.status === 'downloading' || job.status === 'queued') && (
      <div
        role="progressbar"
        aria-valuenow={percent(job)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 rounded-full mt-1.5 overflow-hidden"
        style={{ background: 'var(--track)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${percent(job)}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }}
        />
      </div>
    )}
    {job.status === 'failed' && job.error && (
      <div className="text-danger text-xs mt-1">{job.error}</div>
    )}
  </div>
);

export const DownloadsList = () => {
  const { data, isLoading, isError } = useDownloads();

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-4">Downloads</h2>
      {isLoading && <div className="text-muted text-[13px]">Loading…</div>}
      {isError && <div className="text-danger text-[13px]">Couldn&apos;t load downloads.</div>}
      {data?.length === 0 && <div className="text-dim text-[13px]">No downloads yet.</div>}
      {data?.map(job => <DownloadRow key={job.id} job={job} />)}
    </GlassCard>
  );
};
```

- [ ] **Step 2: Rewrite AddDownloadButton**

Replace `frontend/src/features/downloads/ui/AddDownloadButton.tsx` with:

```tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { AddDownloadSheet } from './AddDownloadSheet';

export const AddDownloadButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Add download"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 w-13 h-13 rounded-full border-none cursor-pointer text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
      >
        <Plus size={24} aria-hidden />
      </button>
      {open && <AddDownloadSheet onClose={() => setOpen(false)} />}
    </>
  );
};
```

- [ ] **Step 3: Rewrite AddDownloadSheet**

Replace `frontend/src/features/downloads/ui/AddDownloadSheet.tsx` with (state/submit/picker flow unchanged):

```tsx
import { X } from 'lucide-react';
import { useState } from 'react';

import { useCreateDownload } from '../queries/useCreateDownload';

import { FolderPicker } from './FolderPicker';

interface AddDownloadSheetProps {
  onClose: () => void;
}

const FIELD_CLASS =
  'w-full box-border px-3 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink mb-3.5 outline-none focus:border-accent transition-colors';

const LABEL_CLASS =
  'font-data text-[10px] uppercase tracking-widest text-muted m-0 mb-1.5';

export const AddDownloadSheet = ({ onClose }: AddDownloadSheetProps) => {
  const [url, setUrl] = useState('');
  const [dir, setDir] = useState('');
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const { mutate, isPending, isError, error } = useCreateDownload();

  const canSubmit = url.trim() !== '' && !isPending;

  const handleSubmit = () => {
    mutate(
      { url: url.trim(), dir, name: name.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  if (picking) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
        <div className="max-w-md w-full mx-auto p-5 box-border">
          <FolderPicker
            onSelect={selected => {
              setDir(selected);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="border-b border-glass px-5 py-3 flex justify-between items-center font-ui text-lg font-semibold text-ink">
        <span>Add Download</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="max-w-md w-full mx-auto p-5 box-border">
        <p className={LABEL_CLASS}>Link</p>
        <input className={FIELD_CLASS} placeholder="Paste link (https://…)" value={url} onChange={e => setUrl(e.target.value)} />

        <p className={LABEL_CLASS}>Destination folder</p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`${FIELD_CLASS} flex justify-between cursor-pointer text-left`}
        >
          <span className="font-data text-[13px]">/{dir}</span>
          <span className="font-data text-[11px] text-accent">CHANGE ▸</span>
        </button>

        <p className={LABEL_CLASS}>File name — optional</p>
        <input className={FIELD_CLASS} placeholder="Leave blank to use the link's name" value={name} onChange={e => setName(e.target.value)} />

        {isError && (
          <p className="text-danger text-[13px] m-0 mb-3">
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-full border-none font-ui text-base font-semibold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
        >
          {isPending ? 'Starting…' : 'Start Download'}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Rewrite FolderPicker**

Replace `frontend/src/features/downloads/ui/FolderPicker.tsx` with (crumb/path logic unchanged; emoji folder → Lucide):

```tsx
import { ChevronLeft, ChevronRight, Folder, X } from 'lucide-react';
import { useState } from 'react';

import { useFolders } from '../queries/useFolders';

interface Crumb {
  id: number;
  name: string;
}

interface FolderPickerProps {
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

const joinPath = (crumbs: Crumb[], extra?: string): string => {
  const parts = crumbs.map(c => c.name);
  const trimmed = extra?.trim();
  if (trimmed) parts.push(trimmed);
  return parts.join('/');
};

export const FolderPicker = ({ onSelect, onClose }: FolderPickerProps) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const currentParentId = crumbs.length === 0 ? undefined : crumbs[crumbs.length - 1].id;
  const { data, isLoading, isError } = useFolders(currentParentId);

  const relativePath = joinPath(crumbs);

  return (
    <div className="font-ui text-ink">
      <div className="flex justify-between items-center mb-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => setCrumbs(prev => prev.slice(0, -1))}
          disabled={crumbs.length === 0}
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink disabled:opacity-40 transition-colors flex items-center gap-1 font-ui text-sm"
        >
          <ChevronLeft size={14} aria-hidden />
          Back
        </button>
        <span className="font-data text-[11px] text-muted">/{relativePath}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {isLoading && <div className="p-5 text-muted">Loading…</div>}
      {isError && <div className="p-5 text-danger">Couldn&apos;t load folders.</div>}

      {data?.map(folder => (
        <button
          key={folder.id}
          type="button"
          className="flex justify-between items-center w-full px-2 py-2.5 bg-transparent border-none border-b border-glass font-data text-[13px] text-ink cursor-pointer hover:bg-surface-hi transition-colors"
          onClick={() => setCrumbs(prev => [...prev, { id: folder.id, name: folder.name }])}
        >
          <span className="flex items-center gap-2">
            <Folder size={14} className="text-accent" aria-hidden />
            {folder.name}
          </span>
          <ChevronRight size={14} aria-hidden />
        </button>
      ))}
      {data?.length === 0 && !isLoading && (
        <div className="px-2 py-4 text-dim text-[13px]">No subfolders here.</div>
      )}

      <div className="mt-4 border-t border-dashed border-glass pt-3">
        <input
          value={newFolder}
          onChange={e => setNewFolder(e.target.value)}
          placeholder="New subfolder name…"
          className="w-full box-border px-3 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink mb-2.5 outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelect(joinPath(crumbs, newFolder.trim()))}
            disabled={newFolder.trim() === ''}
            className="flex-1 py-2.5 rounded-full border border-glass bg-surface-hi text-ink font-ui text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:text-accent transition-colors"
          >
            Create &amp; use
          </button>
          <button
            type="button"
            onClick={() => onSelect(relativePath)}
            className="flex-1 py-2.5 rounded-full border-none text-white font-ui text-sm cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Run the affected tests**

```bash
npx vitest run src/features/downloads
```

Expected: PASS — aria labels (`Add download`, `Close`, `Go back`), progressbar role, and visible strings preserved. If a FolderPicker test asserts the `📁` emoji in a folder row's text, change the assertion to the folder name only.

- [ ] **Step 6: Commit**

```bash
git add src/features/downloads
git commit -m "feat(theme): restyle downloads UI with Aurora glass and Lucide icons"
```

---

### Task 10: Remove largest-files frontend feature

The treemap (phase 3) supersedes the largest-files pie, and this phase deletes the Paper tokens it renders with — so the module goes now (decision flagged in the header). The backend top-files endpoint is removed in phase 3.

**Files:**
- Modify: `frontend/src/pages/dashboard/PageDashboard.tsx`
- Modify: `frontend/src/pages/dashboard/PageDashboard.tests.tsx` (if it references LargestFilesWidget)
- Delete: `frontend/src/features/largest-files/` (entire directory)

- [ ] **Step 1: Remove the widget from the dashboard**

Replace `frontend/src/pages/dashboard/PageDashboard.tsx` with:

```tsx
import { DiskUsageWidget } from '@/features/disk-usage';
import { AddDownloadButton, DownloadsList } from '@/features/downloads';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <DownloadsList />
    <AddDownloadButton />
  </LayoutDashboard>
);
```

- [ ] **Step 2: Update PageDashboard tests**

Open `frontend/src/pages/dashboard/PageDashboard.tests.tsx`; remove any mock/assertion referencing `LargestFilesWidget` or `@/features/largest-files`.

- [ ] **Step 3: Delete the feature module**

```bash
git rm -r src/features/largest-files
```

- [ ] **Step 4: Verify nothing references it**

```bash
grep -rn "largest-files\|LargestFiles" src
```

Expected: no matches.

- [ ] **Step 5: Run full suite and commit**

```bash
npx vitest run
git add -A src
git commit -m "refactor(dashboard): remove largest-files widget, superseded by phase-3 space map"
```

---

### Task 11: Remove legacy Paper CSS + final verification

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Verify no component references Paper**

```bash
grep -rn "paper" src --include="*.tsx" --include="*.ts"
```

Expected: no matches. If any remain, fix that component first (it was missed in Tasks 6–9).

- [ ] **Step 2: Delete the legacy block**

In `frontend/src/index.css`, delete everything from the `LEGACY PAPER COMPATIBILITY` banner comment to the end of the file.

- [ ] **Step 3: Full verification**

```bash
npx vitest run
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 4: Manual visual check (both modes)**

```bash
npm run dev
```

Open the app; verify: aurora background drifts; header/nav/cards are glass; toggle cycles system → light → dark and persists across reload; OS scheme change (macOS System Settings → Appearance) flips the app while preference is `system`; file browser, delete dialog, downloads sheet, and folder picker all render in both modes; no Paper-brown remnants anywhere.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "refactor(theme): delete legacy Paper CSS"
```

---

## Out of scope (later phases)

- **Phase 2:** search & filter (`/api/files?q=`), sortable columns, multi-select + bulk delete, mobile/touch pass.
- **Phase 3:** `directories/{id}/usage` endpoint + SpaceMapWidget, `file-types` endpoint + FileTypesWidget, scanner diff + `changes` table + ActivityFeedWidget, backend top-files endpoint removal, and the `useThemeTokens` recharts helper (no chart components exist between the pie's removal here and the treemap's arrival).
