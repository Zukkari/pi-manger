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
