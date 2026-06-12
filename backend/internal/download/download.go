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
	"strings"
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

	// Name resolution, highest priority first: explicit override, then the URL
	// path segment, then the server's Content-Disposition, then a hard fallback.
	// The URL segment is preferred over Content-Disposition because it is what
	// the user pasted; Content-Disposition only fills in when the URL is opaque.
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
	// Defense in depth: reduce any source — especially the user-supplied
	// override — to a single path element so a name like "../../etc/evil"
	// cannot escape destDir. resolveDir guards the dir; this guards the name.
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == ".." {
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

// Write records progress only; it never fails. It is the second writer in an
// io.MultiWriter(file, pw), so it is reached only after the bytes were already
// written to the file — the file's write error is what MultiWriter propagates.
func (w *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.m.update(w.id, func(j *Job) { j.BytesDownloaded += int64(n) })
	return n, nil
}
