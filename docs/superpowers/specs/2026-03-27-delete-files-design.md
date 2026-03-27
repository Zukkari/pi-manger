# Delete Files Feature — Design Spec

**Date:** 2026-03-27

## Overview

Add the ability to delete files and directories from the pi-manager UI. Deleting removes the entry from the filesystem recursively and from the SQLite database (cascade handles descendants). A context menu per row and a confirmation dialog prevent accidental deletion.

---

## Backend

### New endpoint

`DELETE /api/files/{id}`

Registered in `main.go` as:
```
mux.Handle("/api/files/", handler.NewDeleteFileHandler(db, managedDir))
```
The trailing slash catches all `/api/files/*` requests. The existing `GET /api/files` handler remains on the exact path `/api/files` and is unaffected.

### Handler — `backend/internal/handler/files_delete.go`

`DeleteFileHandler` holds `*store.Store` and `managedDir string`.

Flow:
1. Reject non-DELETE methods with `405 Method Not Allowed`.
2. Parse `{id}` from the URL path; reject non-integer with `400 Bad Request`.
3. Call `store.GetFile(ctx, id)` — respond `404 Not Found` if the record does not exist.
4. Call `os.RemoveAll(file.Path)` to delete from the filesystem recursively.
5. Call `store.DeleteFile(ctx, id)` to remove the DB record; `ON DELETE CASCADE` removes all descendant records automatically.
6. Respond `204 No Content` on success.

### New store queries (`backend/internal/store/query.sql`)

```sql
-- name: GetFile :one
SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files
WHERE id = ?;

-- name: DeleteFile :exec
DELETE FROM files WHERE id = ?;
```

Regenerate with `cd backend && sqlc generate` after adding these.

### Error responses

| Condition | Status |
|-----------|--------|
| Non-DELETE method | 405 |
| Non-integer ID in path | 400 |
| ID not found in DB | 404 |
| `os.RemoveAll` fails | 500 |
| DB delete fails | 500 |

---

## Frontend

### API layer — `features/files/api/files.ts`

Add:
```ts
export const deleteFile = (id: number): Promise<void> =>
  apiClient<void>(`/files/${id}`, { method: 'DELETE' });
```

### Mutation hook — `features/files/queries/useDeleteFile.ts`

- Calls `deleteFile(id)`
- On success: invalidates the `useFiles` query for the current `parent_id` so the list refreshes automatically

### `FileRow` changes

The non-parent row gets a `⋯` (three-dot) button on the right edge, replacing the `›` chevron for both files and directories. Clicking it:
- Stops click propagation (does not trigger folder navigation)
- Opens a small inline dropdown with one item: **"Delete"**

### New component — `features/files/ui/DeleteConfirmDialog.tsx`

A modal overlay rendered via a React portal. Props:
- `entry: FileEntry` — the item being deleted
- `isPending: boolean` — mutation in-flight state
- `onConfirm: () => void`
- `onCancel: () => void`

Contents:
- Title: **"Delete [entry.name]?"**
- Body: *"This cannot be undone."*
- **Cancel** button — neutral style; disabled while `isPending`
- **Confirm** button — red/destructive style; shows spinner and is disabled while `isPending`

### `FileBrowserWidget` changes

Add state: `pendingDelete: FileEntry | null`.

- Selecting "Delete" from the row menu sets `pendingDelete`
- Cancelling the dialog clears `pendingDelete`
- Confirming calls `useDeleteFile`, then clears `pendingDelete` on success

---

## Data flow summary

```
User clicks ⋯ → selects "Delete"
  → FileBrowserWidget sets pendingDelete
  → DeleteConfirmDialog renders
  → User clicks Confirm
  → useDeleteFile mutation fires DELETE /api/files/{id}
  → Backend: GetFile → os.RemoveAll → store.DeleteFile
  → 204 response
  → React Query invalidates useFiles → list refreshes
  → Dialog closes
```

---

## Out of scope

- Undo / soft delete
- Bulk delete
- Permission checks beyond filesystem errors
