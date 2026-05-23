package store

import (
	"context"
	"database/sql"
	"errors"
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

	// Insert the managed root folder (no parent) — scanner always creates this first.
	rootID, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data", Name: "data", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert root: %v", err)
	}
	// Insert direct children of root.
	docsID, err := s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: rootID, Valid: true},
		Path:     "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: rootID, Valid: true},
		Path:     "/data/readme.txt", Name: "readme.txt", Size: 512, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert file: %v", err)
	}
	// Insert a grandchild — must NOT appear in the root listing.
	_, err = s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: docsID, Valid: true},
		Path:     "/data/docs/note.txt", Name: "note.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert grandchild: %v", err)
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

func TestGetFile_ReturnsFileByID(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	id, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/foo.txt", Name: "foo.txt", Size: 512,
		ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	f, err := s.GetFile(ctx, id)
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if f.ID != id {
		t.Errorf("expected id %d, got %d", id, f.ID)
	}
	if f.Path != "/data/foo.txt" {
		t.Errorf("expected path /data/foo.txt, got %s", f.Path)
	}
}

func TestGetFile_MissingIDReturnsErrNoRows(t *testing.T) {
	s := openTestStore(t)

	_, err := s.GetFile(context.Background(), 9999)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestDeleteFile_RemovesRecord(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	id, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/foo.txt", Name: "foo.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	if err := s.DeleteFile(ctx, id); err != nil {
		t.Fatalf("DeleteFile: %v", err)
	}

	_, err = s.GetFile(ctx, id)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected record gone (ErrNoRows), got %v", err)
	}
}

// seedTree inserts a small directory tree used by the TopChildren tests:
//
//	/data                (managed root)              size 0   dir
//	├── /data/movies     (8 GiB total via children)  dir
//	│   ├── /data/movies/a.mkv  size 5 GiB
//	│   └── /data/movies/b.mkv  size 3 GiB
//	├── /data/photos     (1 GiB)                     dir
//	│   └── /data/photos/p.jpg  size 1 GiB
//	├── /data/notes.txt  size 1024
//	└── /data/empty      (0 bytes)                   dir
//
// It returns the file ids keyed by their absolute path.
func seedTree(t *testing.T, s *Store) map[string]int64 {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Unix()
	ids := make(map[string]int64)

	upsert := func(parent string, path, name string, size int64, isDir int64) int64 {
		t.Helper()
		var pid sql.NullInt64
		if parent != "" {
			pid = sql.NullInt64{Int64: ids[parent], Valid: true}
		}
		id, err := s.UpsertFile(ctx, UpsertFileParams{
			ParentID: pid, Path: path, Name: name, Size: size, IsDir: isDir,
			ModifiedAt: now, SyncedAt: now,
		})
		if err != nil {
			t.Fatalf("upsert %s: %v", path, err)
		}
		ids[path] = id
		return id
	}

	upsert("", "/data", "data", 0, 1)
	upsert("/data", "/data/movies", "movies", 0, 1)
	upsert("/data/movies", "/data/movies/a.mkv", "a.mkv", 5*1024*1024*1024, 0)
	upsert("/data/movies", "/data/movies/b.mkv", "b.mkv", 3*1024*1024*1024, 0)
	upsert("/data", "/data/photos", "photos", 0, 1)
	upsert("/data/photos", "/data/photos/p.jpg", "p.jpg", 1*1024*1024*1024, 0)
	upsert("/data", "/data/notes.txt", "notes.txt", 1024, 0)
	upsert("/data", "/data/empty", "empty", 0, 1)
	return ids
}

func TestTopChildren_RootReturnsChildrenOfManagedDir(t *testing.T) {
	s := openTestStore(t)
	ids := seedTree(t, s)

	got, err := s.TopChildren(context.Background(), nil)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}

	// Expect 4 direct children of /data ordered by total_bytes DESC then name ASC.
	if len(got) != 4 {
		t.Fatalf("expected 4 rows, got %d (%v)", len(got), got)
	}

	type want struct {
		id    int64
		name  string
		isDir bool
		total int64
	}
	wants := []want{
		{ids["/data/movies"], "movies", true, 8 * 1024 * 1024 * 1024},
		{ids["/data/photos"], "photos", true, 1 * 1024 * 1024 * 1024},
		{ids["/data/notes.txt"], "notes.txt", false, 1024},
		{ids["/data/empty"], "empty", true, 0},
	}
	for i, w := range wants {
		if got[i].ID != w.id || got[i].Name != w.name || got[i].IsDir != w.isDir || got[i].TotalBytes != w.total {
			t.Errorf("row %d: got %+v, want %+v", i, got[i], w)
		}
	}
}

func TestTopChildren_NonRootReturnsChildrenOfParent(t *testing.T) {
	s := openTestStore(t)
	ids := seedTree(t, s)
	moviesID := ids["/data/movies"]

	got, err := s.TopChildren(context.Background(), &moviesID)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}

	// Expect 2 children: a.mkv (5 GiB), b.mkv (3 GiB) — sorted by size DESC.
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d (%v)", len(got), got)
	}
	if got[0].Name != "a.mkv" || got[0].TotalBytes != 5*1024*1024*1024 {
		t.Errorf("row 0: got %+v", got[0])
	}
	if got[1].Name != "b.mkv" || got[1].TotalBytes != 3*1024*1024*1024 {
		t.Errorf("row 1: got %+v", got[1])
	}
}

func TestDeleteFile_CascadesChildren(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	dirID, err := s.UpsertFile(ctx, UpsertFileParams{
		Path: "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	childID, err := s.UpsertFile(ctx, UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/note.txt", Name: "note.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert child: %v", err)
	}

	if err := s.DeleteFile(ctx, dirID); err != nil {
		t.Fatalf("DeleteFile: %v", err)
	}

	_, err = s.GetFile(ctx, childID)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("expected child cascaded (ErrNoRows), got %v", err)
	}
}

func TestTopChildren_NonExistentParentReturnsEmpty(t *testing.T) {
	s := openTestStore(t)
	seedTree(t, s)
	missing := int64(99999)

	got, err := s.TopChildren(context.Background(), &missing)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 rows for non-existent parent, got %d", len(got))
	}
}

func TestTopChildren_ParentWithNoChildrenReturnsEmpty(t *testing.T) {
	s := openTestStore(t)
	ids := seedTree(t, s)
	emptyID := ids["/data/empty"]

	got, err := s.TopChildren(context.Background(), &emptyID)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 rows for empty dir, got %d", len(got))
	}
}

func TestTopChildren_DeepTreeAggregatesAllDescendants(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	// Tree: /root (managed) -> /root/a (dir) -> /root/a/b (dir) -> /root/a/b/c.txt (size 4096)
	rootID, _ := s.UpsertFile(ctx, UpsertFileParams{Path: "/root", Name: "root", IsDir: 1, ModifiedAt: now, SyncedAt: now})
	aID, _ := s.UpsertFile(ctx, UpsertFileParams{ParentID: sql.NullInt64{Int64: rootID, Valid: true}, Path: "/root/a", Name: "a", IsDir: 1, ModifiedAt: now, SyncedAt: now})
	bID, _ := s.UpsertFile(ctx, UpsertFileParams{ParentID: sql.NullInt64{Int64: aID, Valid: true}, Path: "/root/a/b", Name: "b", IsDir: 1, ModifiedAt: now, SyncedAt: now})
	s.UpsertFile(ctx, UpsertFileParams{ParentID: sql.NullInt64{Int64: bID, Valid: true}, Path: "/root/a/b/c.txt", Name: "c.txt", Size: 4096, ModifiedAt: now, SyncedAt: now})

	got, err := s.TopChildren(ctx, nil)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 root child, got %d", len(got))
	}
	if got[0].Name != "a" || got[0].TotalBytes != 4096 {
		t.Errorf("got %+v, want name=a total=4096", got[0])
	}
}

func TestTopChildren_TiesBrokenByNameAsc(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	rootID, _ := s.UpsertFile(ctx, UpsertFileParams{Path: "/root", Name: "root", IsDir: 1, ModifiedAt: now, SyncedAt: now})
	s.UpsertFile(ctx, UpsertFileParams{ParentID: sql.NullInt64{Int64: rootID, Valid: true}, Path: "/root/zebra.txt", Name: "zebra.txt", Size: 100, ModifiedAt: now, SyncedAt: now})
	s.UpsertFile(ctx, UpsertFileParams{ParentID: sql.NullInt64{Int64: rootID, Valid: true}, Path: "/root/apple.txt", Name: "apple.txt", Size: 100, ModifiedAt: now, SyncedAt: now})

	got, err := s.TopChildren(ctx, nil)
	if err != nil {
		t.Fatalf("TopChildren: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d (%v)", len(got), got)
	}
	if got[0].Name != "apple.txt" || got[1].Name != "zebra.txt" {
		t.Errorf("expected alphabetical tiebreak, got [%s, %s]", got[0].Name, got[1].Name)
	}
}
