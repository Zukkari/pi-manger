package handler_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/store"
)

func TestDeleteFileHandler_NonDELETEReturns405(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewDeleteFileHandler(s)

	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut} {
		req := httptest.NewRequest(method, "/api/files/1", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("method %s: expected 405, got %d", method, w.Code)
		}
	}
}

func TestDeleteFileHandler_InvalidIDReturns400(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewDeleteFileHandler(s)

	req := httptest.NewRequest(http.MethodDelete, "/api/files/notanumber", nil)
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

func TestDeleteFileHandler_NotFoundReturns404(t *testing.T) {
	s := openHandlerStore(t)
	h := handler.NewDeleteFileHandler(s)

	req := httptest.NewRequest(http.MethodDelete, "/api/files/9999", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestDeleteFileHandler_DeletesFileFromFSAndDB(t *testing.T) {
	s := openHandlerStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	// Create a real file on disk.
	dir := t.TempDir()
	filePath := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(filePath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("create file: %v", err)
	}

	id, err := s.UpsertFile(ctx, store.UpsertFileParams{
		Path: filePath, Name: "test.txt", Size: 5,
		ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	h := handler.NewDeleteFileHandler(s)
	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/files/%d", id), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// File must be gone from disk.
	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		t.Error("expected file removed from filesystem")
	}

	// Record must be gone from DB.
	_, err = s.GetFile(ctx, id)
	if err == nil {
		t.Error("expected record removed from DB")
	}
}

func TestDeleteFileHandler_DeletesDirRecursively(t *testing.T) {
	s := openHandlerStore(t)
	ctx := context.Background()
	now := time.Now().Unix()

	// Create a real directory with a child file.
	parent := t.TempDir()
	dirPath := filepath.Join(parent, "subdir")
	if err := os.Mkdir(dirPath, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	childPath := filepath.Join(dirPath, "child.txt")
	if err := os.WriteFile(childPath, []byte("x"), 0o644); err != nil {
		t.Fatalf("create child: %v", err)
	}

	dirID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		Path: dirPath, Name: "subdir", IsDir: 1, ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert dir: %v", err)
	}
	childID, err := s.UpsertFile(ctx, store.UpsertFileParams{
		ParentID: sql.NullInt64{Int64: dirID, Valid: true},
		Path:     childPath, Name: "child.txt", ModifiedAt: now, SyncedAt: now,
	})
	if err != nil {
		t.Fatalf("upsert child: %v", err)
	}

	h := handler.NewDeleteFileHandler(s)
	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/files/%d", dirID), nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Directory and its contents must be gone from disk.
	if _, err := os.Stat(dirPath); !os.IsNotExist(err) {
		t.Error("expected directory removed from filesystem")
	}

	// Child DB record must be gone via cascade.
	_, err = s.GetFile(ctx, childID)
	if err == nil {
		t.Error("expected child record removed from DB via cascade")
	}
}
