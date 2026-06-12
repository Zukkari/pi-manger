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
	job, err := m.Start(srv.URL+"/x.bin", "", "custom.txt")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	done := waitFor(t, m, job.ID, StatusCompleted)
	if done.Name != "custom.txt" {
		t.Errorf("name = %q, want custom.txt", done.Name)
	}
}

func TestManagerSuffixesNameOnCollision(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("data"))
	}))
	defer srv.Close()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "file.bin"), []byte("existing"), 0o644); err != nil {
		t.Fatal(err)
	}
	m := NewManager(root, srv.Client())
	job, err := m.Start(srv.URL+"/file.bin", "", "")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	done := waitFor(t, m, job.ID, StatusCompleted)
	if done.Name != "file (1).bin" {
		t.Errorf("final job name = %q, want file (1).bin", done.Name)
	}
	if _, err := os.Stat(filepath.Join(root, "file (1).bin")); err != nil {
		t.Errorf("suffixed file should exist: %v", err)
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

func TestManagerSanitizesNameOverrideTraversal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("data"))
	}))
	defer srv.Close()
	root := t.TempDir()
	m := NewManager(root, srv.Client())

	// A malicious filename override must not escape the destination directory.
	job, err := m.Start(srv.URL+"/f", "sub", "../../escape.bin")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	done := waitFor(t, m, job.ID, StatusCompleted)
	if done.Name != "escape.bin" {
		t.Errorf("name = %q, want escape.bin (basename only)", done.Name)
	}
	if _, err := os.Stat(filepath.Join(root, "sub", "escape.bin")); err != nil {
		t.Errorf("file should land inside the destination: %v", err)
	}
	// Nothing must be written outside the managed root.
	if _, err := os.Stat(filepath.Join(filepath.Dir(root), "escape.bin")); !os.IsNotExist(err) {
		t.Errorf("file escaped the managed root")
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
	j1, err := m.Start(srv.URL+"/1", "", "")
	if err != nil {
		t.Fatalf("Start j1: %v", err)
	}
	j2, err := m.Start(srv.URL+"/2", "", "")
	if err != nil {
		t.Fatalf("Start j2: %v", err)
	}
	list := m.List()
	if len(list) < 2 || list[0].ID != j2.ID || list[1].ID != j1.ID {
		t.Errorf("expected newest-first ordering: got %+v", list)
	}
}
