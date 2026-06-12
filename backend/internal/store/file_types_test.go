package store_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"pi-manager/internal/store"
)

func TestFileNameSizes_ReturnsFilesOnly(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	ctx := context.Background()
	now := time.Now().Unix()

	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{Path: "/d", Name: "d", IsDir: 1, ModifiedAt: now, SyncedAt: now}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{Path: "/d/a.mkv", Name: "a.mkv", Size: 10, ModifiedAt: now, SyncedAt: now}); err != nil {
		t.Fatal(err)
	}

	got, err := s.FileNameSizes(ctx)
	if err != nil {
		t.Fatalf("FileNameSizes: %v", err)
	}
	if len(got) != 1 || got[0].Name != "a.mkv" || got[0].Size != 10 {
		t.Fatalf("expected [a.mkv/10], got %+v", got)
	}
}
