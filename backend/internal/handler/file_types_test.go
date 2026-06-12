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
