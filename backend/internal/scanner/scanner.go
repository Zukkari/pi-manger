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
	SnapshotFiles(ctx context.Context) (map[string]store.SnapshotEntry, error)
	RecordChanges(ctx context.Context, changes []store.Change) error
	PruneChanges(ctx context.Context, olderThan int64) error
}

// Sync walks root recursively, upserts every entry into s, then removes rows
// for paths that no longer exist on disk. Per-entry errors are logged and skipped.
// After the walk it records added/removed/grown/shrunk changes for the activity
// feed. A first-ever sync (empty snapshot) is treated as a bootstrap and records
// no changes — otherwise the feed would open with thousands of "added" rows.
func Sync(ctx context.Context, root string, s Store) error {
	snapshot, err := s.SnapshotFiles(ctx)
	if err != nil {
		log.Printf("scanner: snapshot for diff detection failed: %v", err)
		snapshot = nil
	}
	// A nil/empty snapshot means a fresh database: recording every file as
	// "added" on first sync would flood the feed, so diffing is skipped.
	bootstrap := len(snapshot) == 0
	var changes []store.Change
	now := time.Now().Unix()
	seenSet := make(map[string]struct{})

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

		seenSet[path] = struct{}{}
		if !bootstrap && snapshot != nil {
			prev, existed := snapshot[path]
			switch {
			case !existed:
				changes = append(changes, store.Change{Path: path, ChangeType: "added", BytesDelta: info.Size(), DetectedAt: now})
			case !d.IsDir() && info.Size() > prev.Size:
				changes = append(changes, store.Change{Path: path, ChangeType: "grown", BytesDelta: info.Size() - prev.Size, DetectedAt: now})
			case !d.IsDir() && info.Size() < prev.Size:
				changes = append(changes, store.Change{Path: path, ChangeType: "shrunk", BytesDelta: info.Size() - prev.Size, DetectedAt: now})
			}
		}

		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	if !bootstrap && snapshot != nil {
		for path, prev := range snapshot {
			if _, ok := seenSet[path]; !ok {
				changes = append(changes, store.Change{Path: path, ChangeType: "removed", BytesDelta: -prev.Size, DetectedAt: now})
			}
		}
	}

	if err := s.DeleteMissing(ctx, seen); err != nil {
		return err
	}

	if err := s.RecordChanges(ctx, changes); err != nil {
		log.Printf("scanner: recording changes failed (sync unaffected): %v", err)
	}
	const retentionSeconds = 30 * 24 * 60 * 60
	if err := s.PruneChanges(ctx, now-retentionSeconds); err != nil {
		log.Printf("scanner: pruning changes failed (sync unaffected): %v", err)
	}
	return nil
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
