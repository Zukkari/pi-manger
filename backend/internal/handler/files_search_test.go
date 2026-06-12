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

// seedSearchHandlerTree builds /data → docs/ → note.txt (100B); /data → big.iso (2GB).
func seedSearchHandlerTree(t *testing.T, s *store.Store) {
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
	seedSearchHandlerTree(t, s)

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
	seedSearchHandlerTree(t, s)

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
	seedSearchHandlerTree(t, s)

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
	seedSearchHandlerTree(t, s)

	// No limit param: should succeed with the default (100), not error.
	h := handler.NewFilesHandler(s)
	req := httptest.NewRequest(http.MethodGet, "/api/files?q=.", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
