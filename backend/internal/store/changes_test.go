package store_test

import (
	"context"
	"path/filepath"
	"testing"

	"pi-manager/internal/store"
)

func openChangesStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestChanges_RecordAndListNewestFirst(t *testing.T) {
	s := openChangesStore(t)
	ctx := context.Background()

	if err := s.RecordChanges(ctx, []store.Change{
		{Path: "/d/a.txt", ChangeType: "added", BytesDelta: 100, DetectedAt: 1000},
		{Path: "/d/b.txt", ChangeType: "removed", BytesDelta: -50, DetectedAt: 2000},
	}); err != nil {
		t.Fatalf("RecordChanges: %v", err)
	}

	got, err := s.ListChanges(ctx, 10)
	if err != nil {
		t.Fatalf("ListChanges: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 changes, got %d", len(got))
	}
	if got[0].Path != "/d/b.txt" || got[0].ChangeType != "removed" {
		t.Errorf("expected newest first, got %+v", got[0])
	}
}

func TestChanges_ListRespectsLimit(t *testing.T) {
	s := openChangesStore(t)
	ctx := context.Background()

	var batch []store.Change
	for i := 0; i < 5; i++ {
		batch = append(batch, store.Change{Path: "/p", ChangeType: "added", DetectedAt: int64(i)})
	}
	if err := s.RecordChanges(ctx, batch); err != nil {
		t.Fatal(err)
	}

	got, err := s.ListChanges(ctx, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3, got %d", len(got))
	}
}

func TestChanges_PruneRemovesOldRows(t *testing.T) {
	s := openChangesStore(t)
	ctx := context.Background()

	if err := s.RecordChanges(ctx, []store.Change{
		{Path: "/old", ChangeType: "added", DetectedAt: 100},
		{Path: "/new", ChangeType: "added", DetectedAt: 9000},
	}); err != nil {
		t.Fatal(err)
	}

	if err := s.PruneChanges(ctx, 5000); err != nil {
		t.Fatalf("PruneChanges: %v", err)
	}

	got, err := s.ListChanges(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Path != "/new" {
		t.Fatalf("expected only /new to survive, got %+v", got)
	}
}

func TestChanges_RecordEmptyBatchIsNoop(t *testing.T) {
	s := openChangesStore(t)
	if err := s.RecordChanges(context.Background(), nil); err != nil {
		t.Fatalf("empty batch should not error: %v", err)
	}
}

func TestSnapshotFiles_ReturnsPathSizeAndDirFlag(t *testing.T) {
	s := openChangesStore(t)
	ctx := context.Background()

	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{Path: "/d", Name: "d", IsDir: 1, ModifiedAt: 1, SyncedAt: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{Path: "/d/a", Name: "a", Size: 7, ModifiedAt: 1, SyncedAt: 1}); err != nil {
		t.Fatal(err)
	}

	snap, err := s.SnapshotFiles(ctx)
	if err != nil {
		t.Fatalf("SnapshotFiles: %v", err)
	}
	if len(snap) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(snap))
	}
	if e, ok := snap["/d/a"]; !ok || e.Size != 7 || e.IsDir {
		t.Fatalf("unexpected snapshot entry: %+v", snap["/d/a"])
	}
}
