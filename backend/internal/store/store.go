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
