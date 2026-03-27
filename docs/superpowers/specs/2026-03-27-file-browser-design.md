# File Browser Feature — Design Spec

**Date:** 2026-03-27
**Status:** Approved

---

## Overview

Add a file browser page to pi-manager that lets users navigate the managed directory tree using a GitHub-style breadcrumb interface. Introduce a persistent bottom tab bar (Slack mobile-style) for navigation between the existing Dashboard and the new Files page.

---

## Navigation Bar

A floating bottom tab bar rendered inside `LayoutMain`, visible on all pages.

**Visual style:**
- Frosted glass pill: `bg-white/80 backdrop-blur-md rounded-2xl shadow-md`
- Fixed at the bottom center: `fixed bottom-3 left-1/2 -translate-x-1/2`
- Two tabs: **Home** (house icon) and **Files** (folder icon)
- Active tab: blue pill background (`bg-blue-50`), blue icon, bold blue label (`text-blue-500`)
- Inactive tab: gray icon (`text-gray-400`), gray label

**Behavior:**
- Active tab is determined by the current route (`/` → Home active, `/files` → Files active), using TanStack Router's `useRouterState` or link active detection
- `LayoutMain` gains `pb-24` on the main content area so content is never hidden behind the nav bar

**Component:** `src/shared/ui/NavBar.tsx`

---

## Files Page

**Route:** `/files` with optional search param `?parent_id=<id>`
**Page component:** `src/pages/files/PageFiles.tsx` — composes `LayoutDashboard` + `PageHeading` + `FileBrowserWidget`, no raw HTML

---

## FileBrowserWidget

Self-contained component that owns the file listing for the current directory.

**Location:** `src/features/files/ui/FileBrowserWidget.tsx`

**Data fetching:**
- Reads `parent_id` from URL search params via TanStack Router's `useSearch`
- Calls `GET /api/files` (no param → root entries) or `GET /api/files?parent_id=<id>`
- Uses React Query; handles loading spinner and error state independently (does not block the rest of the page)

**Breadcrumb reconstruction:**
- On navigation: current folder's `path` is available from the file entry that was clicked — use it directly
- On deep-link / refresh with `?parent_id` in URL: call `GET /api/files?parent_id=<id>`, take `dirname` of any returned child's `path` to infer the current folder path, then split on `/` to render breadcrumb segments
- Edge case — empty folder on refresh: breadcrumb shows nothing (no segments), file list shows empty state
- **Root** breadcrumb segment is always a link to `/files` (no `parent_id`). All other segments are display-only text — intermediate ancestor `parent_id`s are not tracked. Step-by-step back navigation is handled exclusively by the `..` row

**Navigation:**
- Clicking a folder row: `navigate({ to: '/files', search: { parent_id: entry.id } })`
- The `..` row: navigates to the clicked folder's `parent_id` (available on the entry); hidden at root (when `parent_id` is absent from URL)
- Clicking a file row: no action

---

## File Row

**Location:** `src/features/files/ui/FileRow.tsx`

| Element | Directory | File |
|---|---|---|
| Icon background | `bg-blue-50`, blue folder SVG | `bg-gray-100`, gray file SVG |
| Name | `text-gray-900 font-medium` | same |
| Size | `—` (dash) | formatted bytes |
| Trailing chevron | yes (`›`) | no |

**`..` row:** Gray left-chevron icon, muted `..` label, no size, no trailing chevron. Rendered as the first row whenever `parent_id` is present in the URL.

---

## Feature Module Structure

```
src/features/files/
├── files.types.ts          # FileEntry type (id, parent_id, path, name, size, is_dir, ...)
├── api/files.ts            # fetch('/api/files?parent_id=...')
├── queries/
│   ├── queryKeys.ts
│   └── useFiles.ts         # React Query hook
├── ui/
│   ├── FileBrowserWidget.tsx
│   └── FileRow.tsx
└── index.ts                # named exports
```

---

## Router Changes

`src/app/router.tsx`:
- Add `filesRoute` at path `/files` with `validateSearch` for `{ parent_id?: number }`
- Add `filesRoute` to the route tree

---

## Files Modified

| File | Change |
|---|---|
| `src/app/router.tsx` | Add `/files` route with `parent_id` search param |
| `src/layouts/LayoutMain.tsx` | Add `<NavBar />`, add `pb-24` to `<main>` |
| `src/shared/ui/NavBar.tsx` | New — bottom tab bar component |
| `src/features/files/` | New — full feature module |
| `src/pages/files/PageFiles.tsx` | New — files page |

---

## Out of Scope

- File preview or download
- Search / filter within a directory
- Folder size aggregation (size shown as `—` for directories)
- Sorting controls
