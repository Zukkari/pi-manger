# Pi Manager Backend — Disk API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Go HTTP API in a Docker container that exposes `GET /api/disk` returning disk usage stats for a mounted directory.

**Architecture:** Flat internal package layout — `internal/disk` handles syscall-based stat collection, `internal/handler` handles HTTP concerns, `cmd/api/main.go` wires them together. No external dependencies.

**Tech Stack:** Go 1.22, stdlib only (`net/http`, `encoding/json`, `syscall`), Docker multi-stage build, Docker Compose.

---

## File Map

| File | Role |
|------|------|
| `backend/go.mod` | Go module definition |
| `backend/internal/disk/disk.go` | `Stats(path)` — calls `syscall.Statfs`, returns `DiskStats` |
| `backend/internal/disk/disk_test.go` | Tests for `Stats` using a real temp directory |
| `backend/internal/handler/disk.go` | `DiskHandler` — HTTP handler, JSON response |
| `backend/internal/handler/disk_test.go` | Tests using `httptest.NewRecorder` |
| `backend/cmd/api/main.go` | Reads env vars, registers routes, starts server |
| `backend/Dockerfile` | Multi-stage Linux build |
| `docker-compose.yml` | Root-level Compose file |

---

## Task 1: Initialize project structure

**Files:**
- Create: `backend/go.mod`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p backend/cmd/api backend/internal/disk backend/internal/handler
```

- [ ] **Step 2: Create `backend/go.mod`**

```
module pi-manager

go 1.22
```

- [ ] **Step 3: Verify the module is valid**

```bash
cd backend && go mod tidy
```

Expected: no errors, `go.sum` created (empty deps is fine).

- [ ] **Step 4: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "chore: initialize Go module"
```

---

## Task 2: Implement the disk package (TDD)

**Files:**
- Create: `backend/internal/disk/disk.go`
- Create: `backend/internal/disk/disk_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/disk/disk_test.go`:

```go
package disk_test

import (
	"os"
	"testing"

	"pi-manager/internal/disk"
)

func TestStats_ReturnsValidStats(t *testing.T) {
	dir := t.TempDir()

	stats, err := disk.Stats(dir)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if stats.Path != dir {
		t.Errorf("expected path %q, got %q", dir, stats.Path)
	}
	if stats.TotalBytes == 0 {
		t.Error("expected TotalBytes > 0")
	}
	if stats.FreeBytes > stats.TotalBytes {
		t.Errorf("FreeBytes (%d) > TotalBytes (%d)", stats.FreeBytes, stats.TotalBytes)
	}
	if stats.UsedBytes != stats.TotalBytes-stats.FreeBytes {
		t.Errorf("UsedBytes mismatch: got %d, want %d", stats.UsedBytes, stats.TotalBytes-stats.FreeBytes)
	}
	if stats.UsedPercent < 0 || stats.UsedPercent > 100 {
		t.Errorf("UsedPercent out of range: %f", stats.UsedPercent)
	}
}

func TestStats_ErrorOnInvalidPath(t *testing.T) {
	_, err := disk.Stats("/this/path/does/not/exist/xyz123")
	if err == nil {
		t.Fatal("expected error for invalid path, got nil")
	}
}

func TestStats_UsesGivenPath(t *testing.T) {
	dir, err := os.MkdirTemp("", "disk-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)

	stats, err := disk.Stats(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stats.Path != dir {
		t.Errorf("expected path %q, got %q", dir, stats.Path)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/disk/...
```

Expected: compile error — `package disk` does not exist yet.

- [ ] **Step 3: Implement `backend/internal/disk/disk.go`**

```go
package disk

import (
	"fmt"
	"syscall"
)

// DiskStats holds filesystem usage information for a given path.
type DiskStats struct {
	Path        string
	TotalBytes  uint64
	UsedBytes   uint64
	FreeBytes   uint64
	UsedPercent float64
}

// Stats returns disk usage statistics for the given path using syscall.Statfs.
func Stats(path string) (DiskStats, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return DiskStats{}, fmt.Errorf("statfs %q: %w", path, err)
	}

	blockSize := uint64(stat.Bsize)
	total := stat.Blocks * blockSize
	free := stat.Bfree * blockSize
	used := total - free

	var usedPercent float64
	if total > 0 {
		usedPercent = float64(used) / float64(total) * 100
	}

	return DiskStats{
		Path:        path,
		TotalBytes:  total,
		UsedBytes:   used,
		FreeBytes:   free,
		UsedPercent: usedPercent,
	}, nil
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/disk/... -v
```

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/disk/
git commit -m "feat: add disk stats package using syscall.Statfs"
```

---

## Task 3: Implement the HTTP handler (TDD)

**Files:**
- Create: `backend/internal/handler/disk.go`
- Create: `backend/internal/handler/disk_test.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/handler/disk_test.go`:

```go
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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
	expected := os.TempDir()
	h := handler.NewDiskHandler(expected)
	if h == nil {
		t.Fatal("NewDiskHandler returned nil")
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/handler/...
```

Expected: compile error — `package handler` does not exist yet.

- [ ] **Step 3: Implement `backend/internal/handler/disk.go`**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"pi-manager/internal/disk"
)

// DiskHandler handles GET /api/disk requests.
type DiskHandler struct {
	path string
}

// NewDiskHandler creates a handler that reports disk stats for the given path.
func NewDiskHandler(path string) *DiskHandler {
	return &DiskHandler{path: path}
}

// diskResponse is the JSON shape returned by the endpoint.
type diskResponse struct {
	Path        string  `json:"path"`
	TotalBytes  uint64  `json:"total_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedPercent float64 `json:"used_percent"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func (h *DiskHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"})
		return
	}

	stats, err := disk.Stats(h.path)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(errorResponse{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(diskResponse{
		Path:        stats.Path,
		TotalBytes:  stats.TotalBytes,
		UsedBytes:   stats.UsedBytes,
		FreeBytes:   stats.FreeBytes,
		UsedPercent: stats.UsedPercent,
	})
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/handler/... -v
```

Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handler/
git commit -m "feat: add disk HTTP handler"
```

---

## Task 4: Implement `main.go`

**Files:**
- Create: `backend/cmd/api/main.go`

- [ ] **Step 1: Create `backend/cmd/api/main.go`**

```go
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"pi-manager/internal/handler"
)

func main() {
	managedDir := os.Getenv("MANAGED_DIR")
	if managedDir == "" {
		fmt.Fprintln(os.Stderr, "error: MANAGED_DIR environment variable is required")
		os.Exit(1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))

	addr := ":" + port
	log.Printf("pi-manager starting on %s (MANAGED_DIR=%s)", addr, managedDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && go build ./cmd/api/...
```

Expected: binary produced with no errors.

- [ ] **Step 3: Smoke test locally**

```bash
MANAGED_DIR=/tmp PORT=9090 ./api &
sleep 1
curl -s http://localhost:9090/api/disk | python3 -m json.tool
kill %1
rm ./api
```

Expected: JSON output with `path`, `total_bytes`, `used_bytes`, `free_bytes`, `used_percent`.

- [ ] **Step 4: Verify missing MANAGED_DIR exits with error**

```bash
cd backend && go run ./cmd/api/... 2>&1 || true
```

Expected output: `error: MANAGED_DIR environment variable is required`

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: add main.go with env-based config and HTTP server"
```

---

## Task 5: Add Dockerfile and docker-compose.yml

**Files:**
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o api ./cmd/api

# Run stage
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/api .
EXPOSE 8080
CMD ["./api"]
```

- [ ] **Step 2: Create `docker-compose.yml` at the repo root**

```yaml
services:
  backend:
    build:
      context: ./backend
    ports:
      - "8080:8080"
    environment:
      - MANAGED_DIR=/data
      - PORT=8080
    volumes:
      - ${PI_MANAGED_DIR:-/tmp}:/data
    restart: unless-stopped
```

`PI_MANAGED_DIR` is set on the Pi (e.g., in a `.env` file at the repo root) to point to the real directory to manage. It defaults to `/tmp` for local testing.

- [ ] **Step 3: Verify the image builds**

```bash
docker build -t pi-manager-backend ./backend
```

Expected: image builds successfully.

- [ ] **Step 4: Smoke test with Compose**

```bash
PI_MANAGED_DIR=/tmp docker compose up -d
sleep 2
curl -s http://localhost:8080/api/disk | python3 -m json.tool
docker compose down
```

Expected: same JSON response as Task 4 smoke test.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile docker-compose.yml
git commit -m "chore: add Dockerfile and docker-compose for Pi deployment"
```

---

## Self-Review Notes

- All spec requirements covered: project layout, `GET /api/disk`, `MANAGED_DIR` env var, `PORT` env var, startup error on missing `MANAGED_DIR`, 500 on bad path, Docker, Compose.
- `used_percent` formula matches spec: `(total - free) / total * 100`.
- `DiskStats` field names and `DiskHandler` constructor are consistent across disk package, handler package, and main.
- No CORS — intentional per spec (reverse proxy handles same-origin).
- `GOARCH=arm64` in Dockerfile targets Raspberry Pi 4/5. If using an older Pi (armv7), change to `GOARCH=arm`.
