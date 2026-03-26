-- DeleteMissing is NOT sqlc-generated: sqlc v1.30.0 does not support dynamic
-- IN-clause slice params for SQLite. It is implemented as raw SQL in store.go.

-- name: UpsertFile :one
INSERT INTO files (parent_id, path, name, size, is_dir, modified_at, synced_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(path) DO UPDATE SET
    parent_id   = excluded.parent_id,
    name        = excluded.name,
    size        = excluded.size,
    is_dir      = excluded.is_dir,
    modified_at = excluded.modified_at,
    synced_at   = excluded.synced_at
RETURNING id;
