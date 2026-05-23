# Largest Files Pie Chart — Design

## Summary

A dashboard widget that visualises where disk space is going under `MANAGED_DIR` as a pie chart. It shows the top 5 direct children (files or directories) by total size, plus an aggregated "Other" slice for everything else. Clicking a directory slice drills into that directory; a breadcrumb lets the user navigate back. Files and "Other" slices are not clickable.

The view answers "where is my Pi's disk being spent?" — analogous to WinDirStat / Disk Usage Analyzer, scoped to the directory the backend is monitoring.

## Scope

In scope:
- Recursive directory-size computation in SQLite (no schema change).
- New JSON endpoint `GET /api/files/top`.
- New `features/largest-files/` frontend module with a widget rendered on the dashboard below `DiskUsageWidget`.
- Drill-down navigation owned by the widget (local React state, not URL state).
- Adding `recharts` as a frontend dependency.

Out of scope:
- Treemap / sunburst alternatives.
- Drilling into "Other" or expanding it.
- URL-persisted drill-down state (intentionally local — keeps the widget self-contained).
- Streaming or auto-refreshing the chart. Standard React Query staleness applies; the scanner repopulates the DB every 60s server-side.

## Architecture

### Backend

```
backend/internal/
├── store/
│   ├── query.sql          # adds TopChildren, TopRootChildren queries
│   └── store.go           # adds TopChildren wrapper handling root-vs-non-root
└── handler/
    └── top_files.go       # new handler for GET /api/files/top
```

The store layer exposes a single Go-level entrypoint `TopChildren(ctx, parentID *int64, limit int)` that picks the right underlying sqlc query based on whether `parentID` is nil. This keeps the handler agnostic of the SQLite quirk that forces two queries.

### Frontend

```
frontend/src/features/largest-files/
├── api/
│   └── topFiles.ts
├── queries/
│   ├── queryKeys.ts
│   └── useLargestFiles.ts
├── ui/
│   ├── LargestFilesWidget.tsx
│   ├── LargestFilesPie.tsx
│   └── LargestFilesBreadcrumb.tsx
├── largest-files.types.ts
└── index.ts
```

`LargestFilesWidget` is the only export. Subcomponents are internal to the feature module.

## Data model

No schema change. The existing `files` table provides everything:

```
files(id, parent_id, path, name, size, is_dir, modified_at, synced_at)
```

Total size for a directory is computed at query time as the sum of `size` across all descendant rows where `is_dir = 0`. Directory rows themselves do not contribute (their `size` is the inode size, not content size).

## SQL

The scanner inserts the managed dir itself as the only row with `parent_id IS NULL`. From the user's perspective "root" means **the children of that managed-dir row** — same convention already used by `store.ListChildren`. Two named queries are added because SQLite cannot bind `NULL` to `parent_id = ?`:

```sql
-- name: TopChildren :many
WITH RECURSIVE descendants(seed_id, id, size, is_dir) AS (
    SELECT id, id, size, is_dir FROM files WHERE parent_id = ?
    UNION ALL
    SELECT d.seed_id, f.id, f.size, f.is_dir
    FROM files f JOIN descendants d ON f.parent_id = d.id
)
SELECT
    f.id, f.name, f.is_dir,
    COALESCE(SUM(CASE WHEN d.is_dir = 0 THEN d.size ELSE 0 END), 0) AS total_bytes
FROM descendants d
JOIN files f ON f.id = d.seed_id
GROUP BY f.id, f.name, f.is_dir
ORDER BY total_bytes DESC, f.name ASC;

-- name: TopRootChildren :many
-- Identical body to TopChildren but seeded against the children of the
-- managed-dir row. The seed predicate becomes:
--   WHERE parent_id = (SELECT id FROM files WHERE parent_id IS NULL LIMIT 1)
```

The `ORDER BY name ASC` secondary sort gives deterministic ordering when sizes are equal (matters for tests).

The SQL returns every direct child of the parent (no `LIMIT`), already sorted. The "top N" + "other" split is computed in Go after the query returns: take the first N rows as `entries`, sum the remaining rows' `total_bytes` into `other_bytes`. Doing the split in Go keeps the SQL simple; the result set per parent is bounded by the number of direct children, which is small for any realistic Pi-managed directory.

## API

### `GET /api/files/top`

Query params:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `parent_id` | integer, optional | — | Omit for root entries. |
| `limit` | integer, optional | `5` | Clamped silently to `[1, 20]`. |

Response (200):

```json
{
  "parent_id": 42,
  "parent_path": "/data/media",
  "entries": [
    { "id": 101, "name": "movies", "is_dir": true,  "size_bytes": 8589934592 },
    { "id": 102, "name": "photos", "is_dir": true,  "size_bytes": 2147483648 },
    { "id": 200, "name": "ubuntu.iso", "is_dir": false, "size_bytes": 1073741824 }
  ],
  "other_bytes": 524288,
  "total_bytes": 11811160064
}
```

For the root call, `parent_id` and `parent_path` are `null`. `total_bytes` equals `sum(entries.size_bytes) + other_bytes` — included so the client doesn't recompute.

`size_bytes`, `other_bytes`, and `total_bytes` are serialised as JSON numbers. SQLite `INTEGER` is 64-bit; values comfortably fit in JS `number` precision (53-bit) for any realistic Pi disk (< 9 PB).

### Error responses

This handler matches the existing project convention used by `disk.go`, `files.go`, and `files_delete.go`: errors are serialised as a flat `{"error": "<message>"}` JSON object via the package-local `errorResponse` type. This intentionally diverges from the user-level CLAUDE.md preference for RFC 7807 — consistency with the existing handlers takes precedence so all four endpoints behave identically. A separate refactor can lift all handlers to Problem Details if desired later.

| Condition | Status | Body |
|-----------|--------|------|
| `parent_id` not parseable as integer | 400 | `{"error": "invalid parent_id"}` |
| `limit` not parseable as integer | 400 | `{"error": "invalid limit"}` |
| `parent_id` refers to a row where `is_dir = 0` | 400 | `{"error": "parent_id is not a directory"}` |
| `parent_id` refers to no row | 404 | `{"error": "not found"}` |
| Empty result (folder has no children) | 200 | `entries: []`, `other_bytes: 0`, `total_bytes: 0` |

`limit` out of `[1, 20]` is clamped silently and returns 200.

## Frontend behaviour

### State

`LargestFilesWidget` owns one piece of local state:

```ts
const [path, setPath] = useState<{ id: number; name: string }[]>([]);
```

`path[]` is the breadcrumb stack starting at the first drilled-into folder. Empty array = viewing root. `currentParentId = path[path.length - 1]?.id ?? null`.

Drill-down event:
- File slice click → no-op.
- "Other" slice click → no-op.
- Folder slice click → `setPath(p => [...p, { id, name }])`.

Breadcrumb click on crumb at index `i` → `setPath(p => p.slice(0, i))` (clicking "Root" sets it to `[]`).

The breadcrumb name for each level comes from the slice that was clicked, so a re-fetch is not needed to render the breadcrumb. The current folder's display name comes from `parent_path` in the response (for stale tooltips / accessibility text).

### Query

`useLargestFiles(parentId: number | null)` wraps React Query:

```ts
queryKey: ['largest-files', parentId]
queryFn: () => fetchTopFiles(parentId)
```

Default `staleTime` (matches `useDiskUsage`). No polling.

### Loading / error / empty / "no files" states

- Loading → skeleton circle inside the chart area.
- Error → inline "Couldn't load directory sizes" message. React Query's default retry handles transient failures.
- Empty (`entries.length === 0`, `other_bytes === 0`) → centered "No files to display" inside the chart area.
- All zero-byte (`total_bytes === 0` but `entries.length > 0`) → centered "No files in this folder" message. The pie itself is not rendered because Recharts cannot draw a zero-sum pie.

### Slice rendering

Built on Recharts `<PieChart>` + `<Pie>` + `<Cell>`. The data passed to Recharts is `[...entries, { name: 'Other', size_bytes: other_bytes, isOther: true }]` — the "Other" entry is only included when `other_bytes > 0`.

Cursor styling:
- Folder slices → `pointer`.
- File slices and "Other" → default cursor (no-op clicks).

Hover tooltip on every slice shows `name`, formatted size (e.g. `1.07 GB`), and percentage of `total_bytes`.

### Tests

Mirroring `DiskUsageWidget.tests.tsx`:
- Render with a mocked response → asserts slices match entries plus "Other" when present.
- Click a folder slice → asserts the query key updates and the new fetch is issued with the right `parent_id`.
- Click a breadcrumb crumb → asserts the path stack rewinds correctly.
- Click a file slice or "Other" slice → asserts no navigation.
- Loading / error / empty / all-zero states each render their expected text/element.

## Placement

`PageDashboard` becomes:

```tsx
<LayoutDashboard>
  <PageHeading>Dashboard</PageHeading>
  <DiskUsageWidget />
  <LargestFilesWidget />
</LayoutDashboard>
```

`LayoutDashboard` already provides `flex flex-col gap-6`. No layout change required.

## Dependencies

Add to `frontend/package.json`:

```
"recharts": "^3.8.1"
```

Version 3.x is chosen over 2.x because the project runs React 19 — Recharts 2.x has peer-dependency friction with React 19, while 3.x ships with first-class React 19 support. The `PieChart` / `Pie` / `Cell` / `Tooltip` API used by this widget is unchanged between the two major versions.

Bundle impact is roughly 180 KB gzipped, served by Nginx as a static asset alongside the existing React + TanStack bundle. Acceptable for a self-hosted Pi dashboard.

## Testing strategy

Backend:
- `store_test.go` — extend with a fixture tree (root → 2 dirs + 1 file; one dir → 3 nested files) and assert recursive totals for root and non-root parents. Includes a dir-only-containing-dirs case to verify zero totals.
- `files_test.go` — table-driven test of the new handler covering: root, drill-down, `limit` clamp at both ends, missing `parent_id`, `parent_id` of a file row, unparseable `parent_id`, unparseable `limit`.

Frontend:
- `LargestFilesWidget.tests.tsx` as described under "Tests" above.
- No separate test for `LargestFilesPie` / `LargestFilesBreadcrumb` — they are pure presentation rendered through the widget test.
