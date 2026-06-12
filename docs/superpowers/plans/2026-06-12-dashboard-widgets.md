# Dashboard Widgets Implementation Plan (Phase 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three spec'd dashboard widgets — space-map treemap, file-type breakdown, sync activity feed — with their backend endpoints, and retire the orphaned top-files endpoint.

**Architecture:** The treemap reuses the existing `Store.TopChildren` recursive CTE through a new `GET /api/directories/{id}/usage` endpoint (the old `/api/files/top` handler is deleted — its query lives on). File types aggregate in Go over a raw `name,size` scan (SQLite cannot split extensions sanely in SQL; the HTTP contract matches the spec). The scanner gains diff detection against a pre-sync snapshot, writing `added/removed/grown/shrunk` rows to a new `changes` table (best-effort, 30-day retention, bootstrap sync skipped). Frontend: three feature modules in the established pattern, recharts `Treemap` themed via a `useThemeTokens` helper that re-reads CSS variables on mode change.

**Tech Stack:** Go + SQLite (raw-SQL store methods — established pattern), React 19 + TanStack Query + recharts, Aurora utilities, Vitest/RTL.

**Spec:** `docs/superpowers/specs/2026-06-12-ui-next-level-design.md` (§2 backend, §3 new widget features, §4)

**Branch:** `feature/dashboard-widgets`, stacked on `feature/browser-ux` (both phases touch `store.go`; stacking avoids a guaranteed merge conflict — merge phase 2 first, then this).

**Plan-level decisions:**
- `GET /api/directories/{id}/usage` reuses `Store.TopChildren` instead of adding a duplicate CTE. `{id}` is `root` or a numeric id (spec's "root when id omitted" is realized as an explicit `root` segment — `/api/directories/usage` would make `usage` ambiguous as an id).
- File-type aggregation happens in Go over a raw `SELECT name, size` scan, not SQL `GROUP BY` (SQLite has no last-index-of for extension splitting; the spec's HTTP contract — category totals + top extensions — is unchanged).
- First-ever sync (empty DB snapshot) records NO changes — otherwise the feed would open with 12k "added" rows.
- `changes` uses raw-SQL store methods (sqlc not required), matching `ListChildren`/`SearchFiles` precedent.

**Working conventions:** backend from `backend/`, frontend from `frontend/`; TDD per new unit; preserve roles/aria/test-ids; Conventional Commits; new interactive controls ≥44px.

---

### Task 1: Backend — directory usage endpoint, top-files retired (TDD)

**Files:**
- Create: `backend/internal/handler/directory_usage.go`
- Test: `backend/internal/handler/directory_usage_test.go`
- Delete: `backend/internal/handler/top_files.go`, `backend/internal/handler/top_files_test.go`
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/handler/directory_usage_test.go`. Seed helper builds `/data` root → `docs/`(dir) → `note.txt`(100B) + `movie.mkv`(5GB); root also has `big.iso`(2GB). Use the existing `openHandlerStore` helper (files_test.go) and the UpsertFile seeding style used across handler tests. Tests:

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

type usageSeed struct {
	rootID, docsID int64
}

func seedUsageTree(t *testing.T, s *store.Store) usageSeed {
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
	for _, p := range []store.UpsertFileParams{
		{ParentID: sql.NullInt64{Int64: docsID, Valid: true}, Path: "/data/docs/note.txt", Name: "note.txt", Size: 100, ModifiedAt: now, SyncedAt: now},
		{ParentID: sql.NullInt64{Int64: docsID, Valid: true}, Path: "/data/docs/movie.mkv", Name: "movie.mkv", Size: 5 << 30, ModifiedAt: now, SyncedAt: now},
		{ParentID: sql.NullInt64{Int64: rootID, Valid: true}, Path: "/data/big.iso", Name: "big.iso", Size: 2 << 30, ModifiedAt: now, SyncedAt: now},
	} {
		if _, err := s.UpsertFile(ctx, p); err != nil {
			t.Fatalf("upsert %s: %v", p.Path, err)
		}
	}
	return usageSeed{rootID: rootID, docsID: docsID}
}

func TestDirectoryUsage_RootListsChildrenWithRecursiveSizes(t *testing.T) {
	s := openHandlerStore(t)
	seedUsageTree(t, s)

	h := handler.NewDirectoryUsageHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/directories/root/usage", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		ParentID   *int64  `json:"parent_id"`
		ParentPath *string `json:"parent_path"`
		Children   []struct {
			ID         int64  `json:"id"`
			Name       string `json:"name"`
			IsDir      bool   `json:"is_dir"`
			TotalBytes int64  `json:"total_bytes"`
		} `json:"children"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.ParentID != nil {
		t.Errorf("expected null parent_id for root, got %v", *body.ParentID)
	}
	if len(body.Children) != 2 {
		t.Fatalf("expected 2 root children, got %d", len(body.Children))
	}
	// TopChildren orders by total_bytes DESC: docs (5GB+100B) before big.iso (2GB).
	if body.Children[0].Name != "docs" || !body.Children[0].IsDir {
		t.Errorf("expected docs dir first, got %+v", body.Children[0])
	}
	if body.Children[0].TotalBytes != (5<<30)+100 {
		t.Errorf("expected recursive size %d, got %d", (5<<30)+100, body.Children[0].TotalBytes)
	}
}

func TestDirectoryUsage_SubdirectoryById(t *testing.T) {
	s := openHandlerStore(t)
	seed := seedUsageTree(t, s)

	h := handler.NewDirectoryUsageHandler(s)
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/directories/%d/usage", seed.docsID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		ParentPath *string `json:"parent_path"`
		Children   []struct {
			Name string `json:"name"`
		} `json:"children"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.ParentPath == nil || *body.ParentPath != "/data/docs" {
		t.Errorf("expected parent_path /data/docs, got %v", body.ParentPath)
	}
	if len(body.Children) != 2 {
		t.Fatalf("expected 2 children, got %d", len(body.Children))
	}
}

func TestDirectoryUsage_UnknownIdReturns404(t *testing.T) {
	s := openHandlerStore(t)
	seedUsageTree(t, s)

	h := handler.NewDirectoryUsageHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/directories/9999/usage", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestDirectoryUsage_FileIdReturns400(t *testing.T) {
	s := openHandlerStore(t)
	seed := seedUsageTree(t, s)
	_ = seed

	// Find big.iso's id by listing root children.
	files, err := s.ListChildren(context.Background(), sql.NullInt64{})
	if err != nil {
		t.Fatalf("ListChildren: %v", err)
	}
	var fileID int64
	for _, f := range files {
		if f.IsDir == 0 {
			fileID = f.ID
		}
	}

	h := handler.NewDirectoryUsageHandler(s)
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/directories/%d/usage", fileID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestDirectoryUsage_MalformedPathsReturn404Or400(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewDirectoryUsageHandler(s)
	for path, want := range map[string]int{
		"/api/directories/root/usage/extra": http.StatusNotFound,
		"/api/directories/root":             http.StatusNotFound,
		"/api/directories/abc/usage":        http.StatusBadRequest,
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != want {
			t.Errorf("%s: expected %d, got %d", path, want, w.Code)
		}
	}
}

func TestDirectoryUsage_NonGETReturns405(t *testing.T) {
	s := openHandlerStore(t)

	h := handler.NewDirectoryUsageHandler(s)
	req := httptest.NewRequest(http.MethodPost, "/api/directories/root/usage", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run to verify failure** — `go test ./internal/handler/ -run TestDirectoryUsage -v` → compile error (`NewDirectoryUsageHandler` undefined).

- [ ] **Step 3: Implement the handler**

Create `backend/internal/handler/directory_usage.go`:

```go
package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"pi-manager/internal/store"
)

// DirectoryUsageHandler handles GET /api/directories/{id}/usage requests,
// where {id} is "root" or a directory id. It returns the directory's direct
// children annotated with their recursive total file size — the data shape a
// click-to-zoom treemap consumes one level at a time.
type DirectoryUsageHandler struct {
	store *store.Store
}

// NewDirectoryUsageHandler creates a handler backed by the given store.
func NewDirectoryUsageHandler(s *store.Store) *DirectoryUsageHandler {
	return &DirectoryUsageHandler{store: s}
}

type usageChildResponse struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	IsDir      bool   `json:"is_dir"`
	TotalBytes int64  `json:"total_bytes"`
}

type directoryUsageResponse struct {
	ParentID   *int64               `json:"parent_id"`
	ParentPath *string              `json:"parent_path"`
	Children   []usageChildResponse `json:"children"`
}

func (h *DirectoryUsageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/directories/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[1] != "usage" || parts[0] == "" {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	var parentID *int64
	var parentPath *string
	if parts[0] != "root" {
		id, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid directory id")
			return
		}
		file, err := h.store.GetFile(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if file.IsDir == 0 {
			writeJSONError(w, http.StatusBadRequest, "id is not a directory")
			return
		}
		parentID = &id
		parentPath = &file.Path
	}

	children, err := h.store.TopChildren(r.Context(), parentID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := directoryUsageResponse{
		ParentID:   parentID,
		ParentPath: parentPath,
		Children:   make([]usageChildResponse, 0, len(children)),
	}
	for _, c := range children {
		resp.Children = append(resp.Children, usageChildResponse{
			ID: c.ID, Name: c.Name, IsDir: c.IsDir, TotalBytes: c.TotalBytes,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("directory_usage: encode response: %v", err)
	}
}

// writeJSONError sends an error response with the given status.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(errorResponse{Error: msg}); err != nil {
		log.Printf("handler: encode %d: %v", status, err)
	}
}
```

(If `writeJSONError` collides with an existing helper name in the package, reuse the existing one instead and report.)

- [ ] **Step 4: Delete the top-files handler and rewire main.go**

```bash
git rm internal/handler/top_files.go internal/handler/top_files_test.go
```

In `backend/cmd/api/main.go` replace the `/api/files/top` route with:

```go
mux.Handle("/api/directories/", handler.NewDirectoryUsageHandler(db))
```

(Removing `mux.Handle("/api/files/top", ...)` entirely. `Store.TopChildren`, `TopChild`, and the sqlc queries STAY — the new handler consumes them. If anything else referenced the deleted handler, the build will say so.)

- [ ] **Step 5: Verify + commit**

```bash
go test ./... && go build ./...
git add -A internal/handler cmd/api
git commit -m "feat(space-map): add directory usage endpoint, retire top-files handler"
```

Expected: TestDirectoryUsage all pass; the deleted top_files tests are gone; everything else green.

---

### Task 2: Backend — file-type breakdown endpoint (TDD)

**Files:**
- Modify: `backend/internal/store/store.go`
- Create: `backend/internal/handler/file_types.go`
- Test: `backend/internal/store/file_types_test.go`, `backend/internal/handler/file_types_test.go`

- [ ] **Step 1: Failing store test** — create `backend/internal/store/file_types_test.go`:

```go
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
```

- [ ] **Step 2: Run, confirm compile failure; implement in store.go:**

```go
// FileNameSize is a minimal projection for file-type aggregation.
type FileNameSize struct {
	Name string
	Size int64
}

// FileNameSizes returns name and size for every regular file (no directories).
// Extension/category aggregation happens in Go: SQLite has no last-index-of,
// making extension extraction in SQL unreadable.
func (s *Store) FileNameSizes(ctx context.Context) ([]FileNameSize, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT name, size FROM files WHERE is_dir = 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FileNameSize
	for rows.Next() {
		var f FileNameSize
		if err := rows.Scan(&f.Name, &f.Size); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
```

- [ ] **Step 3: Failing handler test** — create `backend/internal/handler/file_types_test.go`:

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

func TestFileTypes_AggregatesByCategory(t *testing.T) {
	s := openHandlerStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	rootID, err := s.UpsertFile(ctx, store.UpsertFileParams{Path: "/d", Name: "d", IsDir: 1, ModifiedAt: now, SyncedAt: now})
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []struct {
		name string
		size int64
	}{
		{"a.mkv", 100}, {"b.MP4", 50}, {"c.jpg", 30}, {"notes", 7},
	} {
		if _, err := s.UpsertFile(ctx, store.UpsertFileParams{
			ParentID: sql.NullInt64{Int64: rootID, Valid: true},
			Path:     "/d/" + f.name, Name: f.name, Size: f.size, ModifiedAt: now, SyncedAt: now,
		}); err != nil {
			t.Fatal(err)
		}
	}

	h := handler.NewFileTypesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/file-types", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		TotalBytes int64 `json:"total_bytes"`
		Categories []struct {
			Category   string `json:"category"`
			TotalBytes int64  `json:"total_bytes"`
			Extensions []struct {
				Extension  string `json:"extension"`
				TotalBytes int64  `json:"total_bytes"`
			} `json:"extensions"`
		} `json:"categories"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if body.TotalBytes != 187 {
		t.Errorf("expected total 187, got %d", body.TotalBytes)
	}
	if len(body.Categories) != 3 {
		t.Fatalf("expected 3 categories (video, image, other), got %+v", body.Categories)
	}
	// Sorted by total desc: video (150) > image (30) > other (7).
	if body.Categories[0].Category != "video" || body.Categories[0].TotalBytes != 150 {
		t.Errorf("expected video/150 first, got %+v", body.Categories[0])
	}
	// .MP4 must fold into mp4 (case-insensitive extensions).
	exts := body.Categories[0].Extensions
	if len(exts) != 2 || exts[0].Extension != "mkv" || exts[1].Extension != "mp4" {
		t.Errorf("expected [mkv, mp4] under video, got %+v", exts)
	}
}

func TestFileTypes_NonGETReturns405(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewFileTypesHandler(s)
	req := httptest.NewRequest(http.MethodDelete, "/api/file-types", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
```

- [ ] **Step 4: Implement handler** — create `backend/internal/handler/file_types.go`:

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"

	"pi-manager/internal/store"
)

// FileTypesHandler handles GET /api/file-types requests: total bytes per
// content category (video, audio, image, archive, document, other), with the
// top extensions inside each.
type FileTypesHandler struct {
	store *store.Store
}

// NewFileTypesHandler creates a handler backed by the given store.
func NewFileTypesHandler(s *store.Store) *FileTypesHandler {
	return &FileTypesHandler{store: s}
}

const maxExtensionsPerCategory = 3

// extensionCategories maps known extensions to a display category. Anything
// unlisted (or extension-less) lands in "other".
var extensionCategories = map[string]string{
	"mkv": "video", "mp4": "video", "avi": "video", "mov": "video", "webm": "video", "m4v": "video", "ts": "video",
	"mp3": "audio", "flac": "audio", "wav": "audio", "aac": "audio", "ogg": "audio", "m4a": "audio",
	"jpg": "image", "jpeg": "image", "png": "image", "gif": "image", "webp": "image", "svg": "image", "heic": "image",
	"zip": "archive", "tar": "archive", "gz": "archive", "bz2": "archive", "7z": "archive", "rar": "archive", "xz": "archive", "iso": "archive", "img": "archive",
	"pdf": "document", "doc": "document", "docx": "document", "txt": "document", "md": "document",
	"xls": "document", "xlsx": "document", "ppt": "document", "pptx": "document", "csv": "document", "epub": "document",
}

type extensionTotal struct {
	Extension  string `json:"extension"`
	TotalBytes int64  `json:"total_bytes"`
}

type categoryTotal struct {
	Category   string           `json:"category"`
	TotalBytes int64            `json:"total_bytes"`
	Extensions []extensionTotal `json:"extensions"`
}

type fileTypesResponse struct {
	TotalBytes int64           `json:"total_bytes"`
	Categories []categoryTotal `json:"categories"`
}

// fileExtension returns the lowercase extension without the dot, or "" when
// the name has none (including dotfiles like ".bashrc").
func fileExtension(name string) string {
	idx := strings.LastIndex(name, ".")
	if idx <= 0 || idx == len(name)-1 {
		return ""
	}
	return strings.ToLower(name[idx+1:])
}

func (h *FileTypesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	files, err := h.store.FileNameSizes(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	extBytes := map[string]map[string]int64{} // category → extension → bytes
	var total int64
	for _, f := range files {
		ext := fileExtension(f.Name)
		category, ok := extensionCategories[ext]
		if !ok {
			category = "other"
		}
		if extBytes[category] == nil {
			extBytes[category] = map[string]int64{}
		}
		key := ext
		if key == "" {
			key = "(none)"
		}
		extBytes[category][key] += f.Size
		total += f.Size
	}

	resp := fileTypesResponse{TotalBytes: total, Categories: make([]categoryTotal, 0, len(extBytes))}
	for category, exts := range extBytes {
		ct := categoryTotal{Category: category, Extensions: make([]extensionTotal, 0, len(exts))}
		for ext, bytes := range exts {
			ct.TotalBytes += bytes
			ct.Extensions = append(ct.Extensions, extensionTotal{Extension: ext, TotalBytes: bytes})
		}
		sort.Slice(ct.Extensions, func(i, j int) bool {
			if ct.Extensions[i].TotalBytes != ct.Extensions[j].TotalBytes {
				return ct.Extensions[i].TotalBytes > ct.Extensions[j].TotalBytes
			}
			return ct.Extensions[i].Extension < ct.Extensions[j].Extension
		})
		if len(ct.Extensions) > maxExtensionsPerCategory {
			ct.Extensions = ct.Extensions[:maxExtensionsPerCategory]
		}
		resp.Categories = append(resp.Categories, ct)
	}
	sort.Slice(resp.Categories, func(i, j int) bool {
		if resp.Categories[i].TotalBytes != resp.Categories[j].TotalBytes {
			return resp.Categories[i].TotalBytes > resp.Categories[j].TotalBytes
		}
		return resp.Categories[i].Category < resp.Categories[j].Category
	})

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("file_types: encode response: %v", err)
	}
}
```

- [ ] **Step 5: Route + verify + commit**

In main.go: `mux.Handle("/api/file-types", handler.NewFileTypesHandler(db))`

```bash
go test ./... && go build ./...
git add internal/store internal/handler cmd/api
git commit -m "feat(file-types): add file-type breakdown endpoint with category mapping"
```

---

### Task 3: Backend — changes table + store methods (TDD)

**Files:**
- Modify: `backend/internal/store/schema.sql`, `backend/internal/store/store.go`
- Test: `backend/internal/store/changes_test.go`

- [ ] **Step 1: Failing tests** — create `backend/internal/store/changes_test.go`:

```go
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
```

- [ ] **Step 2: Schema + implementation.** Append to `backend/internal/store/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS changes (
    id          INTEGER PRIMARY KEY,
    path        TEXT    NOT NULL,
    change_type TEXT    NOT NULL,
    bytes_delta INTEGER NOT NULL DEFAULT 0,
    detected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_detected_at ON changes(detected_at);
```

Append to `backend/internal/store/store.go`:

```go
// Change is one filesystem mutation observed between two sync cycles.
// ChangeType is one of: added, removed, grown, shrunk.
type Change struct {
	ID         int64
	Path       string
	ChangeType string
	BytesDelta int64
	DetectedAt int64
}

// SnapshotEntry is the pre-sync state of one path, used for diff detection.
type SnapshotEntry struct {
	Size  int64
	IsDir bool
}

// SnapshotFiles returns the current path → {size, is_dir} state of the tree.
func (s *Store) SnapshotFiles(ctx context.Context) (map[string]SnapshotEntry, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT path, size, is_dir FROM files`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	snap := make(map[string]SnapshotEntry)
	for rows.Next() {
		var path string
		var size, isDir int64
		if err := rows.Scan(&path, &size, &isDir); err != nil {
			return nil, err
		}
		snap[path] = SnapshotEntry{Size: size, IsDir: isDir != 0}
	}
	return snap, rows.Err()
}

// RecordChanges inserts a batch of change rows in one transaction.
func (s *Store) RecordChanges(ctx context.Context, changes []Change) error {
	if len(changes) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO changes (path, change_type, bytes_delta, detected_at) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, c := range changes {
		if _, err := stmt.ExecContext(ctx, c.Path, c.ChangeType, c.BytesDelta, c.DetectedAt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListChanges returns the most recent changes, newest first.
func (s *Store) ListChanges(ctx context.Context, limit int64) ([]Change, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, path, change_type, bytes_delta, detected_at
FROM changes ORDER BY detected_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Change
	for rows.Next() {
		var c Change
		if err := rows.Scan(&c.ID, &c.Path, &c.ChangeType, &c.BytesDelta, &c.DetectedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// PruneChanges deletes change rows detected before the given Unix timestamp.
func (s *Store) PruneChanges(ctx context.Context, olderThan int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM changes WHERE detected_at < ?`, olderThan)
	return err
}
```

- [ ] **Step 3: Verify + commit**

```bash
go test ./internal/store/ -v && go test ./...
git add internal/store
git commit -m "feat(activity): add changes table with record, list, and prune"
```

---

### Task 4: Backend — scanner diff detection (TDD)

**Files:**
- Modify: `backend/internal/scanner/scanner.go`
- Modify: `backend/internal/scanner/scanner_test.go` (extend — read it first; it defines how Sync is currently tested)

- [ ] **Step 1: Failing tests.** Read `scanner_test.go` to learn the harness (it tests `Sync` against a real store + tempdir). Add tests:

```go
func TestSync_RecordsAddedRemovedAndGrownChanges(t *testing.T) {
	// 1. tempdir with fileA (content "aa") → Sync → bootstrap: expect ZERO changes rows.
	// 2. add fileB, grow fileA ("aaaa"), Sync again → expect changes: added(/fileB, +size), grown(/fileA, +2).
	// 3. delete fileB, Sync → expect a removed(/fileB) row with negative bytes_delta.
	// Assert via store.ListChanges: newest first, correct change_type/bytes_delta per row.
	// Directories must not produce grown/shrunk rows (dir sizes are fs-block noise).
}

func TestSync_BootstrapSyncRecordsNoChanges(t *testing.T) {
	// Fresh DB + populated tempdir → Sync → ListChanges returns 0 rows.
}
```

Write these fully against the existing harness style (real assertions, no comments-as-code). The exact change rows asserted:
- added: `ChangeType "added"`, `BytesDelta == new size`
- grown: `ChangeType "grown"`, `BytesDelta == newSize - oldSize` (positive)
- shrunk: `ChangeType "shrunk"`, `BytesDelta` negative
- removed: `ChangeType "removed"`, `BytesDelta == -oldSize`

- [ ] **Step 2: Run, confirm failure** (Store interface lacks the new methods / no changes recorded).

- [ ] **Step 3: Implement.** In `scanner.go`:

1. Extend the Store interface:

```go
// Store is the database interface required by Sync.
type Store interface {
	UpsertFile(ctx context.Context, arg store.UpsertFileParams) (int64, error)
	DeleteMissing(ctx context.Context, paths []string) error
	SnapshotFiles(ctx context.Context) (map[string]store.SnapshotEntry, error)
	RecordChanges(ctx context.Context, changes []store.Change) error
	PruneChanges(ctx context.Context, olderThan int64) error
}
```

2. In `Sync`, before the walk:

```go
snapshot, err := s.SnapshotFiles(ctx)
if err != nil {
	log.Printf("scanner: snapshot for diff detection failed: %v", err)
	snapshot = nil
}
// A nil/empty snapshot means a fresh database: recording every file as
// "added" on first sync would flood the feed, so diffing is skipped.
bootstrap := len(snapshot) == 0
var changes []store.Change
now := time.Now().Unix()
seenSet := make(map[string]struct{})
```

3. Inside the walk callback, after a successful upsert (`pathToID[path] = id`), add diff detection (directories produce only added/removed, never grown/shrunk):

```go
seenSet[path] = struct{}{}
if !bootstrap && snapshot != nil {
	prev, existed := snapshot[path]
	switch {
	case !existed:
		changes = append(changes, store.Change{Path: path, ChangeType: "added", BytesDelta: info.Size(), DetectedAt: now})
	case !d.IsDir() && info.Size() > prev.Size:
		changes = append(changes, store.Change{Path: path, ChangeType: "grown", BytesDelta: info.Size() - prev.Size, DetectedAt: now})
	case !d.IsDir() && info.Size() < prev.Size:
		changes = append(changes, store.Change{Path: path, ChangeType: "shrunk", BytesDelta: info.Size() - prev.Size, DetectedAt: now})
	}
}
```

4. After the walk, before `DeleteMissing`, detect removals:

```go
if !bootstrap && snapshot != nil {
	for path, prev := range snapshot {
		if _, ok := seenSet[path]; !ok {
			changes = append(changes, store.Change{Path: path, ChangeType: "removed", BytesDelta: -prev.Size, DetectedAt: now})
		}
	}
}
```

5. At the end (after `DeleteMissing` succeeds), best-effort recording + retention — the activity feed must never fail a sync:

```go
if err := s.DeleteMissing(ctx, seen); err != nil {
	return err
}

if err := s.RecordChanges(ctx, changes); err != nil {
	log.Printf("scanner: recording changes failed (sync unaffected): %v", err)
}
const retentionSeconds = 30 * 24 * 60 * 60
if err := s.PruneChanges(ctx, now-retentionSeconds); err != nil {
	log.Printf("scanner: pruning changes failed (sync unaffected): %v", err)
}
return nil
```

NOTE: the existing scanner tests may use a fake/minimal Store impl — if so it must grow the three new methods (no-ops for old tests). If they use the real store, nothing extra is needed. Adapt accordingly and report.

- [ ] **Step 4: Verify + commit**

```bash
go test ./... && go build ./...
git add internal/scanner
git commit -m "feat(activity): detect added, removed, grown, and shrunk files during sync"
```

---

### Task 5: Backend — changes endpoint (TDD)

**Files:**
- Create: `backend/internal/handler/changes.go`
- Test: `backend/internal/handler/changes_test.go`
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Failing tests** — `backend/internal/handler/changes_test.go`:

```go
package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"pi-manager/internal/handler"
	"pi-manager/internal/store"
)

func TestChangesHandler_ReturnsNewestFirst(t *testing.T) {
	s := openHandlerStore(t)
	if err := s.RecordChanges(context.Background(), []store.Change{
		{Path: "/a", ChangeType: "added", BytesDelta: 10, DetectedAt: 100},
		{Path: "/b", ChangeType: "removed", BytesDelta: -5, DetectedAt: 200},
	}); err != nil {
		t.Fatal(err)
	}

	h := handler.NewChangesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/changes", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body []struct {
		Path       string `json:"path"`
		ChangeType string `json:"change_type"`
		BytesDelta int64  `json:"bytes_delta"`
		DetectedAt int64  `json:"detected_at"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(body) != 2 || body[0].Path != "/b" || body[0].ChangeType != "removed" {
		t.Fatalf("expected /b removed first, got %+v", body)
	}
}

func TestChangesHandler_EmptyIsEmptyArray(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewChangesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/changes", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK || w.Body.String() != "[]\n" {
		t.Fatalf("expected empty array, got %d %q", w.Code, w.Body.String())
	}
}

func TestChangesHandler_ValidatesLimit(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewChangesHandler(s)
	for _, target := range []string{"/api/changes?limit=abc", "/api/changes?limit=0", "/api/changes?limit=500"} {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", target, w.Code)
		}
	}
}

func TestChangesHandler_NonGETReturns405(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewChangesHandler(s)
	req := httptest.NewRequest(http.MethodPost, "/api/changes", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Implement** — `backend/internal/handler/changes.go`:

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

const (
	changesDefaultLimit = 50
	changesMaxLimit     = 200
)

// ChangesHandler handles GET /api/changes requests: recent filesystem
// changes detected by the sync scanner, newest first.
type ChangesHandler struct {
	store *store.Store
}

// NewChangesHandler creates a handler backed by the given store.
func NewChangesHandler(s *store.Store) *ChangesHandler {
	return &ChangesHandler{store: s}
}

type changeResponse struct {
	ID         int64  `json:"id"`
	Path       string `json:"path"`
	ChangeType string `json:"change_type"`
	BytesDelta int64  `json:"bytes_delta"`
	DetectedAt int64  `json:"detected_at"`
}

func (h *ChangesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	limit := int64(changesDefaultLimit)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 1 || n > changesMaxLimit {
			writeJSONError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = n
	}

	changes, err := h.store.ListChanges(r.Context(), limit)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]changeResponse, 0, len(changes))
	for _, c := range changes {
		resp = append(resp, changeResponse{
			ID: c.ID, Path: c.Path, ChangeType: c.ChangeType,
			BytesDelta: c.BytesDelta, DetectedAt: c.DetectedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("changes: encode response: %v", err)
	}
}
```

- [ ] **Step 3: Route + verify + commit**

main.go: `mux.Handle("/api/changes", handler.NewChangesHandler(db))`

```bash
go test ./... && go build ./...
git add internal/handler cmd/api
git commit -m "feat(activity): add changes endpoint"
```

---

### Task 6: Frontend — shared formatBytes + useThemeTokens (TDD)

**Files:**
- Create: `frontend/src/shared/lib/formatBytes.ts` + `formatBytes.tests.ts`
- Create: `frontend/src/shared/theme/useThemeTokens.ts` + `useThemeTokens.tests.tsx`
- Modify: `frontend/src/features/files/ui/FileRow.tsx`, `frontend/src/features/files/ui/SearchResultsList.tsx` (dedupe — phase-2 review flagged the byte-for-byte duplicate)

- [ ] **Step 1: Failing tests.**

`frontend/src/shared/lib/formatBytes.tests.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('formats across magnitudes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5 MB');
    expect(formatBytes(1.55 * 1024 ** 3)).toBe('1.5 GB');
  });
});
```

`frontend/src/shared/theme/useThemeTokens.tests.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from './ThemeProvider';
import { useThemeTokens } from './useThemeTokens';

const stubMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
};

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.style.removeProperty('--accent');
  delete document.documentElement.dataset.mode;
});

describe('useThemeTokens', () => {
  it('reads the computed values of the requested CSS variables', () => {
    stubMatchMedia();
    document.documentElement.style.setProperty('--accent', '#0d9488');

    const { result } = renderHook(() => useThemeTokens(['--accent']), { wrapper });

    expect(result.current['--accent']).toBe('#0d9488');
  });
});
```

- [ ] **Step 2: Implement.**

`frontend/src/shared/lib/formatBytes.ts` (consolidates the formatFileSize/formatResultSize duplicates):

```ts
export const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
};
```

`frontend/src/shared/theme/useThemeTokens.ts`:

```ts
import { useMemo } from 'react';

import { useTheme } from './ThemeProvider';

// Reads computed CSS custom properties so canvas/SVG libraries (recharts) can
// use theme colors. Re-evaluates when the resolved mode flips.
export const useThemeTokens = (names: readonly string[]): Record<string, string> => {
  const { resolvedMode } = useTheme();
  const joined = names.join(',');

  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      joined.split(',').map(name => [name, styles.getPropertyValue(name).trim()]),
    );
  }, [resolvedMode, joined]); // eslint-disable-line react-hooks/exhaustive-deps -- resolvedMode invalidates the computed styles
};
```

- [ ] **Step 3: Dedupe.** In `FileRow.tsx`: delete the local `formatFileSize`, import `formatBytes` from `@/shared/lib/formatBytes`, replace the call. In `SearchResultsList.tsx`: delete `formatResultSize`, same import/replace. (Both local functions are byte-identical to `formatBytes` — rendered output unchanged; existing tests must pass untouched.)

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run && npm run build
git add src/shared src/features/files
git commit -m "feat(shared): add formatBytes and useThemeTokens, dedupe size formatters"
```

---

### Task 7: Frontend — space-map feature (TDD)

**Files:**
- Create: `frontend/src/features/space-map/space-map.types.ts`, `api/directoryUsage.ts`, `queries/queryKeys.ts`, `queries/useDirectoryUsage.ts`, `ui/SpaceMapWidget.tsx`, `index.ts`
- Test: `frontend/src/features/space-map/ui/SpaceMapWidget.tests.tsx`

- [ ] **Step 1: Types + api + query (follow the files-feature layout exactly).**

`space-map.types.ts`:

```ts
export interface UsageChild {
  id: number;
  name: string;
  is_dir: boolean;
  total_bytes: number;
}

export interface DirectoryUsage {
  parent_id: number | null;
  parent_path: string | null;
  children: UsageChild[];
}
```

`api/directoryUsage.ts`:

```ts
import { apiClient } from '@/shared/api/client';

import type { DirectoryUsage } from '../space-map.types';

export const fetchDirectoryUsage = (directoryId?: number): Promise<DirectoryUsage> =>
  apiClient<DirectoryUsage>(`/directories/${directoryId ?? 'root'}/usage`);
```

`queries/queryKeys.ts`:

```ts
export const QueryKeys = {
  DIRECTORY_USAGE: 'directory-usage',
} as const;
```

`queries/useDirectoryUsage.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchDirectoryUsage } from '../api/directoryUsage';
import { QueryKeys } from './queryKeys';

export const useDirectoryUsage = (directoryId: number | undefined) =>
  useQuery({
    queryKey: [QueryKeys.DIRECTORY_USAGE, directoryId ?? 'root'],
    queryFn: () => fetchDirectoryUsage(directoryId),
  });
```

`index.ts`:

```ts
export { SpaceMapWidget } from './ui/SpaceMapWidget';
```

- [ ] **Step 2: Failing widget tests** — `ui/SpaceMapWidget.tests.tsx`. Mock `../queries/useDirectoryUsage` (the established widget-test pattern — copy the mocking style from `DiskUsageWidget.tests.tsx`). recharts' `ResponsiveContainer` renders 0×0 in jsdom; the widget therefore must also render an accessible list of the children alongside the chart (see Step 3 — `data-testid="space-map-legend"`), which is what tests assert. Mock matchMedia + wrap in ThemeProvider (useThemeTokens needs it). Tests:

```tsx
// 'shows a loading skeleton' — isLoading: true → role="status" aria-label="Loading space map"
// 'shows an error card with retry' — isError → text /failed to load space map/i, button /retry/i calls refetch
// 'renders children with sizes and drills into a directory' — data with a dir (media, 18 GB) and a file (big.iso, 2 GB):
//    both names visible with formatted sizes; clicking the dir button calls useDirectoryUsage with its id on rerender
//    (assert via the mock's last call arg) and shows a breadcrumb with the dir name
// 'climbs back via breadcrumb' — after drilling, clicking the root crumb returns to root (mock called with undefined)
```

Write these as REAL tests with full arrange/act/assert.

- [ ] **Step 3: Implement SpaceMapWidget** — `ui/SpaceMapWidget.tsx`:

```tsx
import { useState } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';

import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';
import { formatBytes } from '@/shared/lib/formatBytes';
import { useThemeTokens } from '@/shared/theme/useThemeTokens';

import type { UsageChild } from '../space-map.types';
import { useDirectoryUsage } from '../queries/useDirectoryUsage';

interface Crumb {
  id: number | undefined;
  name: string;
}

const TOKEN_NAMES = ['--accent', '--accent-2', '--warn', '--safe', '--danger', '--muted'] as const;

const SpaceMapSkeleton = () => (
  <GlassCard role="status" aria-label="Loading space map" className="p-6">
    <div className="skeleton w-28 h-3 mb-4" />
    <div className="skeleton h-44" />
  </GlassCard>
);

export const SpaceMapWidget = () => {
  const [stack, setStack] = useState<Crumb[]>([{ id: undefined, name: 'Root' }]);
  const current = stack[stack.length - 1];
  const { data, isLoading, isError, refetch } = useDirectoryUsage(current.id);
  const tokens = useThemeTokens(TOKEN_NAMES);

  if (isLoading) return <SpaceMapSkeleton />;
  if (isError || !data) {
    return <WidgetError message="Failed to load space map. Is the API running?" onRetry={() => refetch()} />;
  }

  const palette = [
    tokens['--accent'],
    tokens['--accent-2'],
    tokens['--warn'],
    tokens['--safe'],
    tokens['--danger'],
    tokens['--muted'],
  ];

  const handleDrill = (child: UsageChild) => {
    if (!child.is_dir) return;
    setStack(prev => [...prev, { id: child.id, name: child.name }]);
  };

  const handleCrumb = (index: number) => {
    setStack(prev => prev.slice(0, index + 1));
  };

  const treemapData = data.children.map((c, i) => ({
    ...c,
    size: c.total_bytes,
    fill: palette[i % palette.length],
  }));

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0">Space map</h2>
        <nav aria-label="Space map path" className="flex items-center gap-1 min-w-0">
          {stack.map((crumb, i) => {
            const isLast = i === stack.length - 1;
            return (
              <span key={`${crumb.id ?? 'root'}-${i}`} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="font-data text-[10px] text-dim">›</span>}
                {isLast ? (
                  <span className="font-data text-xs font-medium text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                    {crumb.name}
                  </span>
                ) : (
                  <button type="button" onClick={() => handleCrumb(i)} className="breadcrumb-link bg-transparent border-none p-0">
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      {data.children.length === 0 ? (
        <div className="font-ui text-[13px] text-muted py-8 text-center">Empty directory.</div>
      ) : (
        <>
          <div className="h-44 mb-3" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                stroke="transparent"
                isAnimationActive={false}
                onClick={(node: unknown) => {
                  const payload = node as UsageChild;
                  if (payload && typeof payload.id === 'number') handleDrill(payload);
                }}
              />
            </ResponsiveContainer>
          </div>

          {/* Accessible mirror of the treemap: jsdom-testable, screen-reader friendly, tap-friendly. */}
          <div data-testid="space-map-legend" className="flex flex-col">
            {data.children.map((child, i) => (
              <button
                key={child.id}
                type="button"
                disabled={!child.is_dir}
                onClick={() => handleDrill(child)}
                className={
                  'flex items-center gap-2 w-full px-1 py-2 min-h-11 bg-transparent cursor-pointer text-left disabled:cursor-default hover:bg-surface-hi transition-colors ' +
                  (i > 0 ? 'border-0 border-t border-solid border-glass' : 'border-none')
                }
              >
                <span aria-hidden className="w-3 h-3 rounded shrink-0" style={{ background: palette[i % palette.length] }} />
                <span className="font-ui text-[13px] text-ink flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {child.name}
                </span>
                <span className="font-data text-xs text-muted shrink-0">{formatBytes(child.total_bytes)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
};
```

NOTE: verify recharts v3 `Treemap` accepts `nameKey`/`onClick` props as used (check the installed types in node_modules if TS complains; adapt the onClick payload extraction minimally and report). The legend list is the behavioral contract — the canvas chart is progressive enhancement.

- [ ] **Step 4: Run widget tests → green; full suite + build; commit**

```bash
npx vitest run && npm run build
git add src/features/space-map
git commit -m "feat(space-map): add drillable space map widget with recharts treemap"
```

---

### Task 8: Frontend — file-types feature (TDD)

**Files:**
- Create: `frontend/src/features/file-types/file-types.types.ts`, `api/fileTypes.ts`, `queries/queryKeys.ts`, `queries/useFileTypes.ts`, `ui/FileTypesWidget.tsx`, `index.ts`
- Test: `frontend/src/features/file-types/ui/FileTypesWidget.tests.tsx`

- [ ] **Step 1: Module scaffolding** (same layout as space-map):

`file-types.types.ts`:

```ts
export interface ExtensionTotal {
  extension: string;
  total_bytes: number;
}

export interface CategoryTotal {
  category: string;
  total_bytes: number;
  extensions: ExtensionTotal[];
}

export interface FileTypes {
  total_bytes: number;
  categories: CategoryTotal[];
}
```

`api/fileTypes.ts`: `fetchFileTypes = (): Promise<FileTypes> => apiClient<FileTypes>('/file-types');`
`queries/queryKeys.ts`: `FILE_TYPES: 'file-types'`
`queries/useFileTypes.ts`: standard useQuery.
`index.ts`: `export { FileTypesWidget } from './ui/FileTypesWidget';`

- [ ] **Step 2: Failing widget tests** (mock useFileTypes; DiskUsage test pattern):

```tsx
// 'shows a loading skeleton' — role="status" aria-label="Loading file types"
// 'shows an error card with retry' — /failed to load file types/i + retry → refetch
// 'renders a segment and legend entry per category' — two categories (video 150 GB, image 30 GB):
//    legend shows "Video" with formatted size and the top extensions string; the stacked bar has
//    data-testid="file-types-bar" whose children count === categories count and widths proportional
//    (assert style width contains '83.3' for video — 150/180)
// 'shows empty state when there are no files' — total_bytes 0 → /no files yet/i
```

Write fully.

- [ ] **Step 3: Implement FileTypesWidget** — `ui/FileTypesWidget.tsx`:

```tsx
import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';
import { formatBytes } from '@/shared/lib/formatBytes';

import { useFileTypes } from '../queries/useFileTypes';

const CATEGORY_COLORS: Record<string, string> = {
  video: 'var(--accent)',
  audio: 'var(--accent-2)',
  image: 'var(--warn)',
  archive: 'var(--safe)',
  document: 'var(--danger)',
  other: 'var(--muted)',
};

const categoryColor = (category: string): string => CATEGORY_COLORS[category] ?? 'var(--muted)';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const FileTypesSkeleton = () => (
  <GlassCard role="status" aria-label="Loading file types" className="p-6">
    <div className="skeleton w-24 h-3 mb-4" />
    <div className="skeleton h-3.5 rounded-full mb-4" />
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="skeleton h-4 w-2/3" />
      ))}
    </div>
  </GlassCard>
);

export const FileTypesWidget = () => {
  const { data, isLoading, isError, refetch } = useFileTypes();

  if (isLoading) return <FileTypesSkeleton />;
  if (isError || !data) {
    return <WidgetError message="Failed to load file types. Is the API running?" onRetry={() => refetch()} />;
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-4">By file type</h2>

      {data.total_bytes === 0 ? (
        <div className="font-ui text-[13px] text-muted py-4 text-center">No files yet.</div>
      ) : (
        <>
          <div data-testid="file-types-bar" className="flex h-3.5 rounded-full overflow-hidden mb-4">
            {data.categories.map(cat => (
              <div
                key={cat.category}
                style={{
                  width: `${(cat.total_bytes / data.total_bytes) * 100}%`,
                  background: categoryColor(cat.category),
                }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {data.categories.map(cat => (
              <div key={cat.category} className="flex items-center gap-2">
                <span aria-hidden className="w-3 h-3 rounded shrink-0" style={{ background: categoryColor(cat.category) }} />
                <span className="font-ui text-[13px] font-medium text-ink">{capitalize(cat.category)}</span>
                <span className="font-data text-[11px] text-dim flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {cat.extensions.map(e => e.extension).join(', ')}
                </span>
                <span className="font-data text-xs text-muted shrink-0">{formatBytes(cat.total_bytes)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
};
```

- [ ] **Step 4: Verify + commit**

```bash
npx vitest run && npm run build
git add src/features/file-types
git commit -m "feat(file-types): add file-type breakdown widget"
```

---

### Task 9: Frontend — activity feature (TDD)

**Files:**
- Create: `frontend/src/shared/lib/formatRelativeTime.ts` + `formatRelativeTime.tests.ts`
- Create: `frontend/src/features/activity/activity.types.ts`, `api/changes.ts`, `queries/queryKeys.ts`, `queries/useChanges.ts`, `ui/ActivityFeedWidget.tsx`, `index.ts`
- Test: `frontend/src/features/activity/ui/ActivityFeedWidget.tests.tsx`

- [ ] **Step 1: TDD formatRelativeTime.**

Test:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime } from './formatRelativeTime';

describe('formatRelativeTime', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-06-12T12:00:00Z')));
  afterEach(() => vi.useRealTimers());

  const at = (secondsAgo: number) => Math.floor(Date.now() / 1000) - secondsAgo;

  it('formats seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(at(5))).toBe('5s ago');
    expect(formatRelativeTime(at(90))).toBe('1m ago');
    expect(formatRelativeTime(at(2 * 3600))).toBe('2h ago');
    expect(formatRelativeTime(at(3 * 86400))).toBe('3d ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(formatRelativeTime(at(-30))).toBe('just now');
  });
});
```

Implementation:

```ts
export const formatRelativeTime = (unixSec: number): string => {
  const deltaSec = Math.floor(Date.now() / 1000) - unixSec;
  if (deltaSec < 0) return 'just now';
  if (deltaSec < 60) return `${deltaSec}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
};
```

- [ ] **Step 2: Module scaffolding.**

`activity.types.ts`:

```ts
export type ChangeType = 'added' | 'removed' | 'grown' | 'shrunk';

export interface FileChange {
  id: number;
  path: string;
  change_type: ChangeType;
  bytes_delta: number;
  detected_at: number;
}
```

`api/changes.ts`: `fetchChanges = (): Promise<FileChange[]> => apiClient<FileChange[]>('/changes');`
`queries/queryKeys.ts`: `CHANGES: 'changes'`
`queries/useChanges.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchChanges } from '../api/changes';
import { QueryKeys } from './queryKeys';

// The scanner syncs every 60s; polling at half that keeps the feed fresh
// without hammering the Pi.
const REFETCH_INTERVAL_MS = 30_000;

export const useChanges = () =>
  useQuery({
    queryKey: [QueryKeys.CHANGES],
    queryFn: fetchChanges,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
```

`index.ts`: `export { ActivityFeedWidget } from './ui/ActivityFeedWidget';`

- [ ] **Step 3: Failing widget tests** (mock useChanges):

```tsx
// 'shows a loading skeleton' — role="status" aria-label="Loading recent changes"
// 'shows an error card with retry' — /failed to load recent changes/i + retry → refetch
// 'renders one row per change with type styling' — added/removed/grown rows: paths visible,
//    each row has data-change-type attribute matching its type, sizes formatted via formatBytes(|bytes_delta|)
// 'shows empty state' — [] → /no recent changes/i
```

Write fully.

- [ ] **Step 4: Implement ActivityFeedWidget** — `ui/ActivityFeedWidget.tsx`:

```tsx
import { FilePlus2, FileX2, TrendingDown, TrendingUp } from 'lucide-react';

import { GlassCard } from '@/shared/ui/GlassCard';
import { WidgetError } from '@/shared/ui/WidgetError';
import { formatBytes } from '@/shared/lib/formatBytes';
import { formatRelativeTime } from '@/shared/lib/formatRelativeTime';

import type { ChangeType, FileChange } from '../activity.types';
import { useChanges } from '../queries/useChanges';

const TYPE_STYLE: Record<ChangeType, { icon: typeof FilePlus2; className: string }> = {
  added:   { icon: FilePlus2,    className: 'text-safe' },
  removed: { icon: FileX2,       className: 'text-danger' },
  grown:   { icon: TrendingUp,   className: 'text-warn' },
  shrunk:  { icon: TrendingDown, className: 'text-muted' },
};

const ActivitySkeleton = () => (
  <GlassCard role="status" aria-label="Loading recent changes" className="p-6">
    <div className="skeleton w-32 h-3 mb-4" />
    {[0, 1, 2].map(i => (
      <div key={i} className="skeleton h-4 mb-2.5" />
    ))}
  </GlassCard>
);

const ChangeRow = ({ change }: { change: FileChange }) => {
  const { icon: Icon, className } = TYPE_STYLE[change.change_type];
  return (
    <div data-change-type={change.change_type} className="flex items-center gap-2.5 py-2 min-h-11">
      <Icon size={14} className={`${className} shrink-0`} aria-hidden />
      <span className="font-data text-xs text-ink flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={change.path}>
        {change.path}
      </span>
      <span className="font-data text-[11px] text-muted shrink-0">{formatBytes(Math.abs(change.bytes_delta))}</span>
      <span className="font-data text-[10px] text-dim shrink-0 w-14 text-right">{formatRelativeTime(change.detected_at)}</span>
    </div>
  );
};

export const ActivityFeedWidget = () => {
  const { data, isLoading, isError, refetch } = useChanges();

  if (isLoading) return <ActivitySkeleton />;
  if (isError || !data) {
    return <WidgetError message="Failed to load recent changes. Is the API running?" onRetry={() => refetch()} />;
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-ui text-sm font-semibold tracking-wide text-ink m-0 mb-2">Recent changes</h2>
      {data.length === 0 ? (
        <div className="font-ui text-[13px] text-muted py-4 text-center">No recent changes.</div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--glass-border)]">
          {data.map(change => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </div>
      )}
    </GlassCard>
  );
};
```

- [ ] **Step 5: Verify + commit**

```bash
npx vitest run && npm run build
git add src/shared/lib src/features/activity
git commit -m "feat(activity): add sync activity feed widget"
```

---

### Task 10: Dashboard composition + final verification

**Files:**
- Modify: `frontend/src/pages/dashboard/PageDashboard.tsx` + `PageDashboard.tests.tsx`

- [ ] **Step 1: Compose.** Replace PageDashboard with:

```tsx
import { ActivityFeedWidget } from '@/features/activity';
import { DiskUsageWidget } from '@/features/disk-usage';
import { AddDownloadButton, DownloadsList } from '@/features/downloads';
import { FileTypesWidget } from '@/features/file-types';
import { SpaceMapWidget } from '@/features/space-map';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <SpaceMapWidget />
    <FileTypesWidget />
    <ActivityFeedWidget />
    <DownloadsList />
    <AddDownloadButton />
  </LayoutDashboard>
);
```

- [ ] **Step 2: Extend PageDashboard tests** — mock the three new widget hooks (or the widgets themselves, matching the file's existing approach) and assert all widgets render.

- [ ] **Step 3: Full verification**

```bash
npx vitest run
npm run lint    # zero NEW errors vs baseline
npm run build
cd ../backend && go test ./... && go build ./...
```

- [ ] **Step 4: Manual smoke (if a managed dir is handy)** — `MANAGED_DIR=<dir> go run ./cmd/api` + `npm run dev`: treemap drills and climbs; file-type bar sums to 100%; activity feed populates after touching files and a sync cycle; everything correct in BOTH themes (tokens flip).

- [ ] **Step 5: Commit**

```bash
git add src/pages
git commit -m "feat(dashboard): compose space map, file types, and activity widgets"
```

---

## Spec completion checklist (after this phase, the 2026-06-12 spec is fully delivered)

- Aurora Glass theme (phase 1) ✓ · Browser UX (phase 2) ✓ · Treemap + file types + activity (phase 3) ✓ · top-files endpoint removed (phase 3, Task 1) ✓ · `useThemeTokens` recharts helper (phase 3, Task 6) ✓
