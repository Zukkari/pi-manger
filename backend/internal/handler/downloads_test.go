package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pi-manager/internal/download"
)

type fakeDownloader struct {
	startErr error
	started  *download.Job
	jobs     []download.Job
	gotURL   string
	gotDir   string
	gotName  string
}

func (f *fakeDownloader) Start(rawURL, dir, name string) (*download.Job, error) {
	f.gotURL, f.gotDir, f.gotName = rawURL, dir, name
	if f.startErr != nil {
		return nil, f.startErr
	}
	return f.started, nil
}

func (f *fakeDownloader) List() []download.Job { return f.jobs }

func TestDownloadsPostReturns202(t *testing.T) {
	fake := &fakeDownloader{started: &download.Job{ID: "abc", Status: download.StatusQueued, URL: "http://x/y", Dir: "d"}}
	h := NewDownloadsHandler(fake)

	body := `{"url":"http://x/y","dir":"d","name":"n"}`
	req := httptest.NewRequest(http.MethodPost, "/api/downloads", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", rec.Code)
	}
	if fake.gotURL != "http://x/y" || fake.gotDir != "d" || fake.gotName != "n" {
		t.Errorf("forwarded args wrong: %q %q %q", fake.gotURL, fake.gotDir, fake.gotName)
	}
	var got map[string]any
	json.NewDecoder(rec.Body).Decode(&got)
	if got["id"] != "abc" || got["status"] != "queued" {
		t.Errorf("body = %v", got)
	}
}

func TestDownloadsPostMalformedBodyReturns400(t *testing.T) {
	h := NewDownloadsHandler(&fakeDownloader{})
	req := httptest.NewRequest(http.MethodPost, "/api/downloads", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestDownloadsPostInvalidReturns422(t *testing.T) {
	fake := &fakeDownloader{startErr: errors.New("url must be http or https")}
	h := NewDownloadsHandler(fake)
	req := httptest.NewRequest(http.MethodPost, "/api/downloads", strings.NewReader(`{"url":"ftp://x","dir":"d"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	var got errorResponse
	json.NewDecoder(rec.Body).Decode(&got)
	if got.Error == "" {
		t.Error("expected error message in body")
	}
}

func TestDownloadsGetListsJobs(t *testing.T) {
	fake := &fakeDownloader{jobs: []download.Job{
		{ID: "a", Name: "f.iso", Status: download.StatusDownloading, BytesDownloaded: 5, TotalBytes: 10},
	}}
	h := NewDownloadsHandler(fake)
	req := httptest.NewRequest(http.MethodGet, "/api/downloads", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []map[string]any
	json.NewDecoder(rec.Body).Decode(&got)
	if len(got) != 1 || got[0]["name"] != "f.iso" || got[0]["bytes_downloaded"].(float64) != 5 {
		t.Errorf("body = %v", got)
	}
}
