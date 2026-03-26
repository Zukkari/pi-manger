package handler_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
