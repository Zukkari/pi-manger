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
		ParentID   *int64  `json:"parent_id"`
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
	// seedHandlerTree creates 6 direct children of /data (movies, photos, extra1-4).
	cases := []struct {
		limit string
		want  int
	}{
		{"0", 1},   // clamped to 1
		{"-5", 1},  // clamped to 1
		{"3", 3},
		{"100", 6}, // clamped to 20, but only 6 children exist
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
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("limit=%s: invalid JSON: %v", c.limit, err)
		}
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
