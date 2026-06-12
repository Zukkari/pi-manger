package store_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"pi-manager/internal/store"
)

func openSearchStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// seedSearchTree builds: /data (root) → docs/ → note.txt (100B), movie.mkv (5GB);
// /data → big.iso (2GB)
func seedSearchTree(t *testing.T, s *store.Store) {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Unix()

	rootID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		Path: "/data", Name: "data", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert root: %v", err)
	}
	docsID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: rootID, Valid: true},
		Path:     "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert docs: %v", err)
	}
	seeds := []store.UpsertFileParams{
		{ParentID: sql.NullInt64{Int64: docsID, Valid: true}, Path: "/data/docs/note.txt", Name: "note.txt", Size: 100, ModifiedAt: now, SyncedAt: now},
		{ParentID: sql.NullInt64{Int64: docsID, Valid: true}, Path: "/data/docs/movie.mkv", Name: "movie.mkv", Size: 5 << 30, ModifiedAt: now, SyncedAt: now},
		{ParentID: sql.NullInt64{Int64: rootID, Valid: true}, Path: "/data/big.iso", Name: "big.iso", Size: 2 << 30, ModifiedAt: now, SyncedAt: now},
	}
	for _, p := range seeds {
		if _, err := s.UpsertFile(ctx, p); err != nil {
			t.Fatalf("upsert %s: %v", p.Path, err)
		}
	}
}

func TestSearchFiles_MatchesNameSubstringAcrossTree(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: "note", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 1 || got[0].Name != "note.txt" {
		t.Fatalf("expected [note.txt], got %+v", got)
	}
}

func TestSearchFiles_MatchIsCaseInsensitive(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: "NOTE", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 1 || got[0].Name != "note.txt" {
		t.Fatalf("expected [note.txt], got %+v", got)
	}
}

func TestSearchFiles_ExcludesManagedRootRow(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	// "da" matches the root row name "data"; the root row itself must be hidden.
	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: "data", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	for _, f := range got {
		if f.Path == "/data" {
			t.Fatalf("managed root row leaked into results: %+v", got)
		}
	}
}

func TestSearchFiles_EscapesLikeWildcards(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	// "%" must be treated literally, not as match-everything.
	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: "%", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no matches for literal %%, got %d", len(got))
	}
}

func TestSearchFiles_ExtensionFilter(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Extension: "mkv", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 1 || got[0].Name != "movie.mkv" {
		t.Fatalf("expected [movie.mkv], got %+v", got)
	}
}

func TestSearchFiles_MinSizeFilterExcludesDirectories(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{MinSize: 1 << 30, Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 large files, got %+v", got)
	}
	for _, f := range got {
		if f.IsDir != 0 {
			t.Fatalf("directory leaked into min_size results: %+v", f)
		}
	}
}

func TestSearchFiles_EscapesUnderscoreWildcard(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	// "_" must match literally (LIKE would otherwise treat it as any-single-char).
	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: "note_", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no matches for literal underscore, got %+v", got)
	}
}

func TestSearchFiles_ExtensionFilterExcludesDirectories(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	ctx := context.Background()
	now := time.Now().Unix()

	// Seed a directory whose name ends in .mkv — it must not appear in extension results.
	docsID := int64(0)
	rows, err := s.SearchFiles(ctx, store.SearchFilesParams{Query: "docs", Limit: 1})
	if err != nil {
		t.Fatalf("lookup docs: %v", err)
	}
	if len(rows) == 1 {
		docsID = rows[0].ID
	}
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID:   sql.NullInt64{Int64: docsID, Valid: docsID != 0},
		Path:       "/data/docs/season.mkv",
		Name:       "season.mkv",
		IsDir:      1,
		ModifiedAt: now,
		SyncedAt:   now,
	}); err != nil {
		t.Fatalf("upsert dir season.mkv: %v", err)
	}

	got, err := s.SearchFiles(ctx, store.SearchFilesParams{Extension: "mkv", Limit: 100})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 1 || got[0].Name != "movie.mkv" {
		t.Fatalf("expected only [movie.mkv], got %+v", got)
	}
}

func TestSearchFiles_LimitCapsResults(t *testing.T) {
	s := openSearchStore(t)
	seedSearchTree(t, s)

	got, err := s.SearchFiles(context.Background(), store.SearchFilesParams{Query: ".", Limit: 2})
	if err != nil {
		t.Fatalf("SearchFiles: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected limit of 2, got %d", len(got))
	}
}
