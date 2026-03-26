package scanner_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"pi-manager/internal/scanner"
	"pi-manager/internal/store"
)

// mockStore records calls made by Sync for assertion.
type mockStore struct {
	upserted []store.UpsertFileParams
	deleted  []string
	nextID   int64
}

func (m *mockStore) UpsertFile(_ context.Context, arg store.UpsertFileParams) (int64, error) {
	m.upserted = append(m.upserted, arg)
	m.nextID++
	return m.nextID, nil
}

func (m *mockStore) DeleteMissing(_ context.Context, paths []string) error {
	m.deleted = paths
	return nil
}

func TestSync_UpsertsRootDirectory(t *testing.T) {
	root := t.TempDir()
	ms := &mockStore{}

	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if len(ms.upserted) == 0 {
		t.Fatal("expected at least one upsert (root dir), got none")
	}
	if ms.upserted[0].Path != root {
		t.Errorf("expected first upsert path %q, got %q", root, ms.upserted[0].Path)
	}
	if ms.upserted[0].IsDir != 1 {
		t.Errorf("expected root to have is_dir=1, got %d", ms.upserted[0].IsDir)
	}
	if ms.upserted[0].ParentID.Valid {
		t.Error("expected root parent_id to be NULL")
	}
}

func TestSync_UpsertsChildFile(t *testing.T) {
	root := t.TempDir()
	f, err := os.CreateTemp(root, "testfile-*.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("hello")
	f.Close()

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// Should have upserted root + one file
	if len(ms.upserted) != 2 {
		t.Fatalf("expected 2 upserts (root + file), got %d", len(ms.upserted))
	}
	fileEntry := ms.upserted[1]
	if fileEntry.IsDir != 0 {
		t.Errorf("expected file to have is_dir=0, got %d", fileEntry.IsDir)
	}
	if fileEntry.Size != 5 {
		t.Errorf("expected file size 5, got %d", fileEntry.Size)
	}
}

func TestSync_SetsParentIDForChildFile(t *testing.T) {
	root := t.TempDir()
	os.CreateTemp(root, "child-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// root is upserted first and gets id=1; child should reference it
	child := ms.upserted[1]
	if !child.ParentID.Valid {
		t.Error("expected child parent_id to be set")
	}
	if child.ParentID.Int64 != 1 {
		t.Errorf("expected child parent_id=1, got %d", child.ParentID.Int64)
	}
}

func TestSync_SetsParentIDForNestedDirectory(t *testing.T) {
	root := t.TempDir()
	subdir := filepath.Join(root, "subdir")
	os.Mkdir(subdir, 0755)
	os.CreateTemp(subdir, "nested-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// Entries: root (id=1), subdir (id=2, parent=1), nested file (id=3, parent=2)
	if len(ms.upserted) != 3 {
		t.Fatalf("expected 3 upserts, got %d", len(ms.upserted))
	}
	subEntry := ms.upserted[1]
	if !subEntry.ParentID.Valid || subEntry.ParentID.Int64 != 1 {
		t.Errorf("subdir parent_id: got %v, want 1", subEntry.ParentID)
	}
	nestedEntry := ms.upserted[2]
	if !nestedEntry.ParentID.Valid || nestedEntry.ParentID.Int64 != 2 {
		t.Errorf("nested file parent_id: got %v, want 2", nestedEntry.ParentID)
	}
}

func TestSync_CallsDeleteMissingWithAllSeenPaths(t *testing.T) {
	root := t.TempDir()
	os.CreateTemp(root, "a-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if len(ms.deleted) != 2 { // root + file
		t.Errorf("expected DeleteMissing called with 2 paths, got %d", len(ms.deleted))
	}
}

func TestSync_SkipsUnreadableEntry(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("running as root; permission checks don't apply")
	}
	root := t.TempDir()
	restricted := filepath.Join(root, "restricted")
	os.Mkdir(restricted, 0000)
	t.Cleanup(func() { os.Chmod(restricted, 0755) })

	ms := &mockStore{}
	// Should not return an error — unreadable entries are skipped
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("expected no error for unreadable entry, got: %v", err)
	}
}

func TestSync_ReturnsErrorOnCancelledContext(t *testing.T) {
	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	ms := &mockStore{}
	err := scanner.Sync(ctx, root, ms)
	if err == nil {
		t.Fatal("expected error for cancelled context, got nil")
	}
}

// Verify *store.Store satisfies scanner.Store at compile time.
var _ scanner.Store = (*store.Store)(nil)
