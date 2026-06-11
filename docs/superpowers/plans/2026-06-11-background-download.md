# Background Download from Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste a URL and have the server download the file in the background into a chosen subfolder of `MANAGED_DIR`, with in-memory job tracking the UI can poll.

**Architecture:** A new `internal/download` package owns an in-memory `Manager` of download `Job`s, each run in its own goroutine that streams the HTTP body to a `<name>.part` file and renames it on success (leaving the `.part` in place on failure). A new `/api/downloads` handler (POST to start, GET to list) exposes jobs. The frontend gets a `features/downloads/` module: a floating `+` button opening a form sheet, a drill-down `FolderPicker` built on the existing `/api/files` tree, and a `DownloadsList` widget polled via React Query.

**Tech Stack:** Go 1.25 (`net/http`, `modernc.org/sqlite`, `github.com/google/uuid`), React + TypeScript + Vite, TanStack Query, Vitest.

---

## File Structure

**Backend (new):**
- `backend/internal/download/download.go` — `Job`, `Status`, `Manager`, `Start`, `List`, the download goroutine.
- `backend/internal/download/names.go` — pure helpers: `lastPathSegment`, `filenameFromContentDisposition`, `uniqueName`, `available`.
- `backend/internal/download/dir.go` — `resolveDir` (traversal-safe) and `validateURL`.
- `backend/internal/download/names_test.go`, `dir_test.go`, `download_test.go` — tests.
- `backend/internal/handler/downloads.go` — `DownloadsHandler` (POST + GET), `Downloader` interface.
- `backend/internal/handler/downloads_test.go` — handler tests.

**Backend (modified):**
- `backend/cmd/api/main.go` — construct the manager, register `/api/downloads`.
- `backend/go.mod` — `github.com/google/uuid` moves from indirect to direct (automatic on `go mod tidy`).

**Frontend (new):** `frontend/src/features/downloads/`
- `downloads.types.ts` — `DownloadJob`, `DownloadStatus`, `CreateDownloadInput`, `FolderEntry`.
- `api/downloads.ts` — `fetchDownloads`, `postDownload`.
- `api/folders.ts` — `fetchFolders`.
- `queries/queryKeys.ts`, `queries/useDownloads.ts`, `queries/useCreateDownload.ts`, `queries/useFolders.ts`.
- `ui/FolderPicker.tsx`, `ui/AddDownloadSheet.tsx`, `ui/AddDownloadButton.tsx`, `ui/DownloadsList.tsx` + matching `*.tests.tsx`.
- `index.ts` — exports `AddDownloadButton`, `DownloadsList`.

**Frontend (modified):**
- `frontend/src/pages/dashboard/PageDashboard.tsx` and `PageDashboard.tests.tsx`.

---

## Task 1: Filename helpers (`names.go`)

**Files:**
- Create: `backend/internal/download/names.go`
- Test: `backend/internal/download/names_test.go`

- [ ] **Step 1: Write the failing test**

```go
package download

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLastPathSegment(t *testing.T) {
	cases := map[string]string{
		"/files/ubuntu.iso":   "ubuntu.iso",
		"/files/sub/":         "sub",
		"/":                   "",
		"":                    "",
		"/a/b/c.tar.gz":       "c.tar.gz",
	}
	for in, want := range cases {
		if got := lastPathSegment(in); got != want {
			t.Errorf("lastPathSegment(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFilenameFromContentDisposition(t *testing.T) {
	cases := map[string]string{
		`attachment; filename="report.pdf"`: "report.pdf",
		`attachment; filename=plain.txt`:    "plain.txt",
		`inline`:                            "",
		``:                                  "",
		`attachment; filename="../etc/x"`:   "x",
	}
	for in, want := range cases {
		if got := filenameFromContentDisposition(in); got != want {
			t.Errorf("filenameFromContentDisposition(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUniqueNameSuffixesCollisions(t *testing.T) {
	dir := t.TempDir()
	if got := uniqueName(dir, "file.iso"); got != "file.iso" {
		t.Fatalf("empty dir: got %q, want file.iso", got)
	}
	if err := os.WriteFile(filepath.Join(dir, "file.iso"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniqueName(dir, "file.iso"); got != "file (1).iso" {
		t.Fatalf("one collision: got %q, want file (1).iso", got)
	}
	// A leftover .part from a prior failed download must also force a new name.
	if err := os.WriteFile(filepath.Join(dir, "file (1).iso.part"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniqueName(dir, "file.iso"); got != "file (2).iso" {
		t.Fatalf("collision vs .part: got %q, want file (2).iso", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/download/ -run 'TestLastPathSegment|TestFilenameFromContentDisposition|TestUniqueName' -v`
Expected: build failure / undefined `lastPathSegment`, `filenameFromContentDisposition`, `uniqueName`.

- [ ] **Step 3: Write minimal implementation**

```go
package download

import (
	"fmt"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// lastPathSegment returns the final path element of a URL path, or "" if none.
func lastPathSegment(p string) string {
	p = strings.TrimRight(p, "/")
	if p == "" {
		return ""
	}
	seg := path.Base(p)
	if seg == "/" || seg == "." {
		return ""
	}
	return seg
}

// filenameFromContentDisposition extracts a base filename from a
// Content-Disposition header value, or "" if none is present.
func filenameFromContentDisposition(v string) string {
	if v == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(v)
	if err != nil {
		return ""
	}
	name := params["filename"]
	if name == "" {
		return ""
	}
	return filepath.Base(name)
}

// available reports whether neither name nor its .part sibling exists in dir.
func available(dir, name string) bool {
	if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, name+".part")); err == nil {
		return false
	}
	return true
}

// uniqueName returns name, or name with a " (n)" suffix before the extension,
// such that neither the final name nor its .part sibling already exists in dir.
func uniqueName(dir, name string) string {
	if available(dir, name) {
		return name
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 1; ; i++ {
		cand := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if available(dir, cand) {
			return cand
		}
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/download/ -run 'TestLastPathSegment|TestFilenameFromContentDisposition|TestUniqueName' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/download/names.go backend/internal/download/names_test.go
git commit -m "feat(download): filename derivation and collision helpers"
```

---

## Task 2: URL validation and destination resolution (`dir.go`)

**Files:**
- Create: `backend/internal/download/dir.go`
- Test: `backend/internal/download/dir_test.go`

- [ ] **Step 1: Write the failing test**

```go
package download

import (
	"path/filepath"
	"testing"
)

func TestValidateURL(t *testing.T) {
	good := []string{"http://example.com/a", "https://example.com/b.iso"}
	for _, u := range good {
		if _, err := validateURL(u); err != nil {
			t.Errorf("validateURL(%q) unexpected error: %v", u, err)
		}
	}
	bad := []string{"ftp://example.com/x", "file:///etc/passwd", "notaurl", "https://"}
	for _, u := range bad {
		if _, err := validateURL(u); err == nil {
			t.Errorf("validateURL(%q) expected error, got nil", u)
		}
	}
}

func TestResolveDirRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	ok, err := resolveDir(root, "downloads/iso")
	if err != nil {
		t.Fatalf("valid dir errored: %v", err)
	}
	if ok != filepath.Join(root, "downloads", "iso") {
		t.Fatalf("got %q", ok)
	}
	for _, bad := range []string{"../escape", "downloads/../../escape", "/etc"} {
		if _, err := resolveDir(root, bad); err == nil {
			t.Errorf("resolveDir(%q) expected error, got nil", bad)
		}
	}
}
```

Note: `resolveDir(root, "/etc")` must stay inside `root` — leading `/` is cleaned to root-relative, so it resolves to `root/etc`, which is valid (inside root). Adjust the expectation: `/etc` is NOT an escape. Replace the bad slice with `{"../escape", "downloads/../../escape"}` and add a separate positive check that `/etc` resolves under root.

Use this corrected test body for `TestResolveDirRejectsTraversal`:

```go
func TestResolveDirRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	ok, err := resolveDir(root, "downloads/iso")
	if err != nil {
		t.Fatalf("valid dir errored: %v", err)
	}
	if ok != filepath.Join(root, "downloads", "iso") {
		t.Fatalf("got %q", ok)
	}
	// A leading slash is treated as root-relative, not an escape.
	if got, err := resolveDir(root, "/etc"); err != nil || got != filepath.Join(root, "etc") {
		t.Fatalf("resolveDir(root, \"/etc\") = %q, %v", got, err)
	}
	for _, bad := range []string{"../escape", "downloads/../../escape", "a/../../../b"} {
		if _, err := resolveDir(root, bad); err == nil {
			t.Errorf("resolveDir(%q) expected error, got nil", bad)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/download/ -run 'TestValidateURL|TestResolveDir' -v`
Expected: undefined `validateURL`, `resolveDir`.

- [ ] **Step 3: Write minimal implementation**

```go
package download

import (
	"errors"
	"net/url"
	"path/filepath"
	"strings"
)

var (
	errBadScheme = errors.New("url must be http or https")
	errBadURL    = errors.New("invalid url")
	errBadDir    = errors.New("destination escapes managed directory")
)

// validateURL parses raw and requires an http/https scheme with a host.
func validateURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, errBadURL
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errBadScheme
	}
	if u.Host == "" {
		return nil, errBadURL
	}
	return u, nil
}

// resolveDir joins a user-supplied relative dir onto managedDir, rejecting any
// path that escapes managedDir via "..". A leading slash is treated as
// root-relative (cleaned against "/"), so it cannot escape.
func resolveDir(managedDir, dir string) (string, error) {
	cleaned := filepath.Clean("/" + dir)
	full := filepath.Join(managedDir, cleaned)
	rel, err := filepath.Rel(managedDir, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errBadDir
	}
	return full, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/download/ -run 'TestValidateURL|TestResolveDir' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/download/dir.go backend/internal/download/dir_test.go
git commit -m "feat(download): url validation and traversal-safe dir resolution"
```

---

## Task 3: Manager and download goroutine (`download.go`)

**Files:**
- Create: `backend/internal/download/download.go`
- Test: `backend/internal/download/download_test.go`

- [ ] **Step 1: Write the failing test**

```go
package download

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func waitFor(t *testing.T, m *Manager, id string, want Status) Job {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, j := range m.List() {
			if j.ID == id && j.Status == want {
				return j
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job %s did not reach status %q in time", id, want)
	return Job{}
}

func TestManagerDownloadsFile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "5")
		w.Write([]byte("hello"))
	}))
	defer srv.Close()

	root := t.TempDir()
	m := NewManager(root, srv.Client())

	job, err := m.Start(srv.URL+"/data/file.bin", "downloads", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	done := waitFor(t, m, job.ID, StatusCompleted)

	if done.Name != "file.bin" {
		t.Errorf("name = %q, want file.bin", done.Name)
	}
	if done.BytesDownloaded != 5 || done.TotalBytes != 5 {
		t.Errorf("bytes = %d/%d, want 5/5", done.BytesDownloaded, done.TotalBytes)
	}
	got, err := os.ReadFile(filepath.Join(root, "downloads", "file.bin"))
	if err != nil || string(got) != "hello" {
		t.Errorf("file content = %q, err = %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(root, "downloads", "file.bin.part")); !os.IsNotExist(err) {
		t.Errorf(".part file should be gone after success")
	}
}

func TestManagerOverrideName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("data"))
	}))
	defer srv.Close()
	root := t.TempDir()
	m := NewManager(root, srv.Client())
	job, _ := m.Start(srv.URL+"/x.bin", "", "custom.txt")
	done := waitFor(t, m, job.ID, StatusCompleted)
	if done.Name != "custom.txt" {
		t.Errorf("name = %q, want custom.txt", done.Name)
	}
}

func TestManagerLeavesPartFileOnFailure(t *testing.T) {
	// Server advertises 10 bytes but sends 3 then hangs up -> copy fails.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "10")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("abc"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		panic("abort") // crashes the handler connection mid-body
	}))
	defer srv.Close()

	root := t.TempDir()
	m := NewManager(root, srv.Client())
	job, err := m.Start(srv.URL+"/big.iso", "d", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	failed := waitFor(t, m, job.ID, StatusFailed)
	if failed.Err == "" {
		t.Error("failed job should carry an error message")
	}
	if _, err := os.Stat(filepath.Join(root, "d", "big.iso.part")); err != nil {
		t.Errorf(".part file must remain after failure: %v", err)
	}
}

func TestManagerStartRejectsBadInput(t *testing.T) {
	m := NewManager(t.TempDir(), http.DefaultClient)
	if _, err := m.Start("ftp://x/y", "d", ""); err == nil {
		t.Error("bad scheme should error")
	}
	if _, err := m.Start("http://x/y", "../escape", ""); err == nil {
		t.Error("traversal dir should error")
	}
}

func TestListNewestFirst(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("x"))
	}))
	defer srv.Close()
	m := NewManager(t.TempDir(), srv.Client())
	j1, _ := m.Start(srv.URL+"/1", "", "")
	j2, _ := m.Start(srv.URL+"/2", "", "")
	list := m.List()
	if len(list) < 2 || list[0].ID != j2.ID || list[1].ID != j1.ID {
		t.Errorf("expected newest-first ordering: got %+v", list)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/download/ -run TestManager -v`
Expected: undefined `NewManager`, `Manager`, `Job`, `Status`, etc.

- [ ] **Step 3: Write minimal implementation**

```go
package download

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Status is the lifecycle state of a download job.
type Status string

const (
	StatusQueued      Status = "queued"
	StatusDownloading Status = "downloading"
	StatusCompleted   Status = "completed"
	StatusFailed      Status = "failed"
)

// downloadTimeout is a generous backstop against permanently stuck connections.
const downloadTimeout = 6 * time.Hour

// Job is a single background download. All fields are read via Manager.List,
// which returns copies; mutate only through Manager.update.
type Job struct {
	ID              string
	URL             string
	Dir             string
	Name            string
	Status          Status
	BytesDownloaded int64
	TotalBytes      int64
	Err             string
	CreatedAt       int64
	FinishedAt      int64
	seq             int64
}

// Manager owns all download jobs in memory.
type Manager struct {
	managedDir string
	client     *http.Client

	mu      sync.RWMutex
	jobs    map[string]*Job
	nextSeq int64
}

// NewManager creates a Manager that downloads into subfolders of managedDir
// using the given HTTP client.
func NewManager(managedDir string, client *http.Client) *Manager {
	return &Manager{
		managedDir: managedDir,
		client:     client,
		jobs:       make(map[string]*Job),
	}
}

// Start validates the request, registers a queued job, and runs it in the
// background. It returns an error (and no job) when url or dir is invalid.
func (m *Manager) Start(rawURL, dir, name string) (*Job, error) {
	u, err := validateURL(rawURL)
	if err != nil {
		return nil, err
	}
	if _, err := resolveDir(m.managedDir, dir); err != nil {
		return nil, err
	}

	provisional := name
	if provisional == "" {
		provisional = lastPathSegment(u.Path)
	}

	m.mu.Lock()
	m.nextSeq++
	job := &Job{
		ID:        uuid.NewString(),
		URL:       rawURL,
		Dir:       dir,
		Name:      provisional,
		Status:    StatusQueued,
		CreatedAt: time.Now().Unix(),
		seq:       m.nextSeq,
	}
	m.jobs[job.ID] = job
	snapshot := *job
	m.mu.Unlock()

	go m.run(job.ID, u, dir, name)
	return &snapshot, nil
}

// List returns copies of all jobs, newest first.
func (m *Manager) List() []Job {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Job, 0, len(m.jobs))
	for _, j := range m.jobs {
		out = append(out, *j)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].seq > out[j].seq })
	return out
}

func (m *Manager) update(id string, fn func(*Job)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j := m.jobs[id]; j != nil {
		fn(j)
	}
}

func (m *Manager) fail(id string, err error) {
	m.update(id, func(j *Job) {
		j.Status = StatusFailed
		j.Err = err.Error()
		j.FinishedAt = time.Now().Unix()
	})
}

func (m *Manager) run(id string, u *url.URL, dir, override string) {
	destDir, err := resolveDir(m.managedDir, dir)
	if err != nil {
		m.fail(id, err)
		return
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		m.fail(id, err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), downloadTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		m.fail(id, err)
		return
	}
	resp, err := m.client.Do(req)
	if err != nil {
		m.fail(id, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		m.fail(id, fmt.Errorf("unexpected status %d", resp.StatusCode))
		return
	}

	name := override
	if name == "" {
		name = lastPathSegment(u.Path)
	}
	if name == "" {
		name = filenameFromContentDisposition(resp.Header.Get("Content-Disposition"))
	}
	if name == "" {
		name = "download"
	}
	name = uniqueName(destDir, name)

	m.update(id, func(j *Job) {
		j.Name = name
		j.Status = StatusDownloading
		if resp.ContentLength > 0 {
			j.TotalBytes = resp.ContentLength
		}
	})

	partPath := filepath.Join(destDir, name+".part")
	f, err := os.Create(partPath)
	if err != nil {
		m.fail(id, err)
		return
	}
	pw := &progressWriter{m: m, id: id}
	_, copyErr := io.Copy(io.MultiWriter(f, pw), resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		m.fail(id, copyErr) // leave the .part file in place for manual cleanup
		return
	}
	if closeErr != nil {
		m.fail(id, closeErr)
		return
	}
	if err := os.Rename(partPath, filepath.Join(destDir, name)); err != nil {
		m.fail(id, err)
		return
	}
	m.update(id, func(j *Job) {
		j.Status = StatusCompleted
		j.FinishedAt = time.Now().Unix()
	})
}

type progressWriter struct {
	m  *Manager
	id string
}

func (w *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.m.update(w.id, func(j *Job) { j.BytesDownloaded += int64(n) })
	return n, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go mod tidy && go test ./internal/download/ -v`
Expected: PASS (all download package tests). `go mod tidy` promotes `github.com/google/uuid` to a direct dependency.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/download/download.go backend/internal/download/download_test.go backend/go.mod backend/go.sum
git commit -m "feat(download): in-memory job manager with background downloader"
```

---

## Task 4: HTTP handler (`downloads.go`)

**Files:**
- Create: `backend/internal/handler/downloads.go`
- Test: `backend/internal/handler/downloads_test.go`

- [ ] **Step 1: Write the failing test**

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/handler/ -run TestDownloads -v`
Expected: undefined `NewDownloadsHandler`.

- [ ] **Step 3: Write minimal implementation**

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"pi-manager/internal/download"
)

// Downloader is the subset of download.Manager the handler needs.
type Downloader interface {
	Start(rawURL, dir, name string) (*download.Job, error)
	List() []download.Job
}

// DownloadsHandler handles POST and GET /api/downloads.
type DownloadsHandler struct {
	mgr Downloader
}

// NewDownloadsHandler creates a handler backed by the given download manager.
func NewDownloadsHandler(mgr Downloader) *DownloadsHandler {
	return &DownloadsHandler{mgr: mgr}
}

type createDownloadRequest struct {
	URL  string `json:"url"`
	Dir  string `json:"dir"`
	Name string `json:"name"`
}

type downloadResponse struct {
	ID              string `json:"id"`
	URL             string `json:"url"`
	Dir             string `json:"dir"`
	Name            string `json:"name"`
	Status          string `json:"status"`
	BytesDownloaded int64  `json:"bytes_downloaded"`
	TotalBytes      int64  `json:"total_bytes"`
	Error           string `json:"error"`
	CreatedAt       int64  `json:"created_at"`
	FinishedAt      int64  `json:"finished_at"`
}

func toDownloadResponse(j download.Job) downloadResponse {
	return downloadResponse{
		ID:              j.ID,
		URL:             j.URL,
		Dir:             j.Dir,
		Name:            j.Name,
		Status:          string(j.Status),
		BytesDownloaded: j.BytesDownloaded,
		TotalBytes:      j.TotalBytes,
		Error:           j.Err,
		CreatedAt:       j.CreatedAt,
		FinishedAt:      j.FinishedAt,
	}
}

func (h *DownloadsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.create(w, r)
	case http.MethodGet:
		h.list(w, r)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", "GET, POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("downloads: encode 405: %v", err)
		}
	}
}

func (h *DownloadsHandler) create(w http.ResponseWriter, r *http.Request) {
	var req createDownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "malformed request body"}); err != nil {
			log.Printf("downloads: encode 400: %v", err)
		}
		return
	}

	job, err := h.mgr.Start(req.URL, req.Dir, req.Name)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("downloads: encode 422: %v", err)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	if err := json.NewEncoder(w).Encode(toDownloadResponse(*job)); err != nil {
		log.Printf("downloads: encode 202: %v", err)
	}
}

func (h *DownloadsHandler) list(w http.ResponseWriter, _ *http.Request) {
	jobs := h.mgr.List()
	resp := make([]downloadResponse, 0, len(jobs))
	for _, j := range jobs {
		resp = append(resp, toDownloadResponse(j))
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("downloads: encode list: %v", err)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/handler/ -run TestDownloads -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handler/downloads.go backend/internal/handler/downloads_test.go
git commit -m "feat(download): /api/downloads handler for create and list"
```

---

## Task 5: Wire the manager into `main.go`

**Files:**
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Add the import**

In the import block of `backend/cmd/api/main.go`, add `"net/http"` is already present; add the download package:

```go
	"pi-manager/internal/download"
	"pi-manager/internal/handler"
	"pi-manager/internal/scanner"
	"pi-manager/internal/store"
```

- [ ] **Step 2: Construct the manager and register the route**

Replace the route registration block (currently lines registering disk/files) so it reads:

```go
	downloads := download.NewManager(managedDir, &http.Client{})

	mux := http.NewServeMux()
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))
	mux.Handle("/api/files/top", handler.NewTopFilesHandler(db))
	mux.Handle("/api/files", handler.NewFilesHandler(db))
	mux.Handle("/api/files/", handler.NewDeleteFileHandler(db))
	mux.Handle("/api/downloads", handler.NewDownloadsHandler(downloads))
```

- [ ] **Step 3: Build the backend**

Run: `cd backend && go build ./...`
Expected: no output (success).

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && go test ./...`
Expected: all packages PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat(download): register /api/downloads in the server"
```

---

## Task 6: Frontend types and API

**Files:**
- Create: `frontend/src/features/downloads/downloads.types.ts`
- Create: `frontend/src/features/downloads/api/downloads.ts`
- Create: `frontend/src/features/downloads/api/folders.ts`

- [ ] **Step 1: Write the types**

`frontend/src/features/downloads/downloads.types.ts`:

```ts
export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface DownloadJob {
  id: string;
  url: string;
  dir: string;
  name: string;
  status: DownloadStatus;
  bytes_downloaded: number;
  total_bytes: number;
  error: string;
  created_at: number;
  finished_at: number;
}

export interface CreateDownloadInput {
  url: string;
  dir: string;
  name?: string;
}

export interface FolderEntry {
  id: number;
  name: string;
}
```

- [ ] **Step 2: Write the downloads API**

`frontend/src/features/downloads/api/downloads.ts`:

```ts
import { apiClient } from '@/shared/api/client';

import type { CreateDownloadInput, DownloadJob } from '../downloads.types';

export const fetchDownloads = (): Promise<DownloadJob[]> => apiClient<DownloadJob[]>('/downloads');

// postDownload uses fetch directly (not apiClient) so it can surface the
// server's validation message from a 422 response body to the form.
export const postDownload = async (input: CreateDownloadInput): Promise<DownloadJob> => {
  const response = await fetch('/api/downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<DownloadJob>;
};
```

- [ ] **Step 3: Write the folders API**

`frontend/src/features/downloads/api/folders.ts`:

```ts
import { apiClient } from '@/shared/api/client';

import type { FolderEntry } from '../downloads.types';

interface FileApiEntry {
  id: number;
  name: string;
  is_dir: boolean;
}

// fetchFolders returns only the directory children of the given folder, using
// the existing /api/files tree endpoint. Pass undefined for the root.
export const fetchFolders = async (parentId?: number): Promise<FolderEntry[]> => {
  const path = parentId !== undefined ? `/files?parent_id=${parentId}` : '/files';
  const entries = await apiClient<FileApiEntry[]>(path);
  return entries.filter(e => e.is_dir).map(e => ({ id: e.id, name: e.name }));
};
```

- [ ] **Step 4: Type-check (full build — project uses `tsc -b` references)**

Run: `cd frontend && npm run build`
Expected: `tsc -b` and Vite build succeed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/downloads.types.ts frontend/src/features/downloads/api
git commit -m "feat(downloads): frontend types and api clients"
```

---

## Task 7: React Query hooks

**Files:**
- Create: `frontend/src/features/downloads/queries/queryKeys.ts`
- Create: `frontend/src/features/downloads/queries/useDownloads.ts`
- Create: `frontend/src/features/downloads/queries/useCreateDownload.ts`
- Create: `frontend/src/features/downloads/queries/useFolders.ts`

- [ ] **Step 1: Write the query keys**

`frontend/src/features/downloads/queries/queryKeys.ts`:

```ts
export const QueryKeys = {
  DOWNLOADS: 'downloads',
  FOLDERS: 'folders',
} as const;
```

- [ ] **Step 2: Write `useDownloads` (polls while any job is active)**

`frontend/src/features/downloads/queries/useDownloads.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchDownloads } from '../api/downloads';
import type { DownloadJob } from '../downloads.types';
import { QueryKeys } from './queryKeys';

const POLL_INTERVAL_MS = 1500;

const hasActiveJob = (jobs: DownloadJob[] | undefined): boolean =>
  jobs?.some(job => job.status === 'queued' || job.status === 'downloading') ?? false;

export const useDownloads = () =>
  useQuery({
    queryKey: [QueryKeys.DOWNLOADS],
    queryFn: fetchDownloads,
    refetchInterval: query => (hasActiveJob(query.state.data) ? POLL_INTERVAL_MS : false),
  });
```

- [ ] **Step 3: Write `useCreateDownload`**

`frontend/src/features/downloads/queries/useCreateDownload.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { postDownload } from '../api/downloads';
import { QueryKeys } from './queryKeys';

export const useCreateDownload = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.DOWNLOADS] });
    },
  });
};
```

- [ ] **Step 4: Write `useFolders`**

`frontend/src/features/downloads/queries/useFolders.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchFolders } from '../api/folders';
import { QueryKeys } from './queryKeys';

export const useFolders = (parentId?: number) =>
  useQuery({
    queryKey: [QueryKeys.FOLDERS, parentId ?? null],
    queryFn: () => fetchFolders(parentId),
  });
```

- [ ] **Step 5: Type-check and commit**

Run: `cd frontend && npm run build`
Expected: `tsc -b` and Vite build succeed.

```bash
git add frontend/src/features/downloads/queries
git commit -m "feat(downloads): react-query hooks for jobs, create, and folders"
```

---

## Task 8: `FolderPicker` component

**Files:**
- Create: `frontend/src/features/downloads/ui/FolderPicker.tsx`
- Test: `frontend/src/features/downloads/ui/FolderPicker.tests.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/downloads/ui/FolderPicker.tests.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as foldersHook from '../queries/useFolders';

import { FolderPicker } from './FolderPicker';

vi.mock('../queries/useFolders');
const mockUseFolders = vi.spyOn(foldersHook, 'useFolders');

beforeEach(() => {
  mockUseFolders.mockReset();
});

describe('FolderPicker', () => {
  it('lists folders and selects the current path on Use', () => {
    mockUseFolders.mockReturnValue({
      data: [{ id: 1, name: 'downloads' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /use this folder/i }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('accumulates the relative path as the user drills in', () => {
    mockUseFolders.mockReturnValue({
      data: [{ id: 1, name: 'downloads' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /downloads/ }));
    fireEvent.click(screen.getByRole('button', { name: /use this folder/i }));
    expect(onSelect).toHaveBeenCalledWith('downloads');
  });

  it('creates a subfolder under the current path', () => {
    mockUseFolders.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof foldersHook.useFolders>);

    const onSelect = vi.fn();
    render(<FolderPicker onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/new subfolder/i), { target: { value: 'iso' } });
    fireEvent.click(screen.getByRole('button', { name: /create & use/i }));
    expect(onSelect).toHaveBeenCalledWith('iso');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/FolderPicker.tests.tsx`
Expected: FAIL — cannot find `./FolderPicker`.

- [ ] **Step 3: Write the implementation**

`frontend/src/features/downloads/ui/FolderPicker.tsx`:

```tsx
import { useState } from 'react';

import { useFolders } from '../queries/useFolders';

interface Crumb {
  id: number;
  name: string;
}

interface FolderPickerProps {
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

const joinPath = (crumbs: Crumb[], extra?: string): string => {
  const parts = crumbs.map(c => c.name);
  if (extra) parts.push(extra);
  return parts.join('/');
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 8px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--paper-border)',
  fontFamily: 'var(--font-data)',
  fontSize: '13px',
  color: 'var(--paper-text)',
  cursor: 'pointer',
};

export const FolderPicker = ({ onSelect, onClose }: FolderPickerProps) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const currentParentId = crumbs.length === 0 ? undefined : crumbs[crumbs.length - 1].id;
  const { data, isLoading, isError } = useFolders(currentParentId);

  const relativePath = joinPath(crumbs);

  return (
    <div style={{ fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setCrumbs(prev => prev.slice(0, -1))}
          disabled={crumbs.length === 0}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--paper-muted)' }}
        >
          ◂ Back
        </button>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-muted)' }}>
          /{relativePath}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--paper-muted)' }}
        >
          ✕
        </button>
      </div>

      {isLoading && <div style={{ padding: '20px', color: 'var(--paper-muted)' }}>Loading…</div>}
      {isError && <div style={{ padding: '20px', color: 'var(--paper-danger)' }}>Couldn&apos;t load folders.</div>}

      {data?.map(folder => (
        <button
          key={folder.id}
          type="button"
          style={ROW_STYLE}
          onClick={() => setCrumbs(prev => [...prev, { id: folder.id, name: folder.name }])}
        >
          <span>📁 {folder.name}</span>
          <span>▸</span>
        </button>
      ))}
      {data?.length === 0 && !isLoading && (
        <div style={{ padding: '16px 8px', color: 'var(--paper-dim)', fontSize: '13px' }}>No subfolders here.</div>
      )}

      <div style={{ marginTop: '16px', borderTop: '1px dashed var(--paper-border)', paddingTop: '12px' }}>
        <input
          value={newFolder}
          onChange={e => setNewFolder(e.target.value)}
          placeholder="New subfolder name…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 11px',
            border: '1px solid var(--paper-border)',
            borderRadius: '8px',
            marginBottom: '10px',
            fontFamily: 'var(--font-ui)',
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onSelect(joinPath(crumbs, newFolder.trim()))}
            disabled={newFolder.trim() === ''}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--paper-border-bold)', background: 'var(--paper-surface)', cursor: 'pointer' }}
          >
            Create &amp; use
          </button>
          <button
            type="button"
            onClick={() => onSelect(relativePath)}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'var(--paper-accent)', color: '#fff', cursor: 'pointer' }}
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/FolderPicker.tests.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/ui/FolderPicker.tsx frontend/src/features/downloads/ui/FolderPicker.tests.tsx
git commit -m "feat(downloads): drill-down folder picker"
```

---

## Task 9: `AddDownloadSheet` and `AddDownloadButton`

**Files:**
- Create: `frontend/src/features/downloads/ui/AddDownloadSheet.tsx`
- Create: `frontend/src/features/downloads/ui/AddDownloadButton.tsx`
- Test: `frontend/src/features/downloads/ui/AddDownloadSheet.tests.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/downloads/ui/AddDownloadSheet.tests.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as createHook from '../queries/useCreateDownload';
import * as foldersHook from '../queries/useFolders';

import { AddDownloadSheet } from './AddDownloadSheet';

vi.mock('../queries/useCreateDownload');
vi.mock('../queries/useFolders');

const mockUseCreate = vi.spyOn(createHook, 'useCreateDownload');
const mockUseFolders = vi.spyOn(foldersHook, 'useFolders');

beforeEach(() => {
  mockUseFolders.mockReturnValue({ data: [], isLoading: false, isError: false } as ReturnType<typeof foldersHook.useFolders>);
});

describe('AddDownloadSheet', () => {
  it('submits the url and selected folder', () => {
    const mutate = vi.fn();
    mockUseCreate.mockReturnValue({ mutate, isPending: false, isError: false, error: null } as unknown as ReturnType<typeof createHook.useCreateDownload>);

    render(<AddDownloadSheet onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/paste link/i), { target: { value: 'https://x/y.iso' } });
    fireEvent.click(screen.getByRole('button', { name: /start download/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x/y.iso', dir: '' }),
      expect.anything(),
    );
  });

  it('shows a validation error from the mutation', () => {
    mockUseCreate.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new Error('url must be http or https'),
    } as unknown as ReturnType<typeof createHook.useCreateDownload>);

    render(<AddDownloadSheet onClose={vi.fn()} />);
    expect(screen.getByText('url must be http or https')).toBeInTheDocument();
  });

  it('disables submit when the url is empty', () => {
    mockUseCreate.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null } as unknown as ReturnType<typeof createHook.useCreateDownload>);
    render(<AddDownloadSheet onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /start download/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/AddDownloadSheet.tests.tsx`
Expected: FAIL — cannot find `./AddDownloadSheet`.

- [ ] **Step 3: Write `AddDownloadSheet`**

`frontend/src/features/downloads/ui/AddDownloadSheet.tsx`:

```tsx
import { useState } from 'react';

import { useCreateDownload } from '../queries/useCreateDownload';

import { FolderPicker } from './FolderPicker';

interface AddDownloadSheetProps {
  onClose: () => void;
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: 'var(--paper-bg)',
  backgroundImage: 'var(--paper-bg-texture)',
  display: 'flex',
  flexDirection: 'column',
};

const PANEL_STYLE: React.CSSProperties = {
  maxWidth: '440px',
  width: '100%',
  margin: '0 auto',
  padding: '20px',
  boxSizing: 'border-box',
};

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 11px',
  border: '1px solid var(--paper-border)',
  borderRadius: '8px',
  marginBottom: '13px',
  fontFamily: 'var(--font-ui)',
  fontSize: '14px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--paper-muted)',
  margin: '0 0 5px',
};

export const AddDownloadSheet = ({ onClose }: AddDownloadSheetProps) => {
  const [url, setUrl] = useState('');
  const [dir, setDir] = useState('');
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const { mutate, isPending, isError, error } = useCreateDownload();

  const handleSubmit = () => {
    mutate(
      { url: url.trim(), dir, name: name.trim() || undefined },
      { onSuccess: onClose },
    );
  };

  if (picking) {
    return (
      <div style={OVERLAY_STYLE}>
        <div style={PANEL_STYLE}>
          <FolderPicker
            onSelect={selected => {
              setDir(selected);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={OVERLAY_STYLE}>
      <header
        style={{
          borderBottom: '3px solid var(--paper-text)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '20px',
        }}
      >
        <span>Add Download</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--paper-muted)' }}>
          ✕
        </button>
      </header>

      <div style={PANEL_STYLE}>
        <p style={LABEL_STYLE}>Link</p>
        <input style={FIELD_STYLE} placeholder="Paste link (https://…)" value={url} onChange={e => setUrl(e.target.value)} />

        <p style={LABEL_STYLE}>Destination folder</p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          style={{ ...FIELD_STYLE, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '13px' }}>/{dir}</span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--paper-accent)' }}>CHANGE ▸</span>
        </button>

        <p style={LABEL_STYLE}>File name — optional</p>
        <input style={FIELD_STYLE} placeholder="Leave blank to use the link's name" value={name} onChange={e => setName(e.target.value)} />

        {isError && (
          <p style={{ color: 'var(--paper-danger)', fontSize: '13px', margin: '0 0 12px' }}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={url.trim() === '' || isPending}
          style={{
            width: '100%',
            padding: '12px',
            border: 'none',
            borderRadius: '8px',
            background: 'var(--paper-accent)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '16px',
            cursor: 'pointer',
            opacity: url.trim() === '' || isPending ? 0.5 : 1,
          }}
        >
          {isPending ? 'Starting…' : 'Start Download'}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/AddDownloadSheet.tests.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `AddDownloadButton`**

`frontend/src/features/downloads/ui/AddDownloadButton.tsx` (no query hooks here, so it needs no provider until opened):

```tsx
import { useState } from 'react';

import { AddDownloadSheet } from './AddDownloadSheet';

export const AddDownloadButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Add download"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--paper-accent)',
          color: '#fff',
          fontSize: '28px',
          lineHeight: '52px',
          cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
          zIndex: 40,
        }}
      >
        +
      </button>
      {open && <AddDownloadSheet onClose={() => setOpen(false)} />}
    </>
  );
};
```

- [ ] **Step 6: Type-check and commit**

Run: `cd frontend && npm run build`
Expected: `tsc -b` and Vite build succeed.

```bash
git add frontend/src/features/downloads/ui/AddDownloadSheet.tsx frontend/src/features/downloads/ui/AddDownloadSheet.tests.tsx frontend/src/features/downloads/ui/AddDownloadButton.tsx
git commit -m "feat(downloads): add-download sheet and floating button"
```

---

## Task 10: `DownloadsList` widget

**Files:**
- Create: `frontend/src/features/downloads/ui/DownloadsList.tsx`
- Test: `frontend/src/features/downloads/ui/DownloadsList.tests.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/downloads/ui/DownloadsList.tests.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as downloadsHook from '../queries/useDownloads';
import type { DownloadJob } from '../downloads.types';

import { DownloadsList } from './DownloadsList';

vi.mock('../queries/useDownloads');
const mockUseDownloads = vi.spyOn(downloadsHook, 'useDownloads');

const job = (over: Partial<DownloadJob>): DownloadJob => ({
  id: 'a',
  url: 'http://x/y',
  dir: 'd',
  name: 'file.iso',
  status: 'downloading',
  bytes_downloaded: 5,
  total_bytes: 10,
  error: '',
  created_at: 1,
  finished_at: 0,
  ...over,
});

beforeEach(() => mockUseDownloads.mockReset());

describe('DownloadsList', () => {
  it('renders a progress bar for an active download', () => {
    mockUseDownloads.mockReturnValue({ data: [job({})], isLoading: false, isError: false } as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText('file.iso')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows the error message for a failed download', () => {
    mockUseDownloads.mockReturnValue({
      data: [job({ status: 'failed', error: 'unexpected status 404' })],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText('unexpected status 404')).toBeInTheDocument();
  });

  it('renders nothing notable when there are no downloads', () => {
    mockUseDownloads.mockReturnValue({ data: [], isLoading: false, isError: false } as ReturnType<typeof downloadsHook.useDownloads>);
    render(<DownloadsList />);
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/DownloadsList.tests.tsx`
Expected: FAIL — cannot find `./DownloadsList`.

- [ ] **Step 3: Write the implementation**

`frontend/src/features/downloads/ui/DownloadsList.tsx`:

```tsx
import type { DownloadJob } from '../downloads.types';
import { useDownloads } from '../queries/useDownloads';

const CONTAINER_STYLE: React.CSSProperties = {
  background: 'var(--paper-surface)',
  border: '1px solid var(--paper-border)',
  boxShadow: '3px 3px 0 var(--paper-border-bold)',
  padding: '24px',
};

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontSize: '16px',
  margin: '0 0 16px',
};

const percent = (job: DownloadJob): number =>
  job.total_bytes > 0 ? Math.min(100, Math.round((job.bytes_downloaded / job.total_bytes) * 100)) : 0;

const STATUS_COLOR: Record<DownloadJob['status'], string> = {
  queued: 'var(--paper-muted)',
  downloading: 'var(--paper-muted)',
  completed: 'var(--paper-safe)',
  failed: 'var(--paper-danger)',
};

const DownloadRow = ({ job }: { job: DownloadJob }) => (
  <div style={{ marginBottom: '14px', fontFamily: 'var(--font-ui)', fontSize: '13px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{job.name || job.url}</span>
      <span style={{ color: STATUS_COLOR[job.status], fontFamily: 'var(--font-data)', fontSize: '11px' }}>
        {job.status === 'downloading' && job.total_bytes > 0 ? `${percent(job)}%` : job.status}
      </span>
    </div>
    {(job.status === 'downloading' || job.status === 'queued') && (
      <div
        role="progressbar"
        aria-valuenow={percent(job)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: '6px', background: 'var(--paper-border)', borderRadius: '3px', marginTop: '5px', overflow: 'hidden' }}
      >
        <div style={{ height: '6px', width: `${percent(job)}%`, background: 'var(--paper-safe)', borderRadius: '3px' }} />
      </div>
    )}
    {job.status === 'failed' && job.error && (
      <div style={{ color: 'var(--paper-danger)', fontSize: '12px', marginTop: '4px' }}>{job.error}</div>
    )}
  </div>
);

export const DownloadsList = () => {
  const { data, isLoading, isError } = useDownloads();

  return (
    <div style={CONTAINER_STYLE}>
      <h2 style={HEADING_STYLE}>Downloads</h2>
      {isLoading && <div style={{ color: 'var(--paper-muted)', fontSize: '13px' }}>Loading…</div>}
      {isError && <div style={{ color: 'var(--paper-danger)', fontSize: '13px' }}>Couldn&apos;t load downloads.</div>}
      {data?.length === 0 && <div style={{ color: 'var(--paper-dim)', fontSize: '13px' }}>No downloads yet.</div>}
      {data?.map(job => <DownloadRow key={job.id} job={job} />)}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/features/downloads/ui/DownloadsList.tests.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/ui/DownloadsList.tsx frontend/src/features/downloads/ui/DownloadsList.tests.tsx
git commit -m "feat(downloads): downloads list widget with progress"
```

---

## Task 11: Feature barrel and dashboard wiring

**Files:**
- Create: `frontend/src/features/downloads/index.ts`
- Modify: `frontend/src/pages/dashboard/PageDashboard.tsx`
- Modify: `frontend/src/pages/dashboard/PageDashboard.tests.tsx`

- [ ] **Step 1: Write the barrel**

`frontend/src/features/downloads/index.ts`:

```ts
export { AddDownloadButton } from './ui/AddDownloadButton';
export { DownloadsList } from './ui/DownloadsList';
```

- [ ] **Step 2: Update the dashboard page**

`frontend/src/pages/dashboard/PageDashboard.tsx`:

```tsx
import { DiskUsageWidget } from '@/features/disk-usage';
import { AddDownloadButton, DownloadsList } from '@/features/downloads';
import { LargestFilesWidget } from '@/features/largest-files';
import { LayoutDashboard } from '@/layouts/LayoutDashboard';
import { PageHeading } from '@/shared/ui/PageHeading';

export const PageDashboard = () => (
  <LayoutDashboard>
    <PageHeading>Dashboard</PageHeading>
    <DiskUsageWidget />
    <DownloadsList />
    <LargestFilesWidget />
    <AddDownloadButton />
  </LayoutDashboard>
);
```

- [ ] **Step 3: Update the page test to mock `useDownloads`**

In `frontend/src/pages/dashboard/PageDashboard.tests.tsx`, add the mock alongside the existing ones. Add this import with the other feature-hook imports:

```tsx
import * as downloadsHook from '@/features/downloads/queries/useDownloads';
```

Add this mock with the other `vi.mock` calls:

```tsx
vi.mock('@/features/downloads/queries/useDownloads');
```

Add this spy with the other `vi.spyOn` declarations:

```tsx
const mockUseDownloads = vi.spyOn(downloadsHook, 'useDownloads');
```

Inside the existing `it('renders ...')` test, before `render(<PageDashboard />)`, add:

```tsx
    mockUseDownloads.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof downloadsHook.useDownloads>);
```

And add an assertion after render:

```tsx
    expect(screen.getByRole('button', { name: /add download/i })).toBeInTheDocument();
```

- [ ] **Step 4: Run the dashboard test**

Run: `cd frontend && npm run test -- --run src/pages/dashboard/PageDashboard.tests.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/downloads/index.ts frontend/src/pages/dashboard/PageDashboard.tsx frontend/src/pages/dashboard/PageDashboard.tests.tsx
git commit -m "feat(downloads): mount downloads widget and button on dashboard"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend build + tests**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds; all packages PASS.

- [ ] **Step 2: Frontend lint, type-check, build, tests**

Run: `cd frontend && npm run lint && npm run build && npm run test -- --run`
Expected: lint clean; `tsc` + Vite build succeed; all Vitest suites PASS.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Run the backend against a scratch dir and start a real download, then confirm it lands and the list reports `completed`:

```bash
cd backend
MANAGED_DIR=$(mktemp -d) DB_PATH=$(mktemp -u).db go run ./cmd/api &
sleep 2
curl -i -X POST localhost:8080/api/downloads \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://raw.githubusercontent.com/git/git/master/README.md","dir":"docs"}'
sleep 3
curl -s localhost:8080/api/downloads
```
Expected: POST returns `202` with a job; the GET shows the job as `completed` with `bytes_downloaded == total_bytes`; the file exists under `$MANAGED_DIR/docs/`. Stop the server with `kill %1`.

- [ ] **Step 4: Final commit (if any uncommitted changes remain)**

```bash
git status
# commit anything outstanding from manual fixes
```

---

## Notes for the implementer

- **Follow existing conventions:** handlers use the `errorResponse{Error: ...}` shape already defined in `internal/handler/disk.go` — do not introduce a new error wrapper. Frontend uses **named exports only** and the `features/<name>/{api,queries,ui}` layout.
- **Do not edit** `backend/internal/store/query.sql.go` (generated). This feature touches no SQL.
- **`.part` on failure stays on disk by design** — the scanner surfaces it in the file list within ~60s and the user deletes it via the existing delete action. Do not add cleanup logic.
- **TanStack Query v5** API is assumed (`refetchInterval` callback receives the query; mutation exposes `isPending`/`isError`/`error`). If the installed version differs, adapt the hook signatures accordingly.
