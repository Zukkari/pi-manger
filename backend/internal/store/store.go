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

// TopChild is a direct child of a parent annotated with the total bytes of
// every file descended from it (the child's own size if it is a file,
// or the recursive sum of all descendant file sizes if it is a directory).
type TopChild struct {
	ID         int64
	Name       string
	IsDir      bool
	TotalBytes int64
}

// TopChildren returns the direct children of the given parent annotated with
// their total descendant file size. Pass nil for parentID to list the children
// of the managed-dir row (the user-facing "root"). Results are ordered by
// total_bytes DESC, then name ASC.
func (s *Store) TopChildren(ctx context.Context, parentID *int64) ([]TopChild, error) {
	if parentID == nil {
		rows, err := s.queries.TopRootChildren(ctx)
		if err != nil {
			return nil, err
		}
		out := make([]TopChild, 0, len(rows))
		for _, r := range rows {
			out = append(out, TopChild{ID: r.ID, Name: r.Name, IsDir: r.IsDir != 0, TotalBytes: toInt64(r.TotalBytes)})
		}
		return out, nil
	}
	rows, err := s.queries.TopChildren(ctx, sql.NullInt64{Int64: *parentID, Valid: true})
	if err != nil {
		return nil, err
	}
	out := make([]TopChild, 0, len(rows))
	for _, r := range rows {
		out = append(out, TopChild{ID: r.ID, Name: r.Name, IsDir: r.IsDir != 0, TotalBytes: toInt64(r.TotalBytes)})
	}
	return out, nil
}

// toInt64 coerces the interface{} returned by sqlc for COALESCE(SUM(...)) into
// an int64. SQLite can return int64 or []byte depending on the driver.
func toInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case []byte:
		var n int64
		fmt.Sscan(string(x), &n)
		return n
	default:
		return 0
	}
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

// SearchFilesParams filters for SearchFiles. Zero values mean "no filter":
// empty Query matches every name, empty Extension skips the extension filter,
// MinSize 0 skips the size filter. Limit must be > 0.
type SearchFilesParams struct {
	Query     string
	Extension string
	MinSize   int64
	Limit     int64
}

// escapeLike escapes LIKE wildcards so user input matches literally.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// FileNameSize is a minimal projection for file-type aggregation.
type FileNameSize struct {
	Name string
	Size int64
}

// FileNameSizes returns name and size for every regular file (no directories).
// Extension/category aggregation happens in Go: SQLite has no last-index-of,
// making extension extraction in SQL unreadable.
func (s *Store) FileNameSizes(ctx context.Context) ([]FileNameSize, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT name, size FROM files WHERE is_dir = 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FileNameSize
	for rows.Next() {
		var f FileNameSize
		if err := rows.Scan(&f.Name, &f.Size); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// SearchFiles returns files matching the given filters anywhere in the tree,
// excluding the managed-root row itself. Results are ordered directories
// first, then by name. MinSize > 0 implies files only (directory sizes are
// filesystem block sizes, not content sizes — matching them is meaningless).
func (s *Store) SearchFiles(ctx context.Context, p SearchFilesParams) ([]File, error) {
	query := `SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files WHERE parent_id IS NOT NULL`
	args := []any{}

	if p.Query != "" {
		query += ` AND name LIKE ? ESCAPE '\'`
		args = append(args, "%"+escapeLike(p.Query)+"%")
	}
	if p.Extension != "" {
		query += ` AND is_dir = 0 AND lower(name) LIKE ? ESCAPE '\'`
		args = append(args, "%."+escapeLike(strings.ToLower(p.Extension)))
	}
	if p.MinSize > 0 {
		query += ` AND is_dir = 0 AND size >= ?`
		args = append(args, p.MinSize)
	}
	query += ` ORDER BY is_dir DESC, name ASC, id ASC LIMIT ?`
	args = append(args, p.Limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
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
