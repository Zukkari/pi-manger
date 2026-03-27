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
