# Filesystem Tree API — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

Add a `GET /api/files` endpoint that serves filesystem data stored in the SQLite database. The frontend uses it to lazily load directory children for a tree view, fetching only one level at a time (mobile-first: minimal first-load payload).

## Endpoint

```
GET /api/files?parent_id=<id>
```

- `parent_id` is optional. Omitting it returns root-level children (`parent_id IS NULL`).
- `parent_id` present returns direct children of that node.

## Response Shape

Returns a JSON array of file/directory objects. Empty directory returns `[]`.

```json
[
  {
    "id": 42,
    "parent_id": 7,
    "name": "Documents",
    "path": "/home/pi/Documents",
    "size": 0,
    "is_dir": true,
    "modified_at": 1711234567
  }
]
```

## Architecture

### Store layer

New method on `*Store` in `backend/internal/store/store.go`:

```go
ListChildren(ctx context.Context, parentID sql.NullInt64) ([]File, error)
```

Backed by a new named query in `backend/internal/store/query.sql`, re-generated via sqlc.

SQL:
```sql
-- name: ListChildren :many
SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files
WHERE (parent_id IS NULL AND :parent_id IS NULL)
   OR parent_id = :parent_id
ORDER BY is_dir DESC, name ASC;
```

### Handler layer

New file: `backend/internal/handler/files.go`

- `FilesHandler` struct with a `*store.Store` dependency
- Follows the same structure as `DiskHandler` (method check, encode response, log errors)
- Constructor: `NewFilesHandler(s *store.Store) *FilesHandler`

### Routing

In `backend/cmd/api/main.go`:

```go
mux.Handle("/api/files", handler.NewFilesHandler(db))
```

## Error Handling

| Scenario | HTTP Status | Response |
|---|---|---|
| Invalid `parent_id` (non-integer) | 400 | `{"error": "invalid parent_id"}` |
| Non-existent `parent_id` | 200 | `[]` |
| DB error | 500 | `{"error": "<message>"}` |
| Wrong HTTP method | 405 | `{"error": "method not allowed"}` |

Non-existent `parent_id` returns `[]` rather than 404 — a directory may have been deleted between sync cycles; returning empty is safe and avoids spurious errors on the client.

## Testing

File: `backend/internal/handler/files_test.go`

Test cases:
1. Root children (no `parent_id`) returns correct items
2. Children of a specific `parent_id` returns correct items
3. Non-existent `parent_id` returns `[]`
4. Invalid `parent_id` returns `400`
5. Wrong HTTP method returns `405`

Uses a real in-memory SQLite store (`:memory:`) — no mocks, consistent with the existing test approach in `store_test.go`.
