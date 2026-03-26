# Filesystem Tree API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/files?parent_id=<id>` endpoint that lazily serves direct children of a filesystem node stored in SQLite.

**Architecture:** A new `ListChildren` store method handles the DB query (branching on whether `parent_id` is NULL or set), a new `FilesHandler` parses the query param and serialises results to JSON, and `main.go` registers the route. No sqlc regeneration — `ListChildren` is implemented as raw SQL in `store.go`, consistent with the existing `DeleteMissing` pattern.

**Tech Stack:** Go stdlib `net/http`, SQLite via `modernc.org/sqlite`, `database/sql`, `encoding/json`, `net/http/httptest` for tests.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/internal/store/store.go` | Modify | Add `ListChildren` method |
| `backend/internal/store/store_test.go` | Modify | Add tests for `ListChildren` |
| `backend/internal/handler/files.go` | Create | `FilesHandler` — parses params, calls store, returns JSON |
| `backend/internal/handler/files_test.go` | Create | Handler tests using a real SQLite store |
| `backend/cmd/api/main.go` | Modify | Register `/api/files` route |

---

### Task 1: Add `ListChildren` store method

**Files:**
- Modify: `backend/internal/store/store.go`
- Modify: `backend/internal/store/store_test.go`

- [ ] **Step 1: Write the failing tests**

Open `backend/internal/store/store_test.go` and append these tests after the existing ones:

```go
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/store/... -run TestListChildren -v
```

Expected: `FAIL — s.ListChildren undefined`

- [ ] **Step 3: Add `ListChildren` to `store.go`**

Open `backend/internal/store/store.go`. Append this method after `DeleteMissing`:

```go
// ListChildren returns direct children of the given parent.
// Pass a zero sql.NullInt64 (Valid=false) to get root-level entries.
func (s *Store) ListChildren(ctx context.Context, parentID sql.NullInt64) ([]File, error) {
	const rootQ = `SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files WHERE parent_id IS NULL ORDER BY is_dir DESC, name ASC`
	const childQ = `SELECT id, parent_id, path, name, size, is_dir, modified_at, synced_at
FROM files WHERE parent_id = ? ORDER BY is_dir DESC, name ASC`

	var (
		rows *sql.Rows
		err  error
	)
	if !parentID.Valid {
		rows, err = s.db.QueryContext(ctx, rootQ)
	} else {
		rows, err = s.db.QueryContext(ctx, childQ, parentID.Int64)
	}
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && go test ./internal/store/... -run TestListChildren -v
```

Expected: all three `TestListChildren_*` tests PASS.

- [ ] **Step 5: Run full store test suite to confirm no regressions**

```bash
cd backend && go test ./internal/store/... -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/store/store.go internal/store/store_test.go
git commit -m "feat: add ListChildren store method"
```

---

### Task 2: Add `FilesHandler`

**Files:**
- Create: `backend/internal/handler/files.go`
- Create: `backend/internal/handler/files_test.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/handler/files_test.go`:

```go
package handler_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/store"
)

func openHandlerStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestFilesHandler_RootReturnsRootChildren(t *testing.T) {
	s := openHandlerStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	dirID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		Path: "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// Child should NOT appear in root response.
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/note.txt", Name: "note.txt", ModifiedAt: now, SyncedAt: now,
	}); err != nil {
		t.Fatalf("upsert child: %v", err)
	}

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var body []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 1 {
		t.Fatalf("expected 1 root item, got %d", len(body))
	}
	if body[0]["name"] != "docs" {
		t.Errorf("expected name=docs, got %v", body[0]["name"])
	}
}

func TestFilesHandler_ParentIDReturnsChildren(t *testing.T) {
	s := openHandlerStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	dirID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		Path: "/data/docs", Name: "docs", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     "/data/docs/a.txt", Name: "a.txt", ModifiedAt: now, SyncedAt: now,
	}); err != nil {
		t.Fatalf("upsert child: %v", err)
	}

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?parent_id="+fmt.Sprintf("%d", dirID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 1 {
		t.Fatalf("expected 1 child, got %d", len(body))
	}
}

func TestFilesHandler_NonExistentParentReturnsEmptyArray(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?parent_id=9999", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("expected empty array, got %d items", len(body))
	}
}

func TestFilesHandler_InvalidParentIDReturns400(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?parent_id=notanumber", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body["error"] == "" {
		t.Error("expected non-empty error field")
	}
}

func TestFilesHandler_NonGETReturns405(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewFilesHandler(s)
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/api/files", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("method %s: expected 405, got %d", method, w.Code)
		}
	}
}
```

Note: add `"fmt"` to the import block in the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/handler/... -run TestFilesHandler -v
```

Expected: `FAIL — handler.NewFilesHandler undefined`

- [ ] **Step 3: Create `backend/internal/handler/files.go`**

```go
package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

// FilesHandler handles GET /api/files requests.
type FilesHandler struct {
	store *store.Store
}

// NewFilesHandler creates a handler that queries filesystem entries from the store.
func NewFilesHandler(s *store.Store) *FilesHandler {
	return &FilesHandler{store: s}
}

type fileResponse struct {
	ID         int64  `json:"id"`
	ParentID   *int64 `json:"parent_id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	IsDir      bool   `json:"is_dir"`
	ModifiedAt int64  `json:"modified_at"`
}

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

	var parentID sql.NullInt64
	if raw := r.URL.Query().Get("parent_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid parent_id"}); err != nil {
				log.Printf("files: encode 400: %v", err)
			}
			return
		}
		parentID = sql.NullInt64{Int64: id, Valid: true}
	}

	files, err := h.store.ListChildren(context.Background(), parentID)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && go test ./internal/handler/... -run TestFilesHandler -v
```

Expected: all five `TestFilesHandler_*` tests PASS.

- [ ] **Step 5: Run full handler test suite to confirm no regressions**

```bash
cd backend && go test ./internal/handler/... -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/handler/files.go internal/handler/files_test.go
git commit -m "feat: add FilesHandler for GET /api/files"
```

---

### Task 3: Wire route in `main.go`

**Files:**
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Register the route**

Open `backend/cmd/api/main.go`. Find the `mux.Handle` block and add the new route:

```go
mux := http.NewServeMux()
mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))
mux.Handle("/api/files", handler.NewFilesHandler(db))
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd backend && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 3: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all packages PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: register /api/files route in main"
```
