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

func (m *mockStore) SnapshotFiles(_ context.Context) (map[string]store.SnapshotEntry, error) {
	return map[string]store.SnapshotEntry{}, nil
}

func (m *mockStore) RecordChanges(_ context.Context, _ []store.Change) error {
	return nil
}

func (m *mockStore) PruneChanges(_ context.Context, _ int64) error {
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

func openScannerStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSync_BootstrapSyncRecordsNoChanges(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "fileA.txt"), []byte("aa"), 0644); err != nil {
		t.Fatal(err)
	}

	s := openScannerStore(t)
	if err := scanner.Sync(context.Background(), root, s); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	changes, err := s.ListChanges(context.Background(), 100)
	if err != nil {
		t.Fatalf("ListChanges: %v", err)
	}
	if len(changes) != 0 {
		t.Fatalf("bootstrap sync must record 0 changes, got %d: %+v", len(changes), changes)
	}
}

func TestSync_RecordsAddedRemovedAndGrownChanges(t *testing.T) {
	root := t.TempDir()
	fileA := filepath.Join(root, "fileA.txt")
	fileB := filepath.Join(root, "fileB.txt")

	// (a) bootstrap: fileA with content "aa" (2 bytes).
	if err := os.WriteFile(fileA, []byte("aa"), 0644); err != nil {
		t.Fatal(err)
	}
	s := openScannerStore(t)
	if err := scanner.Sync(context.Background(), root, s); err != nil {
		t.Fatalf("Sync (bootstrap): %v", err)
	}
	changes, err := s.ListChanges(context.Background(), 100)
	if err != nil {
		t.Fatalf("ListChanges after bootstrap: %v", err)
	}
	if len(changes) != 0 {
		t.Fatalf("bootstrap must produce 0 changes, got %d", len(changes))
	}

	// (b) add fileB (3 bytes), a new subdirectory, and grow fileA to "aaaa" (4 bytes, delta +2).
	subdir := filepath.Join(root, "newsubdir")
	if err := os.Mkdir(subdir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileB, []byte("bbb"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fileA, []byte("aaaa"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := scanner.Sync(context.Background(), root, s); err != nil {
		t.Fatalf("Sync (second): %v", err)
	}

	changes, err = s.ListChanges(context.Background(), 100)
	if err != nil {
		t.Fatalf("ListChanges after second sync: %v", err)
	}

	// Expect exactly: one added row for fileB (+3), one added row for newsubdir (0),
	// and one grown row for fileA (+2). Directory added rows must carry BytesDelta == 0.
	var addedB, grownA, addedSubdir bool
	for _, c := range changes {
		if c.Path == fileB && c.ChangeType == "added" {
			if c.BytesDelta != 3 {
				t.Errorf("added fileB: expected BytesDelta 3, got %d", c.BytesDelta)
			}
			addedB = true
		}
		if c.Path == fileA && c.ChangeType == "grown" {
			if c.BytesDelta != 2 {
				t.Errorf("grown fileA: expected BytesDelta 2, got %d", c.BytesDelta)
			}
			grownA = true
		}
		if c.Path == subdir && c.ChangeType == "added" {
			// Directory sizes are filesystem block-allocation noise; delta must be zeroed.
			if c.BytesDelta != 0 {
				t.Errorf("added directory: expected BytesDelta 0, got %d", c.BytesDelta)
			}
			addedSubdir = true
		}
		// Directories must never produce grown/shrunk rows.
		if c.Path == root && (c.ChangeType == "grown" || c.ChangeType == "shrunk") {
			t.Errorf("unexpected grown/shrunk row for directory %q", c.Path)
		}
	}
	if !addedB {
		t.Errorf("expected an added row for fileB, changes: %+v", changes)
	}
	if !grownA {
		t.Errorf("expected a grown row for fileA, changes: %+v", changes)
	}
	if !addedSubdir {
		t.Errorf("expected an added row for newsubdir with BytesDelta=0, changes: %+v", changes)
	}
	// No extra change types (root dir must not appear as grown/shrunk).
	for _, c := range changes {
		if c.Path != fileA && c.Path != fileB && c.Path != subdir {
			t.Errorf("unexpected change row for path %q (type %q)", c.Path, c.ChangeType)
		}
	}

	// (c) remove fileB → expect a removed row with negative BytesDelta.
	if err := os.Remove(fileB); err != nil {
		t.Fatal(err)
	}
	if err := scanner.Sync(context.Background(), root, s); err != nil {
		t.Fatalf("Sync (third): %v", err)
	}

	// ListChanges returns newest first; third-sync rows appear before second-sync rows.
	all, err := s.ListChanges(context.Background(), 100)
	if err != nil {
		t.Fatalf("ListChanges after third sync: %v", err)
	}
	var removedB bool
	for _, c := range all {
		if c.Path == fileB && c.ChangeType == "removed" {
			if c.BytesDelta != -3 {
				t.Errorf("removed fileB: expected BytesDelta -3, got %d", c.BytesDelta)
			}
			removedB = true
			break
		}
	}
	if !removedB {
		t.Errorf("expected a removed row for fileB after third sync, all changes: %+v", all)
	}
}

// Verify *store.Store satisfies scanner.Store at compile time.
var _ scanner.Store = (*store.Store)(nil)
