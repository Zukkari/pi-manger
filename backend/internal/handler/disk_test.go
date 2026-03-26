package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"pi-manager/internal/handler"
)

func TestDiskHandler_Returns200WithStats(t *testing.T) {
	dir := t.TempDir()

	h := handler.NewDiskHandler(dir)
	req := httptest.NewRequest(http.MethodGet, "/api/disk", nil)
	w := httptest.NewRecorder()

	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	for _, key := range []string{"path", "total_bytes", "used_bytes", "free_bytes", "used_percent"} {
		if _, ok := body[key]; !ok {
			t.Errorf("missing key %q in response", key)
		}
	}

	if body["path"] != dir {
		t.Errorf("expected path %q, got %q", dir, body["path"])
	}
}

func TestDiskHandler_ContentTypeIsJSON(t *testing.T) {
	dir := t.TempDir()

	h := handler.NewDiskHandler(dir)
	req := httptest.NewRequest(http.MethodGet, "/api/disk", nil)
	w := httptest.NewRecorder()

	h.ServeHTTP(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestDiskHandler_Returns500OnBadPath(t *testing.T) {
	h := handler.NewDiskHandler("/this/path/does/not/exist/xyz123")
	req := httptest.NewRequest(http.MethodGet, "/api/disk", nil)
	w := httptest.NewRecorder()

	h.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if _, ok := body["error"]; !ok {
		t.Error("expected 'error' key in 500 response body")
	}
}

func TestDiskHandler_IgnoresNonGETMethods(t *testing.T) {
	dir := t.TempDir()

	h := handler.NewDiskHandler(dir)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/api/disk", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)

		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("method %s: expected 405, got %d", method, w.Code)
		}
	}
}

// Verify MANAGED_DIR env var wiring helper used in main — test the constructor
func TestNewDiskHandler_StoresPath(t *testing.T) {
	dir := t.TempDir()
	h := handler.NewDiskHandler(dir)

	req := httptest.NewRequest(http.MethodGet, "/api/disk", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if body["path"] != dir {
		t.Errorf("handler stored wrong path: got %q, want %q", body["path"], dir)
	}
}
