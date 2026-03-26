package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestOpen_CreatesSchema(t *testing.T) {
	s := openTestStore(t)
	rows, err := s.db.QueryContext(context.Background(), "SELECT count(*) FROM files")
	if err != nil {
		t.Fatalf("schema not created: %v", err)
	}
	rows.Close()
}

func TestUpsertFile_ReturnsPositiveID(t *testing.T) {
	s := openTestStore(t)
	id, err := s.UpsertFile(context.Background(), UpsertFileParams{
		ParentID:   sql.NullInt64{},
		Path:       "/data/foo.txt",
		Name:       "foo.txt",
		Size:       1024,
		IsDir:      0,
		ModifiedAt: time.Now().Unix(),
		SyncedAt:   time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("UpsertFile: %v", err)
	}
	if id <= 0 {
		t.Errorf("expected positive id, got %d", id)
	}
}

func TestUpsertFile_SamePathKeepsID(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	params := UpsertFileParams{
		Path:       "/data/foo.txt",
		Name:       "foo.txt",
		Size:       1024,
		IsDir:      0,
		ModifiedAt: time.Now().Unix(),
		SyncedAt:   time.Now().Unix(),
	}
	id1, err := s.UpsertFile(ctx, params)
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	params.Size = 2048
	id2, err := s.UpsertFile(ctx, params)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if id1 != id2 {
		t.Errorf("expected stable id %d, got %d on re-upsert", id1, id2)
	}
}

func TestDeleteMissing_RemovesAbsentPaths(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	_, err := s.UpsertFile(ctx, UpsertFileParams{Path: "/data/a.txt", Name: "a.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()})
	if err != nil {
		t.Fatalf("upsert a: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{Path: "/data/b.txt", Name: "b.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()})
	if err != nil {
		t.Fatalf("upsert b: %v", err)
	}

	if err := s.DeleteMissing(ctx, []string{"/data/a.txt"}); err != nil {
		t.Fatalf("DeleteMissing: %v", err)
	}

	var count int
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files WHERE path = ?", "/data/b.txt").Scan(&count)
	if count != 0 {
		t.Errorf("expected b.txt deleted, found %d rows", count)
	}
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files WHERE path = ?", "/data/a.txt").Scan(&count)
	if count != 1 {
		t.Errorf("expected a.txt to still exist, found %d rows", count)
	}
}

func TestDeleteMissing_EmptySliceDeletesAll(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.UpsertFile(ctx, UpsertFileParams{Path: "/data/a.txt", Name: "a.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()}); err != nil {
		t.Fatalf("upsert setup: %v", err)
	}

	if err := s.DeleteMissing(ctx, []string{}); err != nil {
		t.Fatalf("DeleteMissing with empty slice: %v", err)
	}

	var count int
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files").Scan(&count)
	if count != 0 {
		t.Errorf("expected all rows deleted, got %d", count)
	}
}

func TestListChildren_ReturnsRootEntries(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	// Insert a root-level dir and a root-level file.
	dirID, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/readme.txt", Name: "readme.txt", Size: 512, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert file: %v", err)
	}
	// Insert a child that must NOT appear in root results.
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/note.txt", Name: "note.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert child: %v", err)
	}

	files, err := s.ListChildren(ctx, sql.NullInt64{})
	if err != nil {
		t.Fatalf("ListChildren: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 root entries, got %d", len(files))
	}
	if files[0].Name != "docs" {
		t.Errorf("expected files[0].Name == \"docs\" (dirs sort first), got %q", files[0].Name)
	}
	if files[1].Name != "readme.txt" {
		t.Errorf("expected files[1].Name == \"readme.txt\" (file comes second), got %q", files[1].Name)
	}
}

func TestListChildren_ReturnsChildrenOfParent(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	dirID, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/a.txt", Name: "a.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert child a: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/b.txt", Name: "b.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert child b: %v", err)
	}

	files, err := s.ListChildren(ctx, sql.NullInt64{Int64: dirID, Valid: true})
	if err != nil {
		t.Fatalf("ListChildren: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 children, got %d", len(files))
	}
	if files[0].Name != "a.txt" {
		t.Errorf("expected files[0].Name == \"a.txt\" (alphabetical), got %q", files[0].Name)
	}
	if files[1].Name != "b.txt" {
		t.Errorf("expected files[1].Name == \"b.txt\", got %q", files[1].Name)
	}
}

func TestListChildren_NonExistentParentReturnsEmpty(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	files, err := s.ListChildren(ctx, sql.NullInt64{Int64: 9999, Valid: true})
	if err != nil {
		t.Fatalf("ListChildren: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected 0 results for non-existent parent, got %d", len(files))
	}
}
