# Largest Files Pie Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard pie-chart widget that shows where disk space is going under `MANAGED_DIR`, with click-to-drill-down by folder.

**Architecture:** A new Go endpoint `GET /api/files/top` powered by a recursive SQLite CTE returns the top-N children (by total descendant file size) for a given parent plus an aggregated `other_bytes`. A new `features/largest-files/` React module renders the response with Recharts and owns drill-down navigation in local component state.

**Tech Stack:** Go 1.x + sqlc + modernc.org/sqlite (backend), React 19 + Recharts ^3.8.1 + TanStack Query (frontend), Vitest + @testing-library/react (frontend tests), standard `testing` package (backend tests).

**Reference spec:** [`docs/superpowers/specs/2026-05-23-largest-files-pie-chart-design.md`](../specs/2026-05-23-largest-files-pie-chart-design.md). Read the spec end-to-end before starting — every task assumes the design decisions there.

**Key project conventions (do not violate):**
- Go errors from handlers serialize as `{"error":"<msg>"}` via the package-local `errorResponse` type (see `backend/internal/handler/disk.go:30`). This intentionally diverges from the global CLAUDE.md preference for RFC 7807; matching the existing handlers wins.
- The scanner stores the managed-dir root as the only row with `parent_id IS NULL`. "Root" listings mean **children of that row**, mirroring `store.ListChildren` (`backend/internal/store/store.go:77-106`).
- Frontend uses **named exports only** (never `export default`).
- Each frontend widget handles its own loading / error / empty states — never let one failure bring down a peer.
- sqlc is run from `backend/internal/store/` (where `sqlc.yaml` lives), not from `backend/`.

**Commit message style:** Conventional Commits, observed in `git log --oneline -10` — examples: `fix(ui): …`, `feat(api): …`, `docs: …`. Match the prefix to the change.

---

## Task 1: Add `TopChildren` store method (SQL + wrapper)

**Files:**
- Modify: `backend/internal/store/query.sql`
- Modify (regenerate): `backend/internal/store/query.sql.go`
- Modify: `backend/internal/store/store.go`
- Modify: `backend/internal/store/store_test.go`

### Steps

- [ ] **Step 1: Write the failing tests (happy paths)**

Append to `backend/internal/store/store_test.go`. These exercise both the root-children case and the drill-down case using a small fixture tree.

```go
// --- fixture helper (place above the new tests) ---

// seedTree inserts a small directory tree used by the TopChildren tests:
//   /data                (managed root)              size 0   dir
//   ├── /data/movies     (8 GiB total via children)  dir
//   │   ├── /data/movies/a.mkv  size 5 GiB
//   │   └── /data/movies/b.mkv  size 3 GiB
//   ├── /data/photos     (1 GiB)                     dir
//   │   └── /data/photos/p.jpg  size 1 GiB
//   ├── /data/notes.txt  size 1024
//   └── /data/empty      (0 bytes)                   dir
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/store/ -run TestTopChildren -v
```

Expected: compile error — `s.TopChildren undefined` and `TotalBytes` field unknown. That's the "red" state.

- [ ] **Step 3: Add the SQL queries**

Append to `backend/internal/store/query.sql`:

```sql
-- name: TopChildren :many
WITH RECURSIVE descendants(seed_id, id, size, is_dir) AS (
    SELECT id, id, size, is_dir FROM files WHERE parent_id = ?
    UNION ALL
    SELECT d.seed_id, f.id, f.size, f.is_dir
    FROM files f JOIN descendants d ON f.parent_id = d.id
)
SELECT
    f.id, f.name, f.is_dir,
    COALESCE(SUM(CASE WHEN d.is_dir = 0 THEN d.size ELSE 0 END), 0) AS total_bytes
FROM descendants d
JOIN files f ON f.id = d.seed_id
GROUP BY f.id, f.name, f.is_dir
ORDER BY total_bytes DESC, f.name ASC;

-- name: TopRootChildren :many
WITH RECURSIVE descendants(seed_id, id, size, is_dir) AS (
    SELECT id, id, size, is_dir
    FROM files
    WHERE parent_id = (SELECT id FROM files WHERE parent_id IS NULL LIMIT 1)
    UNION ALL
    SELECT d.seed_id, f.id, f.size, f.is_dir
    FROM files f JOIN descendants d ON f.parent_id = d.id
)
SELECT
    f.id, f.name, f.is_dir,
    COALESCE(SUM(CASE WHEN d.is_dir = 0 THEN d.size ELSE 0 END), 0) AS total_bytes
FROM descendants d
JOIN files f ON f.id = d.seed_id
GROUP BY f.id, f.name, f.is_dir
ORDER BY total_bytes DESC, f.name ASC;
```

- [ ] **Step 4: Regenerate the sqlc Go code**

```bash
cd backend/internal/store && sqlc generate
```

This rewrites `query.sql.go` to include `TopChildren`, `TopRootChildren`, and a generated `TopChildrenRow` struct (sqlc name) with fields `ID`, `Name`, `IsDir`, `TotalBytes`.

If sqlc reports a parse error, double-check the SQL was appended cleanly (no missing semicolons / mangled CTE).

- [ ] **Step 5: Add the Go wrapper that picks the right query**

Insert into `backend/internal/store/store.go`, after `ListChildren` and before `GetFile`:

```go
// TopChild is a direct child of a parent annotated with the total bytes of
// every file descended from it (the child's own size if it is a file,
// or the recursive sum of all descendant file sizes if it is a directory).
type TopChild struct {
	ID         int64
	Name       string
	IsDir      bool
	TotalBytes int64
}

// TopChildren returns the direct children of the given parent annotated with
// their total descendant file size. Pass nil for parentID to list the children
// of the managed-dir row (the user-facing "root"). Results are ordered by
// total_bytes DESC, then name ASC.
func (s *Store) TopChildren(ctx context.Context, parentID *int64) ([]TopChild, error) {
	if parentID == nil {
		rows, err := s.queries.TopRootChildren(ctx)
		if err != nil {
			return nil, err
		}
		out := make([]TopChild, 0, len(rows))
		for _, r := range rows {
			out = append(out, TopChild{ID: r.ID, Name: r.Name, IsDir: r.IsDir != 0, TotalBytes: r.TotalBytes})
		}
		return out, nil
	}
	rows, err := s.queries.TopChildren(ctx, sql.NullInt64{Int64: *parentID, Valid: true})
	if err != nil {
		return nil, err
	}
	out := make([]TopChild, 0, len(rows))
	for _, r := range rows {
		out = append(out, TopChild{ID: r.ID, Name: r.Name, IsDir: r.IsDir != 0, TotalBytes: r.TotalBytes})
	}
	return out, nil
}
```

Note: the sqlc-generated `TopChildren` query takes `interface{}`/`sql.NullInt64` for the `parent_id = ?` placeholder depending on sqlc's inference. If the generated signature is `TopChildren(ctx, parentID int64)`, drop `sql.NullInt64{...}` and pass `*parentID`. If it generates `interface{}`, pass `sql.NullInt64{Int64: *parentID, Valid: true}`. Inspect the generated function before wiring.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && go test ./internal/store/ -run TestTopChildren -v
```

Expected: PASS for both `TestTopChildren_RootReturnsChildrenOfManagedDir` and `TestTopChildren_NonRootReturnsChildrenOfParent`.

- [ ] **Step 7: Run the whole store package to confirm no regression**

```bash
cd backend && go test ./internal/store/...
```

Expected: PASS for all tests including the pre-existing ones.

- [ ] **Step 8: Commit**

```bash
cd backend && git add internal/store/query.sql internal/store/query.sql.go internal/store/store.go internal/store/store_test.go
git commit -m "feat(store): add TopChildren with recursive descendant size"
```

---

## Task 2: Cover `TopChildren` edge cases

**Files:**
- Modify: `backend/internal/store/store_test.go`

### Steps

- [ ] **Step 1: Add failing edge-case tests**

Append to `backend/internal/store/store_test.go`:

```go
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
		t.Fatalf("expected 2 rows, got %d", len(got))
	}
	if got[0].Name != "apple.txt" || got[1].Name != "zebra.txt" {
		t.Errorf("expected alphabetical tiebreak, got [%s, %s]", got[0].Name, got[1].Name)
	}
}
```

- [ ] **Step 2: Run the new tests**

```bash
cd backend && go test ./internal/store/ -run TestTopChildren -v
```

Expected: PASS for all four new tests with no code changes — the SQL already handles these correctly. If any fail, investigate the SQL before "fixing" the test.

- [ ] **Step 3: Commit**

```bash
cd backend && git add internal/store/store_test.go
git commit -m "test(store): cover TopChildren edge cases"
```

---

## Task 3: Add `GET /api/files/top` handler

**Files:**
- Create: `backend/internal/handler/top_files.go`
- Create: `backend/internal/handler/top_files_test.go`
- Modify: `backend/cmd/api/main.go`

### Steps

- [ ] **Step 1: Write failing handler tests**

Create `backend/internal/handler/top_files_test.go`:

```go
package handler_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/store"
)

// seedHandlerTree mirrors the store fixture: a managed root with several
// children of varied sizes so the handler can return a realistic response.
func seedHandlerTree(t *testing.T, s *store.Store) map[string]int64 {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Unix()
	ids := make(map[string]int64)

	upsert := func(parent, path, name string, size int64, isDir int64) int64 {
		t.Helper()
		var pid sql.NullInt64
		if parent != "" {
			pid = sql.NullInt64{Int64: ids[parent], Valid: true}
		}
		id, err := s.UpsertFile(ctx, store.UpsertFileParams{
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
	upsert("/data", "/data/photos", "photos", 0, 1)
	upsert("/data/photos", "/data/photos/p.jpg", "p.jpg", 1*1024*1024*1024, 0)
	upsert("/data", "/data/extra1", "extra1", 0, 1)
	upsert("/data/extra1", "/data/extra1/f.bin", "f.bin", 500*1024*1024, 0)
	upsert("/data", "/data/extra2", "extra2", 0, 1)
	upsert("/data/extra2", "/data/extra2/f.bin", "f.bin", 400*1024*1024, 0)
	upsert("/data", "/data/extra3", "extra3", 0, 1)
	upsert("/data/extra3", "/data/extra3/f.bin", "f.bin", 300*1024*1024, 0)
	upsert("/data", "/data/extra4", "extra4", 0, 1)
	upsert("/data/extra4", "/data/extra4/f.bin", "f.bin", 200*1024*1024, 0)
	return ids
}

func TestTopFilesHandler_RootReturnsTop5PlusOther(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	h := handler.NewTopFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files/top", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var body struct {
		ParentID   *int64 `json:"parent_id"`
		ParentPath *string `json:"parent_path"`
		Entries    []struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			IsDir     bool   `json:"is_dir"`
			SizeBytes int64  `json:"size_bytes"`
		} `json:"entries"`
		OtherBytes int64 `json:"other_bytes"`
		TotalBytes int64 `json:"total_bytes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.ParentID != nil {
		t.Errorf("expected parent_id null for root, got %v", *body.ParentID)
	}
	if body.ParentPath != nil {
		t.Errorf("expected parent_path null for root, got %v", *body.ParentPath)
	}
	if len(body.Entries) != 5 {
		t.Fatalf("expected 5 entries, got %d", len(body.Entries))
	}
	if body.Entries[0].Name != "movies" {
		t.Errorf("expected entries[0].Name=movies, got %s", body.Entries[0].Name)
	}
	// extra4 is the 6th child (200 MiB) and should land in Other.
	wantOther := int64(200 * 1024 * 1024)
	if body.OtherBytes != wantOther {
		t.Errorf("expected other_bytes=%d, got %d", wantOther, body.OtherBytes)
	}
	var sum int64
	for _, e := range body.Entries {
		sum += e.SizeBytes
	}
	if body.TotalBytes != sum+body.OtherBytes {
		t.Errorf("total_bytes %d != entries sum %d + other %d", body.TotalBytes, sum, body.OtherBytes)
	}
}

func TestTopFilesHandler_NonRootIncludesParentPath(t *testing.T) {
	s := openHandlerStore(t)
	ids := seedHandlerTree(t, s)
	moviesID := ids["/data/movies"]

	h := handler.NewTopFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/files/top?parent_id=%d", moviesID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var body struct {
		ParentID   *int64  `json:"parent_id"`
		ParentPath *string `json:"parent_path"`
		Entries    []struct {
			Name string `json:"name"`
		} `json:"entries"`
		OtherBytes int64 `json:"other_bytes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.ParentID == nil || *body.ParentID != moviesID {
		t.Errorf("expected parent_id=%d, got %v", moviesID, body.ParentID)
	}
	if body.ParentPath == nil || *body.ParentPath != "/data/movies" {
		t.Errorf("expected parent_path=/data/movies, got %v", body.ParentPath)
	}
	if len(body.Entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(body.Entries))
	}
	if body.OtherBytes != 0 {
		t.Errorf("expected other_bytes=0 (only 1 child), got %d", body.OtherBytes)
	}
}

func TestTopFilesHandler_LimitClampsHighAndLow(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)

	h := handler.NewTopFilesHandler(s)
	cases := []struct {
		limit string
		want  int // expected entries count given the 7-direct-child fixture
	}{
		{"0", 1},    // clamped to 1
		{"-5", 1},   // clamped to 1
		{"3", 3},
		{"100", 7},  // clamped to 20, but only 7 children exist
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/files/top?limit="+c.limit, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("limit=%s: expected 200, got %d", c.limit, w.Code)
			continue
		}
		var body struct {
			Entries []struct{} `json:"entries"`
		}
		json.Unmarshal(w.Body.Bytes(), &body)
		if len(body.Entries) != c.want {
			t.Errorf("limit=%s: expected %d entries, got %d", c.limit, c.want, len(body.Entries))
		}
	}
}

func TestTopFilesHandler_InvalidParentIDReturns400(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewTopFilesHandler(s)

	req := httptest.NewRequest(http.MethodGet, "/api/files/top?parent_id=notanumber", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTopFilesHandler_InvalidLimitReturns400(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewTopFilesHandler(s)

	req := httptest.NewRequest(http.MethodGet, "/api/files/top?limit=notanumber", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTopFilesHandler_NonExistentParentReturns404(t *testing.T) {
	s := openHandlerStore(t)
	seedHandlerTree(t, s)
	h := handler.NewTopFilesHandler(s)

	req := httptest.NewRequest(http.MethodGet, "/api/files/top?parent_id=99999", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestTopFilesHandler_ParentIsFileReturns400(t *testing.T) {
	s := openHandlerStore(t)
	ids := seedHandlerTree(t, s)
	fileID := ids["/data/movies/a.mkv"]
	h := handler.NewTopFilesHandler(s)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/files/top?parent_id=%d", fileID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTopFilesHandler_NonGETReturns405(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewTopFilesHandler(s)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/api/files/top", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("method %s: expected 405, got %d", method, w.Code)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/handler/ -run TestTopFilesHandler -v
```

Expected: compile error — `handler.NewTopFilesHandler undefined`.

- [ ] **Step 3: Create the handler**

Create `backend/internal/handler/top_files.go`:

```go
package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

const (
	defaultTopLimit = 5
	maxTopLimit     = 20
	minTopLimit     = 1
)

// TopFilesHandler handles GET /api/files/top requests.
type TopFilesHandler struct {
	store *store.Store
}

// NewTopFilesHandler creates a handler that returns the top-N largest children
// of a given parent (plus an aggregated "other" bucket) by total descendant size.
func NewTopFilesHandler(s *store.Store) *TopFilesHandler {
	return &TopFilesHandler{store: s}
}

type topEntryResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	IsDir     bool   `json:"is_dir"`
	SizeBytes int64  `json:"size_bytes"`
}

type topFilesResponse struct {
	ParentID   *int64             `json:"parent_id"`
	ParentPath *string            `json:"parent_path"`
	Entries    []topEntryResponse `json:"entries"`
	OtherBytes int64              `json:"other_bytes"`
	TotalBytes int64              `json:"total_bytes"`
}

func (h *TopFilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("top_files: encode 405: %v", err)
		}
		return
	}

	q := r.URL.Query()

	// Parse parent_id (optional).
	var parentID *int64
	var parentPath *string
	if raw := q.Get("parent_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid parent_id"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		// Look the parent up so we can: validate existence (404), validate it is
		// a directory (400), and include its path in the response.
		file, err := h.store.GetFile(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "not found"}); err != nil {
				log.Printf("top_files: encode 404: %v", err)
			}
			return
		}
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
				log.Printf("top_files: encode 500: %v", err)
			}
			return
		}
		if file.IsDir == 0 {
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "parent_id is not a directory"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		parentID = &id
		parentPath = &file.Path
	}

	// Parse limit (optional, clamped silently).
	limit := defaultTopLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid limit"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		limit = clampLimit(n)
	}

	children, err := h.store.TopChildren(r.Context(), parentID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("top_files: encode 500: %v", err)
		}
		return
	}

	resp := topFilesResponse{
		ParentID:   parentID,
		ParentPath: parentPath,
		Entries:    make([]topEntryResponse, 0, limit),
	}
	for i, c := range children {
		if i < limit {
			resp.Entries = append(resp.Entries, topEntryResponse{
				ID:        c.ID,
				Name:      c.Name,
				IsDir:     c.IsDir,
				SizeBytes: c.TotalBytes,
			})
			resp.TotalBytes += c.TotalBytes
		} else {
			resp.OtherBytes += c.TotalBytes
		}
	}
	resp.TotalBytes += resp.OtherBytes

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("top_files: encode response: %v", err)
	}
}

func clampLimit(n int) int {
	if n < minTopLimit {
		return minTopLimit
	}
	if n > maxTopLimit {
		return maxTopLimit
	}
	return n
}
```

- [ ] **Step 4: Register the route**

Modify `backend/cmd/api/main.go` — add a single line in the route block (around line 80, after the existing `/api/files` handlers):

```go
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))
	mux.Handle("/api/files/top", handler.NewTopFilesHandler(db))
	mux.Handle("/api/files", handler.NewFilesHandler(db))
	mux.Handle("/api/files/", handler.NewDeleteFileHandler(db))
```

Order matters: `/api/files/top` must be registered **before** `/api/files/` because `http.ServeMux` prefers longer-match patterns but registering before also documents intent and avoids any subtle behavior with trailing-slash routing.

- [ ] **Step 5: Run handler tests**

```bash
cd backend && go test ./internal/handler/ -run TestTopFilesHandler -v
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Run the whole backend test suite**

```bash
cd backend && go test ./...
```

Expected: PASS for everything — confirms the new route doesn't conflict with `/api/files/` (delete-by-id) or `/api/files`.

- [ ] **Step 7: Smoke test the running server**

```bash
cd backend && MANAGED_DIR=/tmp/pi-test PORT=8080 DB_PATH=/tmp/pi-test.db go run ./cmd/api &
# in another terminal:
mkdir -p /tmp/pi-test/movies && head -c 1048576 < /dev/urandom > /tmp/pi-test/movies/big.bin
sleep 2  # let scanner pick it up
curl -s http://localhost:8080/api/files/top | head -200
```

Expected: a JSON response with `parent_id: null`, `parent_path: null`, one entry for `movies` with `size_bytes` ≈ 1048576. Kill the server with `kill %1` after verifying.

- [ ] **Step 8: Commit**

```bash
cd backend && git add internal/handler/top_files.go internal/handler/top_files_test.go cmd/api/main.go
git commit -m "feat(api): GET /api/files/top returns largest children by total size"
```

---

## Task 4: Install Recharts

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

### Steps

- [ ] **Step 1: Install the dependency**

```bash
cd frontend && npm install recharts@^3.8.1
```

Expected: package.json gets `"recharts": "^3.8.1"` and package-lock.json updates. No peer-dep warnings about React 19 (Recharts 3.x officially supports React 19).

- [ ] **Step 2: Verify the build still succeeds**

```bash
cd frontend && npm run build
```

Expected: TypeScript compiles cleanly, Vite produces a bundle. The bundle will be slightly larger but no errors.

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd frontend && npm run test -- --run
```

Expected: all pre-existing tests still PASS. (The `--run` flag tells Vitest to exit after one run instead of watching.)

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "build(frontend): add recharts ^3.8.1"
```

---

## Task 5: Frontend types, API client, and query hook

**Files:**
- Create: `frontend/src/features/largest-files/largest-files.types.ts`
- Create: `frontend/src/features/largest-files/api/topFiles.ts`
- Create: `frontend/src/features/largest-files/queries/queryKeys.ts`
- Create: `frontend/src/features/largest-files/queries/useLargestFiles.ts`

### Steps

These four files mirror the structure of `features/disk-usage/` exactly. They are wired up together because they are interdependent; the widget tests in Task 7 cover the integration.

- [ ] **Step 1: Create the types file**

Create `frontend/src/features/largest-files/largest-files.types.ts`:

```ts
export interface TopFilesEntry {
  id: number;
  name: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface TopFilesResponse {
  parent_id: number | null;
  parent_path: string | null;
  entries: TopFilesEntry[];
  other_bytes: number;
  total_bytes: number;
}
```

- [ ] **Step 2: Create the API client**

Create `frontend/src/features/largest-files/api/topFiles.ts`:

```ts
import { apiClient } from '@/shared/api/client';

import type { TopFilesResponse } from '../largest-files.types';

export const fetchTopFiles = (parentId: number | null): Promise<TopFilesResponse> => {
  const path = parentId === null ? '/files/top' : `/files/top?parent_id=${parentId}`;
  return apiClient<TopFilesResponse>(path);
};
```

- [ ] **Step 3: Create the query-key constants**

Create `frontend/src/features/largest-files/queries/queryKeys.ts`:

```ts
export const QueryKeys = {
  LARGEST_FILES: 'largest-files',
} as const;
```

- [ ] **Step 4: Create the query hook**

Create `frontend/src/features/largest-files/queries/useLargestFiles.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchTopFiles } from '../api/topFiles';
import { QueryKeys } from './queryKeys';

export const useLargestFiles = (parentId: number | null) =>
  useQuery({
    queryKey: [QueryKeys.LARGEST_FILES, parentId],
    queryFn: () => fetchTopFiles(parentId),
  });
```

No `refetchInterval` — the dashboard's `useDiskUsage` polls every 30s, but the largest-files chart is heavier and the user can refocus the window to refetch on the React Query default behaviour.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/features/largest-files/
git commit -m "feat(largest-files): types, api client, and query hook"
```

---

## Task 6: Pure presentation components (`LargestFilesPie`, `LargestFilesBreadcrumb`)

**Files:**
- Create: `frontend/src/features/largest-files/ui/LargestFilesPie.tsx`
- Create: `frontend/src/features/largest-files/ui/LargestFilesBreadcrumb.tsx`

These components contain no data fetching and no internal state — they are tested via the widget in Task 7.

### Steps

- [ ] **Step 1: Create the pie component**

Create `frontend/src/features/largest-files/ui/LargestFilesPie.tsx`:

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { TopFilesEntry } from '../largest-files.types';

interface LargestFilesPieProps {
  entries: TopFilesEntry[];
  otherBytes: number;
  totalBytes: number;
  onEntryClick: (entry: TopFilesEntry) => void;
}

interface SliceDatum {
  key: string;
  name: string;
  size_bytes: number;
  entry: TopFilesEntry | null;
}

const SLICE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
const OTHER_COLOR = '#94a3b8';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(2)} ${units[i]}`;
};

export const LargestFilesPie = ({ entries, otherBytes, totalBytes, onEntryClick }: LargestFilesPieProps) => {
  const data: SliceDatum[] = entries.map(e => ({
    key: `entry-${e.id}`,
    name: e.name,
    size_bytes: e.size_bytes,
    entry: e,
  }));
  if (otherBytes > 0) {
    data.push({ key: 'other', name: 'Other', size_bytes: otherBytes, entry: null });
  }

  const handleClick = (datum: SliceDatum) => {
    if (datum.entry && datum.entry.is_dir) {
      onEntryClick(datum.entry);
    }
  };

  return (
    <div style={{ width: '100%', height: 320 }} role="img" aria-label="Largest files breakdown">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="size_bytes"
            nameKey="name"
            innerRadius={50}
            outerRadius={120}
            paddingAngle={1}
          >
            {data.map((datum, idx) => (
              <Cell
                key={datum.key}
                fill={datum.entry ? SLICE_COLORS[idx % SLICE_COLORS.length] : OTHER_COLOR}
                cursor={datum.entry && datum.entry.is_dir ? 'pointer' : 'default'}
                onClick={() => handleClick(datum)}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [
              `${formatBytes(value)} (${totalBytes > 0 ? ((value / totalBytes) * 100).toFixed(1) : '0'}%)`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
```

- [ ] **Step 2: Create the breadcrumb component**

Create `frontend/src/features/largest-files/ui/LargestFilesBreadcrumb.tsx`:

```tsx
export interface BreadcrumbCrumb {
  id: number;
  name: string;
}

interface LargestFilesBreadcrumbProps {
  path: BreadcrumbCrumb[];
  onCrumbClick: (index: number) => void;
}

const crumbButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'var(--paper-link, #3b82f6)',
  cursor: 'pointer',
  textDecoration: 'underline',
};

export const LargestFilesBreadcrumb = ({ path, onCrumbClick }: LargestFilesBreadcrumbProps) => (
  <nav aria-label="Folder path" style={{ marginBottom: 12, fontSize: 13 }}>
    <button type="button" style={crumbButtonStyle} onClick={() => onCrumbClick(-1)}>
      Root
    </button>
    {path.map((crumb, i) => (
      <span key={crumb.id}>
        <span style={{ margin: '0 6px', color: 'var(--paper-border-bold)' }}>/</span>
        {i === path.length - 1 ? (
          <span aria-current="page" style={{ fontWeight: 600 }}>{crumb.name}</span>
        ) : (
          <button type="button" style={crumbButtonStyle} onClick={() => onCrumbClick(i)}>
            {crumb.name}
          </button>
        )}
      </span>
    ))}
  </nav>
);
```

The `onCrumbClick(-1)` convention means "go back to root" — the widget translates this into clearing the path stack. Any non-negative index `i` truncates the path to `path.slice(0, i + 1)`.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/features/largest-files/ui/LargestFilesPie.tsx src/features/largest-files/ui/LargestFilesBreadcrumb.tsx
git commit -m "feat(largest-files): pie chart and breadcrumb components"
```

---

## Task 7: `LargestFilesWidget` orchestrator with TDD

**Files:**
- Create: `frontend/src/features/largest-files/ui/LargestFilesWidget.tsx`
- Create: `frontend/src/features/largest-files/ui/LargestFilesWidget.tests.tsx`
- Create: `frontend/src/features/largest-files/index.ts`

### Steps

- [ ] **Step 1: Write the failing widget tests**

Create `frontend/src/features/largest-files/ui/LargestFilesWidget.tests.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as largestFilesHook from '../queries/useLargestFiles';
import type { TopFilesResponse } from '../largest-files.types';

import { LargestFilesWidget } from './LargestFilesWidget';

vi.mock('../queries/useLargestFiles');

const mockUseLargestFiles = vi.spyOn(largestFilesHook, 'useLargestFiles');

// jsdom doesn't implement ResizeObserver — Recharts' ResponsiveContainer needs it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  mockUseLargestFiles.mockReset();
});

const rootResponse: TopFilesResponse = {
  parent_id: null,
  parent_path: null,
  entries: [
    { id: 10, name: 'movies', is_dir: true,  size_bytes: 8_000_000_000 },
    { id: 20, name: 'photos', is_dir: true,  size_bytes: 2_000_000_000 },
    { id: 30, name: 'big.iso', is_dir: false, size_bytes: 1_000_000_000 },
  ],
  other_bytes: 500_000,
  total_bytes: 11_000_500_000,
};

const moviesResponse: TopFilesResponse = {
  parent_id: 10,
  parent_path: '/data/movies',
  entries: [
    { id: 100, name: 'a.mkv', is_dir: false, size_bytes: 5_000_000_000 },
  ],
  other_bytes: 0,
  total_bytes: 5_000_000_000,
};

const mockReturn = (data: TopFilesResponse | undefined, opts: { loading?: boolean; error?: boolean } = {}) =>
  ({
    data,
    isLoading: !!opts.loading,
    isError: !!opts.error,
  }) as ReturnType<typeof largestFilesHook.useLargestFiles>;

describe('LargestFilesWidget', () => {
  it('shows a loading skeleton while fetching', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(undefined, { loading: true }));

    render(<LargestFilesWidget />);

    expect(screen.getByRole('status', { name: /loading largest files/i })).toBeInTheDocument();
  });

  it('shows an error message when the query fails', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(undefined, { error: true }));

    render(<LargestFilesWidget />);

    expect(screen.getByText(/couldn'?t load directory sizes/i)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no entries', () => {
    mockUseLargestFiles.mockReturnValue(
      mockReturn({ parent_id: null, parent_path: null, entries: [], other_bytes: 0, total_bytes: 0 }),
    );

    render(<LargestFilesWidget />);

    expect(screen.getByText(/no files to display/i)).toBeInTheDocument();
  });

  it('shows the "no files in this folder" message when entries exist but total is zero', () => {
    mockUseLargestFiles.mockReturnValue(
      mockReturn({
        parent_id: null,
        parent_path: null,
        entries: [{ id: 1, name: 'empty', is_dir: true, size_bytes: 0 }],
        other_bytes: 0,
        total_bytes: 0,
      }),
    );

    render(<LargestFilesWidget />);

    expect(screen.getByText(/no files in this folder/i)).toBeInTheDocument();
  });

  it('renders the breadcrumb with only "Root" when viewing the root', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    const nav = screen.getByRole('navigation', { name: /folder path/i });
    expect(within(nav).getByText('Root')).toBeInTheDocument();
  });

  it('drills into a folder when a folder slice is clicked', () => {
    // Use mockImplementation keyed on parentId so re-renders during a state
    // transition resolve consistently regardless of how many times the hook
    // is called.
    mockUseLargestFiles.mockImplementation(parentId =>
      mockReturn(parentId === null ? rootResponse : moviesResponse),
    );

    render(<LargestFilesWidget />);

    // Click the slice for "movies" — the widget exposes hidden buttons per
    // slice for keyboard accessibility and testability.
    fireEvent.click(screen.getByTestId('largest-files-slice-10'));

    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(10);
    expect(screen.getByRole('navigation', { name: /folder path/i })).toHaveTextContent(/Root.*movies/);
  });

  it('does not drill when a file slice is clicked', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-30')); // big.iso file

    // No re-render with a new parent — hook is still called with null.
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });

  it('does not drill when the "Other" slice is clicked', () => {
    mockUseLargestFiles.mockReturnValue(mockReturn(rootResponse));

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-other'));

    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });

  it('rewinds the path when a breadcrumb is clicked', () => {
    mockUseLargestFiles.mockImplementation(parentId =>
      mockReturn(parentId === null ? rootResponse : moviesResponse),
    );

    render(<LargestFilesWidget />);

    fireEvent.click(screen.getByTestId('largest-files-slice-10')); // drill into movies
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(10);

    fireEvent.click(screen.getByRole('button', { name: 'Root' })); // back to root
    expect(mockUseLargestFiles).toHaveBeenLastCalledWith(null);
  });
});
```

The tests reference `data-testid="largest-files-slice-<id>"` and `data-testid="largest-files-slice-other"`. These are dedicated, hidden, accessible buttons inside the widget — Recharts SVG slices are not reliably clickable via jsdom, and the hidden buttons also serve as keyboard alternatives.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- --run LargestFilesWidget
```

Expected: tests fail because `LargestFilesWidget` doesn't exist.

- [ ] **Step 3: Create the widget**

Create `frontend/src/features/largest-files/ui/LargestFilesWidget.tsx`:

```tsx
import { useState } from 'react';

import type { TopFilesEntry } from '../largest-files.types';
import { useLargestFiles } from '../queries/useLargestFiles';

import { LargestFilesBreadcrumb, type BreadcrumbCrumb } from './LargestFilesBreadcrumb';
import { LargestFilesPie } from './LargestFilesPie';

const CONTAINER_STYLE: React.CSSProperties = {
  background: 'var(--paper-surface)',
  border: '1px solid var(--paper-border)',
  boxShadow: '3px 3px 0 var(--paper-border-bold)',
  padding: '24px',
};

const MESSAGE_STYLE: React.CSSProperties = {
  ...CONTAINER_STYLE,
  fontFamily: 'var(--font-ui)',
  fontSize: '13px',
};

const LargestFilesSkeleton = () => (
  <div role="status" aria-label="Loading largest files" style={CONTAINER_STYLE}>
    <div className="paper-skeleton" style={{ width: '50%', height: '14px', marginBottom: '20px' }} />
    <div className="paper-skeleton" style={{ width: '240px', height: '240px', borderRadius: '50%', margin: '0 auto' }} />
  </div>
);

export const LargestFilesWidget = () => {
  const [path, setPath] = useState<BreadcrumbCrumb[]>([]);
  const currentParentId = path.length === 0 ? null : path[path.length - 1].id;
  const { data, isLoading, isError } = useLargestFiles(currentParentId);

  if (isLoading) return <LargestFilesSkeleton />;

  if (isError || !data) {
    return (
      <div style={{ ...MESSAGE_STYLE, color: 'var(--paper-danger)' }}>
        Couldn&apos;t load directory sizes. Is the API running?
      </div>
    );
  }

  const handleEntryClick = (entry: TopFilesEntry) => {
    if (entry.is_dir) {
      setPath(prev => [...prev, { id: entry.id, name: entry.name }]);
    }
  };

  const handleCrumbClick = (index: number) => {
    setPath(prev => (index < 0 ? [] : prev.slice(0, index + 1)));
  };

  const isEmpty = data.entries.length === 0 && data.other_bytes === 0;
  const isAllZero = !isEmpty && data.total_bytes === 0;

  return (
    <div style={CONTAINER_STYLE}>
      <LargestFilesBreadcrumb path={path} onCrumbClick={handleCrumbClick} />

      {isEmpty && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--paper-border-bold)' }}>No files to display</div>}
      {isAllZero && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--paper-border-bold)' }}>No files in this folder</div>}

      {!isEmpty && !isAllZero && (
        <LargestFilesPie
          entries={data.entries}
          otherBytes={data.other_bytes}
          totalBytes={data.total_bytes}
          onEntryClick={handleEntryClick}
        />
      )}

      {/* Hidden, keyboard-accessible click targets that mirror each slice.
          Recharts SVG slices are not reliably clickable from jsdom, and these
          buttons also serve as accessible alternatives for keyboard users. */}
      <div style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {data.entries.map(entry => (
          <button
            key={entry.id}
            type="button"
            data-testid={`largest-files-slice-${entry.id}`}
            onClick={() => handleEntryClick(entry)}
          >
            {entry.name}
          </button>
        ))}
        {data.other_bytes > 0 && (
          <button type="button" data-testid="largest-files-slice-other" onClick={() => undefined}>
            Other
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Create the feature barrel export**

Create `frontend/src/features/largest-files/index.ts`:

```ts
export { LargestFilesWidget } from './ui/LargestFilesWidget';
export { useLargestFiles } from './queries/useLargestFiles';
```

- [ ] **Step 5: Run the widget tests**

```bash
cd frontend && npm run test -- --run LargestFilesWidget
```

Expected: all 9 tests PASS.

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests PASS — no regressions in `DiskUsageWidget`, `PageDashboard`, etc.

- [ ] **Step 7: Type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/features/largest-files/ui/LargestFilesWidget.tsx src/features/largest-files/ui/LargestFilesWidget.tests.tsx src/features/largest-files/index.ts
git commit -m "feat(largest-files): widget with drill-down navigation"
```

---

## Task 8: Wire `LargestFilesWidget` into the dashboard

**Files:**
- Modify: `frontend/src/pages/dashboard/PageDashboard.tsx`
- Modify: `frontend/src/pages/dashboard/PageDashboard.tests.tsx`

### Steps

- [ ] **Step 1: Update the dashboard page test**

Replace `frontend/src/pages/dashboard/PageDashboard.tests.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as diskUsageHook from '@/features/disk-usage/queries/useDiskUsage';
import * as largestFilesHook from '@/features/largest-files/queries/useLargestFiles';

import { PageDashboard } from './PageDashboard';

vi.mock('@/features/disk-usage/queries/useDiskUsage');
vi.mock('@/features/largest-files/queries/useLargestFiles');

const mockUseDiskUsage = vi.spyOn(diskUsageHook, 'useDiskUsage');
const mockUseLargestFiles = vi.spyOn(largestFilesHook, 'useLargestFiles');

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

describe('PageDashboard', () => {
  it('renders the heading, disk usage widget, and largest files widget', () => {
    mockUseDiskUsage.mockReturnValue({
      data: {
        path: '/data',
        total_bytes: 100 * 1024 ** 3,
        used_bytes: 40 * 1024 ** 3,
        free_bytes: 60 * 1024 ** 3,
        used_percent: 40,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof diskUsageHook.useDiskUsage>);

    mockUseLargestFiles.mockReturnValue({
      data: {
        parent_id: null,
        parent_path: null,
        entries: [{ id: 1, name: 'movies', is_dir: true, size_bytes: 1024 }],
        other_bytes: 0,
        total_bytes: 1024,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof largestFilesHook.useLargestFiles>);

    render(<PageDashboard />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /folder path/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm run test -- --run PageDashboard
```

Expected: the test fails because the widget isn't rendered yet — the navigation assertion fails.

- [ ] **Step 3: Update the dashboard page**

Replace `frontend/src/pages/dashboard/PageDashboard.tsx` with:

```tsx
import { DiskUsageWidget } from '@/features/disk-usage';
import { LargestFilesWidget } from '@/features/largest-files';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <LargestFilesWidget />
  </LayoutDashboard>
);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npm run test -- --run PageDashboard
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests PASS.

- [ ] **Step 6: Build and lint**

```bash
cd frontend && npm run build && npm run lint
```

Expected: build succeeds, lint reports no errors.

- [ ] **Step 7: Manual smoke test in the dev server**

Run the backend with a small managed dir and start the dev server in another terminal:

```bash
# Terminal A
mkdir -p /tmp/pi-demo/movies /tmp/pi-demo/photos
head -c 5000000 < /dev/urandom > /tmp/pi-demo/movies/big.bin
head -c 1000000 < /dev/urandom > /tmp/pi-demo/photos/img.bin
cd backend && MANAGED_DIR=/tmp/pi-demo DB_PATH=/tmp/pi-demo.db go run ./cmd/api

# Terminal B
cd frontend && npm run dev
```

Open the dev URL (typically http://localhost:5173). Verify:
- Pie chart renders below the disk-usage bar.
- Tooltips show byte sizes and percentages.
- Clicking the "movies" slice drills in and the breadcrumb updates.
- Clicking "Root" in the breadcrumb goes back.

Stop both processes when done.

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/pages/dashboard/PageDashboard.tsx src/pages/dashboard/PageDashboard.tests.tsx
git commit -m "feat(dashboard): show largest-files pie chart below disk usage"
```

---

## Final verification

- [ ] **Run the full backend test suite**

```bash
cd backend && go test ./...
```

Expected: all PASS.

- [ ] **Run the full frontend test suite, type-check, lint, and build**

```bash
cd frontend && npm run test -- --run && npx tsc -b && npm run lint && npm run build
```

Expected: all four steps succeed.

- [ ] **Confirm the docker-compose build still works** (optional but recommended given the arm64 target)

```bash
docker-compose build
```

Expected: both backend and frontend images build successfully.

- [ ] **Commit any whitespace or formatting fixes if needed**, then the feature is ready to merge.
