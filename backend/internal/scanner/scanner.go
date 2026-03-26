package scanner

import (
	"context"
	"database/sql"
	"io/fs"
	"log"
	"path/filepath"
	"time"

	"pi-manager/internal/store"
)

// Store is the database interface required by Sync.
type Store interface {
	UpsertFile(ctx context.Context, arg store.UpsertFileParams) (int64, error)
	DeleteMissing(ctx context.Context, paths []string) error
}

// Sync walks root recursively, upserts every entry into s, then removes rows
// for paths that no longer exist on disk. Per-entry errors are logged and skipped.
func Sync(ctx context.Context, root string, s Store) error {
	pathToID := make(map[string]int64)
	var seen []string

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err != nil {
			log.Printf("scanner: skipping %q: %v", path, err)
			return nil
		}

		info, err := d.Info()
		if err != nil {
			log.Printf("scanner: stat %q: %v", path, err)
			return nil
		}

		var parentID sql.NullInt64
		if path != root {
			if pid, ok := pathToID[filepath.Dir(path)]; ok {
				parentID = sql.NullInt64{Int64: pid, Valid: true}
			}
		}

		id, err := s.UpsertFile(ctx, store.UpsertFileParams{
			ParentID:   parentID,
			Path:       path,
			Name:       d.Name(),
			Size:       info.Size(),
			IsDir:      boolToInt64(d.IsDir()),
			ModifiedAt: info.ModTime().Unix(),
			SyncedAt:   time.Now().Unix(),
		})
		if err != nil {
			log.Printf("scanner: upsert %q: %v", path, err)
			return nil
		}

		pathToID[path] = id
		seen = append(seen, path)
		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	return s.DeleteMissing(ctx, seen)
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
