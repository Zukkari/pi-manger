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
