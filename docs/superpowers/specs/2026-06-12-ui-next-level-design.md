# UI Next Level — Design Spec

**Date:** 2026-06-12
**Status:** Approved pending final review

## Goal

Elevate the pi-manager UI across three axes chosen during brainstorming: a new visual
identity (Aurora Glass theme), richer data visualization (three new dashboard widgets),
and file-browser UX upgrades. Backend (Go + SQLite) work is in scope.

## Decisions made

- **Theme:** Aurora Glass **replaces** the Paper theme entirely. Dark and light modes
  ship together; effective mode follows the OS (`prefers-color-scheme`) by default with
  a manual override toggle (system → light → dark) persisted in `localStorage`.
- **Typography:** full Iosevka identity — **Iosevka Aile** for UI text, **Iosevka**
  (mono) for data (sizes, paths, numbers). Self-hosted via `@fontsource/iosevka-aile`
  and `@fontsource/iosevka` so the app works without internet access (LAN-only Pi).
- **Icons:** `lucide-react` everywhere; emoji and ad-hoc icons removed. Icons inherit
  `currentColor` so they theme automatically.
- **Widgets chosen:** folder treemap, file-type breakdown, sync activity feed.
  (Disk-usage-over-time history chart was considered and rejected.)
- **UX chosen:** search & filter, sortable columns, multi-select + bulk delete,
  mobile/touch polish. (Keyboard navigation was considered and rejected.)
- **API versioning:** stay unversioned (`/api/*`) for consistency with existing
  endpoints; versioning deferred to a future sweep.
- **Sequencing:** foundation first — design system → restyle existing app →
  file-browser UX → new widgets. Everything is built once in the new design language.

## 1. Aurora Glass design system

### Tokens

All theme values are CSS custom properties in `frontend/src/index.css`, replacing the
`--paper-*` set:

- Surfaces: glass rgba backgrounds, `backdrop-filter` blur values, borders, shadows.
- Text tiers: primary / muted / dim.
- Accent gradient stops: teal `#5eead4` → indigo `#818cf8` (dark);
  teal `#0d9488` → indigo `#6366f1` (light).
- Semantic: safe / warn / danger.
- Radii (14–16px family) and fonts (`--font-ui`: Iosevka Aile, `--font-data`: Iosevka).

Light values live on `:root`; dark overrides under `html[data-mode="dark"]`.

### Mode resolution

`shared/theme/ThemeProvider` owns the preference `'system' | 'light' | 'dark'`:

- Persisted in `localStorage`; defaults to `'system'`; falls back to `'system'`
  silently if `localStorage` is unavailable.
- Resolves the effective mode via `matchMedia('(prefers-color-scheme: dark)')` with a
  change listener for live OS switches.
- Sets `data-mode` on `<html>` to the **resolved** mode (`light` or `dark`, never
  `system`), so CSS only ever deals with two states. A `useTheme` hook exposes mode + setter; a
  `ThemeToggle` button in the NavBar cycles system → light → dark.

### Aurora background

One fixed full-viewport CSS layer behind the app: three radial-gradient blobs with a
slow drift animation (~60s loop), disabled under `prefers-reduced-motion`. Pure CSS.

### GlassCard

`shared/ui/GlassCard` standardizes the frosted surface (background, blur, border,
radius, shadow). Every widget renders inside one; the glass treatment is defined once.

### Charts

Recharts components read colors from CSS variables via a small `useThemeTokens` helper
(reads computed styles), so charts flip correctly with the mode.

## 2. Backend (Go + SQLite)

### Folder sizes (treemap)

- New sqlc query: recursive CTE over `files` computing total bytes per directory
  subtree.
- `GET /api/directories/{id}/usage` (root when id omitted) → the node's children with
  `name`, `is_dir`, `total_bytes`. One level per request; the treemap drills down by
  re-querying. No schema change.

### File-type breakdown

- `GET /api/file-types` — SQL `GROUP BY` extension; Go maps extensions to categories
  (video, audio, image, archive, document, other). Returns category totals plus top
  extensions per category. No schema change.

### Sync activity

- Scanner detects diffs during sync: `added` (new path), `removed` (pruned path),
  `grown` / `shrunk` (size change).
- New table: `changes (id, path TEXT, change_type TEXT, bytes_delta INTEGER,
  detected_at INTEGER)`. Change types stored as strings.
- `GET /api/changes?limit=50`, newest first.
- Retention: rows older than 30 days pruned during each sync.
- Best-effort: failure writing changes logs a warning but never aborts the sync.

### Search & filters

- Extend the existing collection endpoint: `GET /api/files?q=&extension=&min_size=&limit=`
  — whole-tree name-substring search. Plain `LIKE` (no FTS) is sufficient at this scale.

### Explicitly not backend work

- Sorting of folder listings: client-side (each level is fully loaded already).
- Bulk delete: frontend batches the existing single-file `DELETE` endpoint.

### Error semantics

New endpoints follow existing handler conventions: `404` unknown directory id, `400`
malformed params.

## 3. Frontend components & features

Follows the existing feature-module pattern (`features/<name>/{api,queries,ui}`, named
exports, widgets own their loading/error states, pages compose only).

### Design system layer

- `shared/theme/` — ThemeProvider, `useTheme`, ThemeToggle (mounted in NavBar).
- `shared/ui/GlassCard.tsx`.
- `index.css` rewrite: aurora tokens (light + dark), background layer, drift/shimmer
  keyframes, reduced-motion guard.
- New deps: `@fontsource/iosevka-aile`, `@fontsource/iosevka`, `lucide-react`.
- All existing components restyled: NavBar, PageHeading, DiskUsageWidget/Bar,
  LargestFilesWidget/Pie/Breadcrumb, FileBrowserWidget, FileRow, DeleteConfirmDialog,
  DownloadsList, AddDownloadButton/Sheet, FolderPicker, layouts.

### New widget features

- `features/space-map/` — `SpaceMapWidget`: recharts `Treemap` fed by
  `useDirectoryUsage(nodeId)`; click a directory tile to drill in; breadcrumb to climb
  back (same model as largest-files).
- `features/file-types/` — `FileTypesWidget`: stacked horizontal bar + legend from
  `/api/file-types`; styled divs, no chart lib.
- `features/activity/` — `ActivityFeedWidget`: list from `/api/changes`; Lucide
  plus/minus/trend icons color-coded by change type; `refetchInterval: 30s`.

### File browser upgrades (`features/files`)

- `FileSearchBar`: debounced input → `/api/files?q=...`; active search replaces the
  folder listing with a flat result list showing paths; clearing returns to browsing.
- Sortable column headers (name / size / modified) — client-side state.
- Multi-select: row checkboxes; selection action bar with count + bulk delete; reuses
  `DeleteConfirmDialog`; batched single-delete mutations. Partial failure: failed files
  stay selected with an inline error; succeeded ones leave via refetch.
- Mobile pass: dashboard grid collapses to one column; ≥44px touch targets; the
  existing `hover: none` always-visible-actions pattern extended to new controls.

### Composition

`PageDashboard` gains the three new widgets via `LayoutDashboard`. Widgets fail
independently — one broken endpoint never blocks the rest of the dashboard.

## 4. Error handling & testing

### Error handling

- Backend: see §2 error semantics; scanner changes-write is best-effort.
- Frontend: per-widget React Query error state with retry, rendered as a glass-styled
  error card. Bulk delete partial-failure handling as above.
- Theming: `localStorage` unavailable → silent `system` fallback.

### Testing

- **Backend integration (Go, real SQLite):** recursive-CTE folder sizes against a
  seeded tree; scanner diff detection across two syncs (added/removed/grown); changes
  retention pruning; search filters; handler status codes including error cases.
- **Frontend (Vitest + RTL):** ThemeProvider mode resolution + persistence; per-widget
  loading/error/data states (existing widget-test pattern); search debounce and
  clear-returns-to-browsing; multi-select → bulk delete flow including partial failure.

## Build order

1. Design system: tokens, ThemeProvider + toggle, GlassCard, fonts, icons, aurora
   background; restyle all existing components; delete Paper CSS.
2. File-browser UX: search endpoint + FileSearchBar, sorting, multi-select + bulk
   delete, mobile pass.
3. Widgets: directories/usage endpoint + SpaceMapWidget; file-types endpoint +
   FileTypesWidget; scanner diff + changes table/endpoint + ActivityFeedWidget.
