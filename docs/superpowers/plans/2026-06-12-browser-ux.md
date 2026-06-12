# Browser UX Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the file browser a real file manager — whole-tree search & filters, sortable columns, multi-select with bulk delete, and a touch-target audit.

**Architecture:** The backend extends the existing `GET /api/files` endpoint with search params (`q`, `extension`, `min_size`, `limit`) implemented as a raw-SQL `Store.SearchFiles` (same pattern as `ListChildren` — sqlc can't express dynamic WHERE). The frontend adds a debounced `FileSearchBar` whose active query swaps the folder listing for a flat result list, client-side sort state on the listing, and a selection mode with an action bar that batches the existing single-file DELETE.

**Tech Stack:** Go (net/http, modernc.org/sqlite), React 19 + TanStack Query, Tailwind 4 Aurora utilities (phase 1), lucide-react, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-12-ui-next-level-design.md` (§2 search/filters + sorting/bulk-delete notes, §3 file browser upgrades, §4 error handling/testing)

**Branch:** `feature/browser-ux` (created from merged phase-1 main)

**Working conventions:**
- Backend commands run from `backend/`, frontend from `frontend/`.
- Frontend tests: `npx vitest run <path>`; backend: `go test ./...`.
- TDD for every new unit (test first, watch it fail, implement, watch it pass).
- Preserve all existing roles/aria/test-ids/strings; the suite is the regression net.
- Search-result rows and selection checkboxes must keep ≥44px touch targets (`min-h-11`), matching the existing `hover: none` always-visible pattern.
- Commit messages follow Conventional Commits.

---

### Task 1: Backend — Store.SearchFiles (TDD)

**Files:**
- Modify: `backend/internal/store/store.go`
- Test: `backend/internal/store/search_test.go` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/store/search_test.go`:

```go
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/store/ -run TestSearchFiles -v`
Expected: FAIL — `s.SearchFiles undefined` (compile error).

- [ ] **Step 3: Implement SearchFiles in store.go**

Append to `backend/internal/store/store.go`:

```go
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
		query += ` AND lower(name) LIKE ? ESCAPE '\'`
		args = append(args, "%."+escapeLike(strings.ToLower(p.Extension)))
	}
	if p.MinSize > 0 {
		query += ` AND is_dir = 0 AND size >= ?`
		args = append(args, p.MinSize)
	}
	query += ` ORDER BY is_dir DESC, name ASC LIMIT ?`
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
```

Note: SQLite's `LIKE` is case-insensitive for ASCII by default, which satisfies the case-insensitivity test without `lower()` on the name match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/store/ -run TestSearchFiles -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Full backend suite + commit**

```bash
go test ./...
git add internal/store/store.go internal/store/search_test.go
git commit -m "feat(search): add Store.SearchFiles with name, extension, and size filters"
```

---

### Task 2: Backend — search params on GET /api/files (TDD)

**Files:**
- Modify: `backend/internal/handler/files.go`
- Test: `backend/internal/handler/files_search_test.go` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/handler/files_search_test.go`:

```go
package handler_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/store"
)

// seedHandlerTree builds /data → docs/ → note.txt (100B); /data → big.iso (2GB).
func seedHandlerTree(t *testing.T, s *store.Store) {
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
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: docsID, Valid: true},
		Path:     "/data/docs/note.txt", Name: "note.txt", Size: 100, ModifiedAt: now, SyncedAt: now,
	}); err != nil {
		t.Fatalf("upsert note: %v", err)
	}
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: rootID, Valid: true},
		Path:     "/data/big.iso", Name: "big.iso", Size: 2 << 30, ModifiedAt: now, SyncedAt: now,
	}); err != nil {
		t.Fatalf("upsert iso: %v", err)
	}
}

func TestFilesHandler_SearchFindsNestedFile(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?q=note", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 1 || body[0]["name"] != "note.txt" {
		t.Fatalf("expected [note.txt], got %v", body)
	}
}

func TestFilesHandler_SearchWithFilters(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?extension=iso&min_size=1000000", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 1 || body[0]["name"] != "big.iso" {
		t.Fatalf("expected [big.iso], got %v", body)
	}
}

func TestFilesHandler_SearchRejectsParentIDCombination(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?q=note&parent_id=1", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestFilesHandler_SearchValidatesNumericParams(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewFilesHandler(s)
	for _, target := range []string{
		"/api/files?q=x&min_size=notanumber",
		"/api/files?q=x&min_size=-5",
		"/api/files?q=x&limit=notanumber",
		"/api/files?q=x&limit=0",
		"/api/files?q=x&limit=1000",
	} {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", target, w.Code)
		}
	}
}

func TestFilesHandler_SearchDefaultLimit(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	// No limit param: should succeed with the default (100), not error.
	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?q=.", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/handler/ -run TestFilesHandler_Search -v`
Expected: FAIL — search params are ignored, `?q=note` returns root children (wrong body) and `?q=note&parent_id=1` returns 200.

- [ ] **Step 3: Extend the handler**

In `backend/internal/handler/files.go`, replace `ServeHTTP` with (keep the existing struct, constructor, `fileResponse`, and the 405 branch; the response-mapping loop at the bottom stays identical — factor it as shown):

```go
const (
	searchDefaultLimit = 100
	searchMaxLimit     = 500
)

func (h *FilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("files: encode 405: %v", err)
		}
		return
	}

	q := r.URL.Query()
	isSearch := q.Get("q") != "" || q.Get("extension") != "" || q.Get("min_size") != ""

	var (
		files []store.File
		err   error
	)
	if isSearch {
		if q.Get("parent_id") != "" {
			writeBadRequest(w, "parent_id cannot be combined with search filters")
			return
		}
		params, perr := parseSearchParams(q)
		if perr != nil {
			writeBadRequest(w, perr.Error())
			return
		}
		files, err = h.store.SearchFiles(r.Context(), params)
	} else {
		var parentID sql.NullInt64
		if raw := q.Get("parent_id"); raw != "" {
			id, perr := strconv.ParseInt(raw, 10, 64)
			if perr != nil {
				writeBadRequest(w, "invalid parent_id")
				return
			}
			parentID = sql.NullInt64{Int64: id, Valid: true}
		}
		files, err = h.store.ListChildren(r.Context(), parentID)
	}
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("files: encode 500: %v", err)
		}
		return
	}

	resp := make([]fileResponse, 0, len(files))
	for _, f := range files {
		fr := fileResponse{
			ID:         f.ID,
			Name:       f.Name,
			Path:       f.Path,
			Size:       f.Size,
			IsDir:      f.IsDir != 0,
			ModifiedAt: f.ModifiedAt,
		}
		if f.ParentID.Valid {
			fr.ParentID = &f.ParentID.Int64
		}
		resp = append(resp, fr)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("files: encode response: %v", err)
	}
}

// parseSearchParams validates and converts search query params.
func parseSearchParams(q url.Values) (store.SearchFilesParams, error) {
	params := store.SearchFilesParams{
		Query:     q.Get("q"),
		Extension: q.Get("extension"),
		Limit:     searchDefaultLimit,
	}
	if raw := q.Get("min_size"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 0 {
			return params, errors.New("invalid min_size")
		}
		params.MinSize = n
	}
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 1 || n > searchMaxLimit {
			return params, errors.New("invalid limit")
		}
		params.Limit = n
	}
	return params, nil
}

// writeBadRequest sends a 400 with a JSON error body.
func writeBadRequest(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	if err := json.NewEncoder(w).Encode(errorResponse{Error: msg}); err != nil {
		log.Printf("files: encode 400: %v", err)
	}
}
```

Add `"errors"` and `"net/url"` to the imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/handler/ -v`
Expected: PASS — new search tests AND all pre-existing files handler tests (the parent_id listing path is untouched).

- [ ] **Step 5: Full backend suite + commit**

```bash
go test ./... && go build ./...
git add internal/handler/files.go internal/handler/files_search_test.go
git commit -m "feat(search): extend GET /api/files with q, extension, min_size, limit params"
```

---

### Task 3: Frontend — useDebouncedValue hook (TDD)

**Files:**
- Create: `frontend/src/shared/lib/useDebouncedValue.ts`
- Test: `frontend/src/shared/lib/useDebouncedValue.tests.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/shared/lib/useDebouncedValue.tests.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('only emits the new value after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
  });

  it('restarts the timer on rapid changes', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/useDebouncedValue.tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/shared/lib/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react';

export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/useDebouncedValue.tests.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/
git commit -m "feat(files): add useDebouncedValue hook"
```

---

### Task 4: Frontend — search API + useFileSearch query (TDD)

**Files:**
- Modify: `frontend/src/features/files/api/files.ts`
- Modify: `frontend/src/features/files/queries/queryKeys.ts`
- Create: `frontend/src/features/files/queries/useFileSearch.ts`
- Test: `frontend/src/features/files/queries/useFileSearch.tests.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/files/queries/useFileSearch.tests.tsx` (mirror the provider-wrapper style of the existing `useFiles.tests.tsx` — read it first and reuse its QueryClient wrapper helper):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';
import * as filesApi from '../api/files';

import { useFileSearch } from './useFileSearch';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe('useFileSearch', () => {
  it('is disabled for queries shorter than 2 characters', () => {
    const spy = vi.spyOn(filesApi, 'searchFiles');
    const { result } = renderHook(() => useFileSearch('a'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches results for queries of 2+ characters', async () => {
    const entry: FileEntry = {
      id: 7, parent_id: 2, name: 'note.txt', path: '/data/docs/note.txt',
      size: 100, is_dir: false, modified_at: 1718000000,
    };
    vi.spyOn(filesApi, 'searchFiles').mockResolvedValue([entry]);

    const { result } = renderHook(() => useFileSearch('note'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
    expect(filesApi.searchFiles).toHaveBeenCalledWith({ q: 'note' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/files/queries/useFileSearch.tests.tsx`
Expected: FAIL — `searchFiles` and `useFileSearch` don't exist.

- [ ] **Step 3: Implement**

Append to `frontend/src/features/files/api/files.ts`:

```ts
export interface FileSearchParams {
  q: string;
  extension?: string;
  min_size?: number;
  limit?: number;
}

export const searchFiles = (params: FileSearchParams): Promise<FileEntry[]> => {
  const search = new URLSearchParams({ q: params.q });
  if (params.extension) search.set('extension', params.extension);
  if (params.min_size !== undefined) search.set('min_size', String(params.min_size));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  return apiClient<FileEntry[]>(`/files?${search.toString()}`);
};
```

Update `frontend/src/features/files/queries/queryKeys.ts`:

```ts
export const QueryKeys = {
  FILES: 'files',
  FILE_SEARCH: 'file-search',
} as const;
```

Create `frontend/src/features/files/queries/useFileSearch.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { searchFiles } from '../api/files';
import { QueryKeys } from './queryKeys';

const MIN_QUERY_LENGTH = 2;

export const useFileSearch = (query: string) =>
  useQuery({
    queryKey: [QueryKeys.FILE_SEARCH, query],
    queryFn: () => searchFiles({ q: query }),
    enabled: query.trim().length >= MIN_QUERY_LENGTH,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/files/queries/useFileSearch.tests.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Full frontend suite + commit**

```bash
npx vitest run
git add src/features/files
git commit -m "feat(search): add searchFiles API and useFileSearch query hook"
```

---

### Task 5: Frontend — FileSearchBar + search results in FileBrowserWidget (TDD)

**Files:**
- Create: `frontend/src/features/files/ui/FileSearchBar.tsx`
- Create: `frontend/src/features/files/ui/SearchResultsList.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx`
- Modify: `frontend/src/features/files/index.ts` (only if it re-exports UI components — check first)
- Test: `frontend/src/features/files/ui/FileSearchBar.tests.tsx`
- Test: `frontend/src/features/files/ui/SearchResultsList.tests.tsx`
- Test: `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx` (extend)

- [ ] **Step 1: Write failing tests for the two new components**

Create `frontend/src/features/files/ui/FileSearchBar.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileSearchBar } from './FileSearchBar';

describe('FileSearchBar', () => {
  it('renders the search input with the given value', () => {
    render(<FileSearchBar value="dune" onChange={vi.fn()} />);

    expect(screen.getByRole('searchbox', { name: /search files/i })).toHaveValue('dune');
  });

  it('reports typed input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileSearchBar value="" onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: /search files/i }), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('clears via the clear button, which only shows when there is text', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<FileSearchBar value="" onChange={onChange} />);

    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();

    rerender(<FileSearchBar value="dune" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /clear search/i }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

Create `frontend/src/features/files/ui/SearchResultsList.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '../files.types';

import { SearchResultsList } from './SearchResultsList';

const file = (over: Partial<FileEntry>): FileEntry => ({
  id: 1, parent_id: 2, name: 'note.txt', path: '/data/docs/note.txt',
  size: 100, is_dir: false, modified_at: 1718000000, ...over,
});

describe('SearchResultsList', () => {
  it('shows each result with its containing path', () => {
    render(<SearchResultsList results={[file({})]} onNavigate={vi.fn()} />);

    expect(screen.getByText('note.txt')).toBeInTheDocument();
    expect(screen.getByText('/data/docs')).toBeInTheDocument();
  });

  it('navigates into a directory result by its own id', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchResultsList
        results={[file({ id: 5, name: 'docs', is_dir: true, path: '/data/docs', parent_id: 1 })]}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /docs/i }));

    expect(onNavigate).toHaveBeenCalledWith(5);
  });

  it('navigates to a file result by its parent id', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<SearchResultsList results={[file({ id: 7, parent_id: 3 })]} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /note\.txt/i }));

    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('shows an empty state when there are no results', () => {
    render(<SearchResultsList results={[]} onNavigate={vi.fn()} />);

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/features/files/ui/FileSearchBar.tests.tsx src/features/files/ui/SearchResultsList.tests.tsx` → modules not found.

- [ ] **Step 3: Implement FileSearchBar**

Create `frontend/src/features/files/ui/FileSearchBar.tsx`:

```tsx
import { Search, X } from 'lucide-react';

interface FileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const FileSearchBar = ({ value, onChange }: FileSearchBarProps) => (
  <div className="relative">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
    <input
      type="search"
      role="searchbox"
      aria-label="Search files"
      placeholder="Search all files…"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full box-border pl-9 pr-9 py-2.5 rounded-xl border border-glass bg-surface-hi font-ui text-sm text-ink outline-none focus:border-accent transition-colors [&::-webkit-search-cancel-button]:hidden"
    />
    {value !== '' && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted hover:text-ink transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    )}
  </div>
);
```

- [ ] **Step 4: Implement SearchResultsList**

Create `frontend/src/features/files/ui/SearchResultsList.tsx`:

```tsx
import { FileText, Folder } from 'lucide-react';

import { GlassCard } from '@/shared/ui/GlassCard';

import type { FileEntry } from '../files.types';

interface SearchResultsListProps {
  results: FileEntry[];
  onNavigate: (parentId: number | undefined) => void;
}

const containingPath = (entry: FileEntry): string =>
  entry.path.slice(0, entry.path.length - entry.name.length - 1) || '/';

const formatResultSize = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};

export const SearchResultsList = ({ results, onNavigate }: SearchResultsListProps) => {
  if (results.length === 0) {
    return (
      <GlassCard className="px-6 py-12 text-center">
        <div className="font-ui text-base font-semibold tracking-wide text-muted mb-1.5">
          No matches
        </div>
        <div className="font-ui text-[13px] text-muted">
          Try a different search term.
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      {results.map((entry, i) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onNavigate(entry.is_dir ? entry.id : entry.parent_id ?? undefined)}
          className={
            'flex items-center gap-3 w-full px-3.5 py-2.5 min-h-11 bg-transparent border-none cursor-pointer text-left hover:bg-surface-hi transition-colors' +
            (i > 0 ? ' border-t border-glass' : '')
          }
        >
          <div
            className={
              'w-7 h-7 rounded-lg border border-glass flex items-center justify-center shrink-0 ' +
              (entry.is_dir ? 'bg-surface-hi text-accent' : 'bg-transparent text-muted')
            }
          >
            {entry.is_dir ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-ui text-sm font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
              {entry.name}
            </div>
            <div className="font-data text-[10px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
              {containingPath(entry)}
            </div>
          </div>
          <span className="font-data text-xs font-medium text-muted shrink-0">
            {entry.is_dir ? '—' : formatResultSize(entry.size)}
          </span>
        </button>
      ))}
    </GlassCard>
  );
};
```

Note: `border-t` on a `<button>` requires resetting `border-none` carefully — Tailwind applies the last-wins rule per-property, and `border-none` sets border-style for ALL sides. Use `border-none` only when `i === 0`; for `i > 0`, use `border-0 border-t border-solid border-glass` instead. Adjust the class expression to:

```tsx
className={
  'flex items-center gap-3 w-full px-3.5 py-2.5 min-h-11 bg-transparent cursor-pointer text-left hover:bg-surface-hi transition-colors ' +
  (i > 0 ? 'border-0 border-t border-solid border-glass' : 'border-none')
}
```

- [ ] **Step 5: Run to verify both component test files pass** — `npx vitest run src/features/files/ui/FileSearchBar.tests.tsx src/features/files/ui/SearchResultsList.tests.tsx` → PASS (7 tests).

- [ ] **Step 6: Wire into FileBrowserWidget**

In `frontend/src/features/files/ui/FileBrowserWidget.tsx` (read it first):

- Add imports: `useDebouncedValue` from `@/shared/lib/useDebouncedValue`, `useFileSearch` from `../queries/useFileSearch`, `FileSearchBar` from `./FileSearchBar`, `SearchResultsList` from `./SearchResultsList`.
- Add state: `const [searchInput, setSearchInput] = useState('');` and `const debouncedQuery = useDebouncedValue(searchInput, 300);`
- Add query: `const search = useFileSearch(debouncedQuery);` and `const isSearching = debouncedQuery.trim().length >= 2;`
- Render `<FileSearchBar value={searchInput} onChange={setSearchInput} />` directly under the section-label div ("Files"), above the breadcrumb.
- When `isSearching`: hide the breadcrumb nav and the folder GlassCard list, and instead render:
  - `search.isLoading` → the existing `FileSkeleton`
  - `search.isError` → `<WidgetError message="Search failed. Is the API running?" onRetry={() => search.refetch()} />`
  - otherwise → `<SearchResultsList results={search.data ?? []} onNavigate={handleSearchNavigate} />`
- Add handler (navigates to the containing folder and clears the search):

```tsx
const handleSearchNavigate = (parentId: number | undefined) => {
  setSearchInput('');
  navigate({ to: '/files', search: { parent_id: parentId } });
};
```

(Note: after navigation the breadcrumb stack resets through the existing `parent_id` effect for the root case; for a non-root parent the existing `effectiveStack` inference handles display, exactly as when deep-linking. No new breadcrumb logic.)

- [ ] **Step 7: Extend FileBrowserWidget tests**

Add to `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx` (follow the file's existing mock pattern; mock `../queries/useFileSearch` alongside the existing `useFiles` mock — default mock return: `{ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }` so existing tests are unaffected):

```tsx
it('shows search results instead of the folder listing while searching', async () => {
  // arrange: useFiles returns a folder listing; useFileSearch returns one hit
  // act: type "note" into the searchbox (advance debounce with fake timers OR
  //      mock useDebouncedValue — prefer vi.useFakeTimers + act(advanceTimersByTime(300)))
  // assert: searched file name visible; breadcrumb nav (role="navigation") absent
});

it('clearing the search returns to the folder listing', async () => {
  // type a query, clear via the clear button, assert folder entries are back
});
```

Write these as real tests, not comments — the comments above describe arrange/act/assert; implement them with this file's existing helpers. If fake timers fight `userEvent`, configure `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

- [ ] **Step 8: Full suite + build + commit**

```bash
npx vitest run && npm run build
git add src/features/files src/shared/lib
git commit -m "feat(search): add file search bar with flat results view in browser"
```

---

### Task 6: Frontend — sortable columns (TDD)

**Files:**
- Create: `frontend/src/features/files/lib/sortEntries.ts`
- Create: `frontend/src/features/files/ui/SortHeader.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx`
- Test: `frontend/src/features/files/lib/sortEntries.tests.ts`
- Test: `frontend/src/features/files/ui/SortHeader.tests.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/features/files/lib/sortEntries.tests.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { FileEntry } from '../files.types';

import { sortEntries } from './sortEntries';
import type { SortState } from './sortEntries';

const entry = (over: Partial<FileEntry>): FileEntry => ({
  id: 1, parent_id: null, name: 'x', path: '/x', size: 0,
  is_dir: false, modified_at: 0, ...over,
});

const byName = (s: SortState) =>
  sortEntries(
    [
      entry({ id: 1, name: 'beta.txt', size: 50, modified_at: 30 }),
      entry({ id: 2, name: 'docs', is_dir: true, modified_at: 10 }),
      entry({ id: 3, name: 'alpha.txt', size: 200, modified_at: 20 }),
      entry({ id: 4, name: 'archive', is_dir: true, modified_at: 40 }),
    ],
    s,
  ).map(e => e.name);

describe('sortEntries', () => {
  it('keeps directories first regardless of sort key', () => {
    expect(byName({ key: 'name', dir: 'asc' })).toEqual(['archive', 'docs', 'alpha.txt', 'beta.txt']);
    expect(byName({ key: 'size', dir: 'desc' })).toEqual(['archive', 'docs', 'alpha.txt', 'beta.txt']);
  });

  it('sorts by name descending within groups', () => {
    expect(byName({ key: 'name', dir: 'desc' })).toEqual(['docs', 'archive', 'beta.txt', 'alpha.txt']);
  });

  it('sorts by modified date', () => {
    expect(byName({ key: 'modified', dir: 'asc' })).toEqual(['docs', 'archive', 'alpha.txt', 'beta.txt']);
  });

  it('does not mutate the input array', () => {
    const input = [entry({ id: 1, name: 'b' }), entry({ id: 2, name: 'a' })];
    sortEntries(input, { key: 'name', dir: 'asc' });
    expect(input.map(e => e.name)).toEqual(['b', 'a']);
  });
});
```

Create `frontend/src/features/files/ui/SortHeader.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortHeader } from './SortHeader';

describe('SortHeader', () => {
  it('marks the active column with the sort direction', () => {
    render(<SortHeader sort={{ key: 'size', dir: 'desc' }} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /size/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button', { name: /name/i })).not.toHaveAttribute('aria-sort');
  });

  it('clicking the active column flips direction; clicking another column selects it ascending', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SortHeader sort={{ key: 'name', dir: 'asc' }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(onChange).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });

    await user.click(screen.getByRole('button', { name: /modified/i }));
    expect(onChange).toHaveBeenCalledWith({ key: 'modified', dir: 'asc' });
  });
});
```

- [ ] **Step 2: Run to verify they fail** — modules not found.

- [ ] **Step 3: Implement sortEntries**

Create `frontend/src/features/files/lib/sortEntries.ts`:

```ts
import type { FileEntry } from '../files.types';

export type SortKey = 'name' | 'size' | 'modified';
export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' };

const compareBy = (key: SortKey, a: FileEntry, b: FileEntry): number => {
  switch (key) {
    case 'size':
      return a.size - b.size;
    case 'modified':
      return a.modified_at - b.modified_at;
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }
};

// Directories always sort before files (standard file-manager behavior);
// the chosen key and direction apply within each group.
export const sortEntries = (entries: FileEntry[], sort: SortState): FileEntry[] =>
  [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    const cmp = compareBy(sort.key, a, b);
    return sort.dir === 'asc' ? cmp : -cmp;
  });
```

- [ ] **Step 4: Implement SortHeader**

Create `frontend/src/features/files/ui/SortHeader.tsx`:

```tsx
import { ArrowDown, ArrowUp } from 'lucide-react';

import type { SortKey, SortState } from '../lib/sortEntries';

interface SortHeaderProps {
  sort: SortState;
  onChange: (sort: SortState) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Modified' },
];

export const SortHeader = ({ sort, onChange }: SortHeaderProps) => (
  <div className="flex gap-1.5" role="group" aria-label="Sort files">
    {COLUMNS.map(({ key, label }) => {
      const isActive = sort.key === key;
      const next: SortState = isActive
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' };
      return (
        <button
          key={key}
          type="button"
          aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
          onClick={() => onChange(next)}
          className={
            'flex items-center gap-1 px-3 py-1.5 min-h-8 rounded-full border font-ui text-xs font-semibold cursor-pointer transition-colors ' +
            (isActive
              ? 'bg-surface-hi text-accent border-glass'
              : 'bg-transparent text-muted border-transparent hover:text-ink')
          }
        >
          {label}
          {isActive && (sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
        </button>
      );
    })}
  </div>
);
```

(`aria-sort` on buttons rather than table headers is a pragmatic choice — this list is not a `<table>`; the tests pin the contract.)

- [ ] **Step 5: Run to verify they pass** — `npx vitest run src/features/files/lib src/features/files/ui/SortHeader.tests.tsx` → PASS (6 tests).

- [ ] **Step 6: Wire into FileBrowserWidget**

- Add state: `const [sort, setSort] = useState<SortState>(DEFAULT_SORT);` (import `DEFAULT_SORT`, `SortState`, `sortEntries` from `../lib/sortEntries`, `SortHeader` from `./SortHeader`).
- Compute `const sortedData = sortEntries(data, sort);` after the early returns, and render rows from `sortedData` instead of `data` (the item-count span keeps using `data.length`).
- Render `<SortHeader sort={sort} onChange={setSort} />` between the breadcrumb nav and the listing GlassCard (browse mode only — hidden while searching).

- [ ] **Step 7: Full suite + build + commit**

```bash
npx vitest run && npm run build
git add src/features/files
git commit -m "feat(files): add client-side column sorting to the browser"
```

---

### Task 7: Frontend — generalize DeleteConfirmDialog

**Files:**
- Modify: `frontend/src/features/files/ui/DeleteConfirmDialog.tsx`
- Modify: `frontend/src/features/files/ui/DeleteConfirmDialog.tests.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx` (call site)

The dialog currently takes `entry: FileEntry` and hardcodes "Delete file?" — bulk delete needs the same dialog with different copy.

- [ ] **Step 1: Update the dialog's contract**

In `DeleteConfirmDialog.tsx`, replace the props and header/body usage (keep portal, Escape guard, spinner, button structure EXACTLY as they are):

```tsx
import type { ReactNode } from 'react';

interface DeleteConfirmDialogProps {
  title: string;
  description: ReactNode;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

- Remove the `FileEntry` import.
- `<h2 ...>{title}</h2>` and `<p ...>{description}</p>` replace the hardcoded strings.

- [ ] **Step 2: Update the single-delete call site**

In `FileBrowserWidget.tsx`:

```tsx
{pendingDelete && (
  <DeleteConfirmDialog
    title="Delete file?"
    description={
      <>
        <strong className="text-ink font-medium">{pendingDelete.name}</strong>
        {' '}will be permanently removed. This cannot be undone.
      </>
    }
    isPending={isDeleting}
    onConfirm={handleConfirmDelete}
    onCancel={() => setPendingDelete(null)}
  />
)}
```

- [ ] **Step 3: Update the dialog tests**

In `DeleteConfirmDialog.tests.tsx`, replace `entry={...}` props with `title="Delete file?" description={...}` equivalents, keeping every behavioral assertion (Escape, pending state, confirm/cancel callbacks) unchanged. The rendered text the tests assert stays the same.

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run src/features/files && npm run build
git add src/features/files
git commit -m "refactor(files): generalize DeleteConfirmDialog for arbitrary copy"
```

---

### Task 8: Frontend — multi-select + bulk delete (TDD)

**Files:**
- Create: `frontend/src/features/files/queries/useBulkDeleteFiles.ts`
- Create: `frontend/src/features/files/ui/SelectionBar.tsx`
- Modify: `frontend/src/features/files/ui/FileRow.tsx`
- Modify: `frontend/src/features/files/ui/FileBrowserWidget.tsx`
- Test: `frontend/src/features/files/queries/useBulkDeleteFiles.tests.tsx`
- Test: `frontend/src/features/files/ui/SelectionBar.tests.tsx`
- Test: `frontend/src/features/files/ui/FileBrowserWidget.tests.tsx` (extend)

- [ ] **Step 1: Write the failing bulk-mutation test**

Create `frontend/src/features/files/queries/useBulkDeleteFiles.tests.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as filesApi from '../api/files';

import { useBulkDeleteFiles } from './useBulkDeleteFiles';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe('useBulkDeleteFiles', () => {
  it('deletes every id and reports no failures', async () => {
    const spy = vi.spyOn(filesApi, 'deleteFile').mockResolvedValue(undefined);
    const { result } = renderHook(() => useBulkDeleteFiles(undefined), { wrapper });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual({ failedIds: [] });
  });

  it('reports which ids failed without rejecting the mutation', async () => {
    vi.spyOn(filesApi, 'deleteFile').mockImplementation(id =>
      id === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );
    const { result } = renderHook(() => useBulkDeleteFiles(undefined), { wrapper });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ failedIds: [2] });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement the bulk mutation**

Create `frontend/src/features/files/queries/useBulkDeleteFiles.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteFile } from '../api/files';
import { QueryKeys } from './queryKeys';

export interface BulkDeleteResult {
  failedIds: number[];
}

// Deletes each id via the existing single-file endpoint. Partial failures
// resolve (not reject) so the UI can keep failed rows selected.
export const useBulkDeleteFiles = (parentId: number | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]): Promise<BulkDeleteResult> => {
      const outcomes = await Promise.allSettled(ids.map(id => deleteFile(id)));
      const failedIds = ids.filter((_, i) => outcomes[i].status === 'rejected');
      return { failedIds };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.FILES, parentId] });
    },
  });
};
```

- [ ] **Step 4: Write the failing SelectionBar test**

Create `frontend/src/features/files/ui/SelectionBar.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectionBar } from './SelectionBar';

describe('SelectionBar', () => {
  it('shows the selection count and disables delete at zero', () => {
    render(<SelectionBar count={0} onDelete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/0 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
  });

  it('fires onDelete and onCancel', async () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<SelectionBar count={2} onDelete={onDelete} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    await user.click(screen.getByRole('button', { name: /cancel selection/i }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Implement SelectionBar**

Create `frontend/src/features/files/ui/SelectionBar.tsx`:

```tsx
import { Trash2, X } from 'lucide-react';

interface SelectionBarProps {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
}

export const SelectionBar = ({ count, onDelete, onCancel }: SelectionBarProps) => (
  <div className="glass-card flex items-center justify-between px-4 py-2">
    <span className="font-ui text-sm font-medium text-ink">
      {count} selected
    </span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Delete selected"
        disabled={count === 0}
        onClick={onDelete}
        className="flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-full font-ui text-[13px] font-semibold bg-danger text-white border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <Trash2 size={13} aria-hidden />
        Delete
      </button>
      <button
        type="button"
        aria-label="Cancel selection"
        onClick={onCancel}
        className="w-11 h-11 flex items-center justify-center rounded-full border border-glass bg-surface-hi text-muted hover:text-ink border-solid cursor-pointer transition-colors"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  </div>
);
```

- [ ] **Step 6: Run to verify Steps 1+4 tests pass** — `npx vitest run src/features/files/queries/useBulkDeleteFiles.tests.tsx src/features/files/ui/SelectionBar.tests.tsx` → PASS (4 tests).

- [ ] **Step 7: Add selection support to FileRow**

In `FileRow.tsx`, extend the non-parent variant's props (the parent variant never selects):

```tsx
  | { isParent?: false; entry: FileEntry; onClick: (entry: FileEntry) => void; onParentClick?: never; onDelete: (entry: FileEntry) => void; index?: number; isLast?: boolean; selectable?: boolean; selected?: boolean; onToggleSelect?: (entry: FileEntry) => void }
```

And in the non-parent render path:

- When `selectable`, render a leading checkbox button BEFORE the icon box:

```tsx
{selectable && (
  <button
    type="button"
    role="checkbox"
    aria-checked={selected}
    aria-label={`Select ${entry.name}`}
    onClick={(e) => { e.stopPropagation(); onToggleSelect?.(entry); }}
    className="w-11 h-11 -ml-2 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted shrink-0"
  >
    {selected ? <CheckSquare size={18} className="text-accent" aria-hidden /> : <Square size={18} aria-hidden />}
  </button>
)}
```

(add `CheckSquare, Square` to the lucide import)

- When `selectable`, row clicks toggle selection instead of navigating/menu: the directory button's `onClick` becomes `() => (selectable ? onToggleSelect?.(entry) : onClick(entry))`; for files, wrap the icon+name block in the same kind of toggle handling — simplest: when `selectable`, render BOTH dirs and files through the button branch with the toggle handler. The kebab menu button is hidden while `selectable` (`{!selectable && <div ref={menuRef} ...>}`).
- When `selected`, add `bg-surface-hi` to the row container class.

- [ ] **Step 8: Wire selection mode into FileBrowserWidget**

- State: `const [selecting, setSelecting] = useState(false);` `const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());` `const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);` `const [bulkError, setBulkError] = useState<string | null>(null);`
- Mutation: `const bulkDelete = useBulkDeleteFiles(parent_id);`
- A "Select" toggle button rendered next to `<SortHeader>` (browse mode only):

```tsx
<button
  type="button"
  aria-pressed={selecting}
  onClick={() => { setSelecting(s => !s); setSelectedIds(new Set()); setBulkError(null); }}
  className={
    'px-3 py-1.5 min-h-8 rounded-full border font-ui text-xs font-semibold cursor-pointer transition-colors ' +
    (selecting ? 'bg-surface-hi text-accent border-glass' : 'bg-transparent text-muted border-transparent hover:text-ink')
  }
>
  Select
</button>
```

- Toggle handler:

```tsx
const handleToggleSelect = (entry: FileEntry) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(entry.id)) {
      next.delete(entry.id);
    } else {
      next.add(entry.id);
    }
    return next;
  });
};
```

- Render `<SelectionBar count={selectedIds.size} onDelete={() => setBulkConfirmOpen(true)} onCancel={() => { setSelecting(false); setSelectedIds(new Set()); setBulkError(null); }} />` between the sort header and the listing while `selecting`.
- Pass `selectable={selecting}`, `selected={selectedIds.has(entry.id)}`, `onToggleSelect={handleToggleSelect}` to each non-parent `FileRow`.
- Bulk confirm dialog (rendered while `bulkConfirmOpen`):

```tsx
<DeleteConfirmDialog
  title={`Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`}
  description="The selected items will be permanently removed. This cannot be undone."
  isPending={bulkDelete.isPending}
  onConfirm={handleBulkDelete}
  onCancel={() => setBulkConfirmOpen(false)}
/>
```

- Bulk delete handler (partial-failure handling per spec — failed ids stay selected with an inline error):

```tsx
const handleBulkDelete = () => {
  bulkDelete.mutate([...selectedIds], {
    onSuccess: ({ failedIds }) => {
      setBulkConfirmOpen(false);
      if (failedIds.length === 0) {
        setSelecting(false);
        setSelectedIds(new Set());
        setBulkError(null);
        return;
      }
      setSelectedIds(new Set(failedIds));
      setBulkError(`Failed to delete ${failedIds.length} item${failedIds.length === 1 ? '' : 's'}.`);
    },
  });
};
```

- Inline error (under the SelectionBar): `{bulkError && <div className="font-ui text-[13px] text-danger">{bulkError}</div>}`

- [ ] **Step 9: Extend FileBrowserWidget tests**

Add to `FileBrowserWidget.tests.tsx` (mock `../queries/useBulkDeleteFiles` following the file's established hook-mock pattern; default `{ mutate: vi.fn(), isPending: false }`):

- `entering selection mode shows checkboxes and the selection bar` — click "Select", assert `role="checkbox"` elements appear and "0 selected" is shown.
- `bulk delete flows through confirm dialog and clears selection on full success` — select two rows, click Delete selected, confirm in dialog; the mocked mutate's `onSuccess` callback should be invoked manually in the mock (`mutate: vi.fn((ids, opts) => opts?.onSuccess?.({ failedIds: [] }))`); assert selection bar disappears.
- `partial failure keeps failed rows selected with an error message` — same flow with `failedIds: [2]`; assert "1 selected" remains and the error text `/failed to delete 1 item/i` shows.

Write them fully, following the file's existing render helpers and mocks.

- [ ] **Step 10: Full suite + build + commit**

```bash
npx vitest run && npm run build
git add src/features/files
git commit -m "feat(files): add multi-select with bulk delete and partial-failure handling"
```

---

### Task 9: Touch audit + final verification

**Files:**
- Possibly minor class tweaks in files touched above

- [ ] **Step 1: Touch-target audit**

Verify every NEW interactive element has ≥44px effective touch target (`min-h-11`/`w-11 h-11` or equivalent): search input (py-2.5 + text ≈ 42px → bump to `py-3` if measured under 44), clear button (w-8 h-8 inside a 44px input — acceptable as inset control, but bump to `w-9 h-9` if trivial), sort pills (`min-h-8` — intentionally compact, acceptable as secondary controls; document), checkbox buttons (w-11 h-11 ✓), SelectionBar buttons (min-h-11 ✓). Apply any bumps as small class edits.

- [ ] **Step 2: Mobile spot-check**

```bash
npm run dev
```

At 375px viewport (devtools): search bar, sort pills, and selection bar must not overflow `max-w-md`; selection checkboxes tappable; search-result paths truncate with ellipsis rather than wrapping.

- [ ] **Step 3: Full verification**

```bash
npx vitest run
npm run lint     # zero NEW errors vs main (pre-existing debt out of scope)
npm run build
cd ../backend && go test ./... && go build ./...
```

- [ ] **Step 4: Commit any audit tweaks**

```bash
git add -A frontend/src
git commit -m "style(files): touch-target tweaks from mobile audit"
```

(Skip the commit if the audit produced no changes.)

---

## Out of scope (phase 3)

- Space-map treemap (`GET /api/directories/{id}/usage` + recharts Treemap + `useThemeTokens` helper), file-type breakdown, sync activity feed (scanner diff + `changes` table), removal of the backend top-files endpoint (`handler/top_files.go`, `TopChildren`/`TopRootChildren` queries).
