CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY,
    parent_id   INTEGER REFERENCES files(id) ON DELETE CASCADE,
    path        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    is_dir      INTEGER NOT NULL DEFAULT 0,
    modified_at INTEGER NOT NULL,
    synced_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS changes (
    id          INTEGER PRIMARY KEY,
    path        TEXT    NOT NULL,
    change_type TEXT    NOT NULL,
    bytes_delta INTEGER NOT NULL DEFAULT 0,
    detected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_detected_at ON changes(detected_at);
