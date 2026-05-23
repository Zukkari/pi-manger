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

-- name: GetFile :one
SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files
WHERE id = ?;

-- name: DeleteFile :exec
DELETE FROM files WHERE id = ?;

-- name: TopChildren :many
WITH RECURSIVE descendants(seed_id, id, size, is_dir) AS (
    SELECT f0.id, f0.id, f0.size, f0.is_dir FROM files f0 WHERE f0.parent_id = ?
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
WITH RECURSIVE descendants(seed_id, id, size, is_dir) AS (
    SELECT f0.id, f0.id, f0.size, f0.is_dir
    FROM files f0
    WHERE f0.parent_id = (SELECT id FROM files WHERE parent_id IS NULL LIMIT 1)
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
