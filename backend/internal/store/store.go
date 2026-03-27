package store

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// Store wraps the sqlc-generated Queries with a managed DB connection.
type Store struct {
	db      *sql.DB
	queries *Queries
}

// Open opens (or creates) the SQLite database at dbPath, enables foreign keys,
// and runs the schema migration. The caller must call Close when done.
func Open(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %q: %w", dbPath, err)
	}

	if _, err := db.ExecContext(context.Background(), "PRAGMA busy_timeout = 5000"); err != nil {
		db.Close()
		return nil, fmt.Errorf("set busy timeout: %w", err)
	}

	if _, err := db.ExecContext(context.Background(), "PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	if _, err := db.ExecContext(context.Background(), schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("run schema migration: %w", err)
	}

	return &Store{db: db, queries: New(db)}, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// UpsertFile inserts or updates a file record by path, returning its stable id.
func (s *Store) UpsertFile(ctx context.Context, arg UpsertFileParams) (int64, error) {
	return s.queries.UpsertFile(ctx, arg)
}

// DeleteMissing removes all file records whose paths are not in the given slice.
// If paths is empty, all records are deleted.
func (s *Store) DeleteMissing(ctx context.Context, paths []string) error {
	if len(paths) == 0 {
		_, err := s.db.ExecContext(ctx, "DELETE FROM files")
		return err
	}
	placeholders := strings.Repeat(",?", len(paths))[1:]
	query := "DELETE FROM files WHERE path NOT IN (" + placeholders + ")"
	args := make([]any, len(paths))
	for i, p := range paths {
		args[i] = p
	}
	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

// ListChildren returns direct children of the given parent.
// Pass a zero sql.NullInt64 (Valid=false) to get root-level entries.
func (s *Store) ListChildren(ctx context.Context, parentID sql.NullInt64) ([]File, error) {
	const rootQ = `SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files WHERE parent_id = (SELECT id FROM files WHERE parent_id IS NULL LIMIT 1) ORDER BY is_dir DESC, name ASC`
	const childQ = `SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files WHERE parent_id = ? ORDER BY is_dir DESC, name ASC`

	var (
		rows *sql.Rows
		err  error
	)
	if !parentID.Valid {
		rows, err = s.db.QueryContext(ctx, rootQ)
	} else {
		rows, err = s.db.QueryContext(ctx, childQ, parentID.Int64)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.ParentID, &f.Path, &f.Name, &f.Size, &f.IsDir, &f.ModifiedAt, &f.SyncedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

// GetFile returns the file record with the given id.
// Returns sql.ErrNoRows if no record exists.
func (s *Store) GetFile(ctx context.Context, id int64) (File, error) {
	return s.queries.GetFile(ctx, id)
}

// DeleteFile removes the file record with the given id.
// ON DELETE CASCADE removes all descendant records automatically.
func (s *Store) DeleteFile(ctx context.Context, id int64) error {
	return s.queries.DeleteFile(ctx, id)
}
