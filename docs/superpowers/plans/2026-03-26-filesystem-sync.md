# Filesystem Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the mounted filesystem into a SQLite database on startup and every minute, storing file metadata (id, parent_id, name, path, size, is_dir, modified_at) for a future tree view API.

**Architecture:** Two new packages — `internal/store` (SQLite via sqlc-generated queries + thin wrapper) and `internal/scanner` (filesystem walker driving the store). `main.go` calls a startup sync then runs a `time.Ticker` goroutine every minute. Timestamps are stored as Unix integers (int64) for driver compatibility with `modernc.org/sqlite`.

**Tech Stack:** Go 1.22, `modernc.org/sqlite` (pure Go, no CGO, cross-compiles to linux/arm64), sqlc v2 for type-safe query generation, stdlib `filepath.WalkDir`.

---

## File Map

| File | Role |
|------|------|
| `backend/go.mod` | Add `modernc.org/sqlite` dependency |
| `backend/internal/store/schema.sql` | Source-of-truth table definition |
| `backend/internal/store/query.sql` | sqlc-annotated SQL queries |
| `backend/internal/store/sqlc.yaml` | sqlc config |
| `backend/internal/store/db.go` | **Generated** by sqlc — DBTX interface + `New` |
| `backend/internal/store/models.go` | **Generated** by sqlc — `File` struct |
| `backend/internal/store/query.sql.go` | **Generated** by sqlc — `UpsertFile`, `DeleteMissing` methods |
| `backend/internal/store/store.go` | Hand-written — `Store` type, `Open`, public method wrappers |
| `backend/internal/store/store_test.go` | Tests for `Store` |
| `backend/internal/scanner/scanner.go` | `Sync(ctx, root, Store)` — walks FS, calls store |
| `backend/internal/scanner/scanner_test.go` | Tests for `Sync` using a mock store and temp dir |
| `backend/cmd/api/main.go` | Add DB init, startup sync, ticker goroutine |
| `docker-compose.yml` | Add `DB_PATH` env var and `db-data` named volume |

---

## Task 1: Add SQLite dependency

**Files:**
- Modify: `backend/go.mod`
- Modify: `backend/go.sum`

- [ ] **Step 1: Add the dependency**

```bash
cd backend && go get modernc.org/sqlite
```

Expected: `go.mod` gains a `require modernc.org/sqlite` line; `go.sum` is updated.

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors (the existing code is unchanged).

- [ ] **Step 3: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "chore: add modernc.org/sqlite dependency"
```

---

## Task 2: Create SQL files and run sqlc

**Files:**
- Create: `backend/internal/store/schema.sql`
- Create: `backend/internal/store/query.sql`
- Create: `backend/internal/store/sqlc.yaml`
- Create (generated): `backend/internal/store/db.go`
- Create (generated): `backend/internal/store/models.go`
- Create (generated): `backend/internal/store/query.sql.go`

- [ ] **Step 1: Create the store directory**

```bash
mkdir -p backend/internal/store
```

- [ ] **Step 2: Create `backend/internal/store/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER REFERENCES files(id) ON DELETE CASCADE,
    path        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    is_dir      INTEGER NOT NULL DEFAULT 0,
    modified_at INTEGER NOT NULL,
    synced_at   INTEGER NOT NULL
);
```

`modified_at` and `synced_at` are stored as Unix timestamps (int64 seconds) — avoids all timezone/parsing complexity with the SQLite driver.

- [ ] **Step 3: Create `backend/internal/store/query.sql`**

```sql
-- name: UpsertFile :one
INSERT INTO files (parent_id, path, name, size, is_dir, modified_at, synced_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(path) DO UPDATE SET
    parent_id   = excluded.parent_id,
    name        = excluded.name,
    size        = excluded.size,
    is_dir      = excluded.is_dir,
    modified_at = excluded.modified_at,
    synced_at   = excluded.synced_at
RETURNING id;

-- name: DeleteMissing :exec
DELETE FROM files WHERE path NOT IN (/*SLICE:paths*/);
```

- [ ] **Step 4: Create `backend/internal/store/sqlc.yaml`**

```yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "query.sql"
    schema: "schema.sql"
    gen:
      go:
        package: "store"
        out: "."
```

- [ ] **Step 5: Install sqlc**

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
```

Expected: `sqlc` binary is available on PATH. Verify with `sqlc version`.

- [ ] **Step 6: Generate code**

```bash
cd backend/internal/store && sqlc generate
```

Expected: three files created — `db.go`, `models.go`, `query.sql.go`. No errors.

Confirm the generated `UpsertFileParams` struct looks like this (it will be in `query.sql.go`):

```go
type UpsertFileParams struct {
    ParentID   sql.NullInt64
    Path       string
    Name       string
    Size       int64
    IsDir      int64
    ModifiedAt int64
    SyncedAt   int64
}
```

And the generated `File` struct in `models.go`:

```go
type File struct {
    ID         int64
    ParentID   sql.NullInt64
    Path       string
    Name       string
    Size       int64
    IsDir      int64
    ModifiedAt int64
    SyncedAt   int64
}
```

If field types differ from what's shown, adjust `store.go` and `scanner.go` in later tasks to match what was actually generated.

- [ ] **Step 7: Verify the package compiles**

```bash
cd backend && go build ./internal/store/...
```

Expected: compiles cleanly.

- [ ] **Step 8: Commit all store files**

```bash
git add backend/internal/store/
git commit -m "feat: add store SQL schema, queries, and sqlc-generated code"
```

---

## Task 3: Implement `internal/store` (TDD)

**Files:**
- Create: `backend/internal/store/store.go`
- Create: `backend/internal/store/store_test.go`

- [ ] **Step 1: Write `backend/internal/store/store_test.go`**

```go
package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestOpen_CreatesSchema(t *testing.T) {
	s := openTestStore(t)
	rows, err := s.db.QueryContext(context.Background(), "SELECT count(*) FROM files")
	if err != nil {
		t.Fatalf("schema not created: %v", err)
	}
	rows.Close()
}

func TestUpsertFile_ReturnsPositiveID(t *testing.T) {
	s := openTestStore(t)
	id, err := s.UpsertFile(context.Background(), UpsertFileParams{
		ParentID:   sql.NullInt64{},
		Path:       "/data/foo.txt",
		Name:       "foo.txt",
		Size:       1024,
		IsDir:      0,
		ModifiedAt: time.Now().Unix(),
		SyncedAt:   time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("UpsertFile: %v", err)
	}
	if id <= 0 {
		t.Errorf("expected positive id, got %d", id)
	}
}

func TestUpsertFile_SamePathKeepsID(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	params := UpsertFileParams{
		Path:       "/data/foo.txt",
		Name:       "foo.txt",
		Size:       1024,
		IsDir:      0,
		ModifiedAt: time.Now().Unix(),
		SyncedAt:   time.Now().Unix(),
	}
	id1, err := s.UpsertFile(ctx, params)
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	params.Size = 2048
	id2, err := s.UpsertFile(ctx, params)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if id1 != id2 {
		t.Errorf("expected stable id %d, got %d on re-upsert", id1, id2)
	}
}

func TestDeleteMissing_RemovesAbsentPaths(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	_, err := s.UpsertFile(ctx, UpsertFileParams{Path: "/data/a.txt", Name: "a.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()})
	if err != nil {
		t.Fatalf("upsert a: %v", err)
	}
	_, err = s.UpsertFile(ctx, UpsertFileParams{Path: "/data/b.txt", Name: "b.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()})
	if err != nil {
		t.Fatalf("upsert b: %v", err)
	}

	if err := s.DeleteMissing(ctx, []string{"/data/a.txt"}); err != nil {
		t.Fatalf("DeleteMissing: %v", err)
	}

	var count int
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files WHERE path = ?", "/data/b.txt").Scan(&count)
	if count != 0 {
		t.Errorf("expected b.txt deleted, found %d rows", count)
	}
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files WHERE path = ?", "/data/a.txt").Scan(&count)
	if count != 1 {
		t.Errorf("expected a.txt to still exist, found %d rows", count)
	}
}

func TestDeleteMissing_EmptySliceDeletesAll(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	s.UpsertFile(ctx, UpsertFileParams{Path: "/data/a.txt", Name: "a.txt", ModifiedAt: time.Now().Unix(), SyncedAt: time.Now().Unix()})

	if err := s.DeleteMissing(ctx, []string{}); err != nil {
		t.Fatalf("DeleteMissing with empty slice: %v", err)
	}

	var count int
	s.db.QueryRowContext(ctx, "SELECT count(*) FROM files").Scan(&count)
	if count != 0 {
		t.Errorf("expected all rows deleted, got %d", count)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/store/... -v
```

Expected: compile error — `Open`, `Store`, `Close`, `UpsertFile`, `DeleteMissing` not defined yet. The `store.go` file doesn't exist.

- [ ] **Step 3: Create `backend/internal/store/store.go`**

```go
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// Store wraps the sqlc-generated Queries with a managed DB connection.
type Store struct {
	db      *sql.DB
	queries *Queries
}

// Open opens (or creates) the SQLite database at dbPath, enables foreign keys,
// and runs the schema migration. The caller must call Close when done.
func Open(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %q: %w", dbPath, err)
	}

	if _, err := db.ExecContext(context.Background(), "PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	if _, err := db.ExecContext(context.Background(), schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("run schema migration: %w", err)
	}

	return &Store{db: db, queries: New(db)}, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// UpsertFile inserts or updates a file record by path, returning its stable id.
func (s *Store) UpsertFile(ctx context.Context, arg UpsertFileParams) (int64, error) {
	return s.queries.UpsertFile(ctx, arg)
}

// DeleteMissing removes all file records whose paths are not in the given slice.
// If paths is empty, all records are deleted.
func (s *Store) DeleteMissing(ctx context.Context, paths []string) error {
	if len(paths) == 0 {
		_, err := s.db.ExecContext(ctx, "DELETE FROM files")
		return err
	}
	return s.queries.DeleteMissing(ctx, paths)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/store/... -v
```

Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/store/store.go backend/internal/store/store_test.go
git commit -m "feat: add store package with SQLite open, upsert, and delete"
```

---

## Task 4: Implement `internal/scanner` (TDD)

**Files:**
- Create: `backend/internal/scanner/scanner.go`
- Create: `backend/internal/scanner/scanner_test.go`

- [ ] **Step 1: Create the scanner directory**

```bash
mkdir -p backend/internal/scanner
```

- [ ] **Step 2: Write `backend/internal/scanner/scanner_test.go`**

```go
package scanner_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"pi-manager/internal/scanner"
	"pi-manager/internal/store"
)

// mockStore records calls made by Sync for assertion.
type mockStore struct {
	upserted []store.UpsertFileParams
	deleted  []string
	nextID   int64
}

func (m *mockStore) UpsertFile(_ context.Context, arg store.UpsertFileParams) (int64, error) {
	m.upserted = append(m.upserted, arg)
	m.nextID++
	return m.nextID, nil
}

func (m *mockStore) DeleteMissing(_ context.Context, paths []string) error {
	m.deleted = paths
	return nil
}

func TestSync_UpsertsRootDirectory(t *testing.T) {
	root := t.TempDir()
	ms := &mockStore{}

	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if len(ms.upserted) == 0 {
		t.Fatal("expected at least one upsert (root dir), got none")
	}
	if ms.upserted[0].Path != root {
		t.Errorf("expected first upsert path %q, got %q", root, ms.upserted[0].Path)
	}
	if ms.upserted[0].IsDir != 1 {
		t.Errorf("expected root to have is_dir=1, got %d", ms.upserted[0].IsDir)
	}
	if ms.upserted[0].ParentID.Valid {
		t.Error("expected root parent_id to be NULL")
	}
}

func TestSync_UpsertsChildFile(t *testing.T) {
	root := t.TempDir()
	f, err := os.CreateTemp(root, "testfile-*.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("hello")
	f.Close()

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// Should have upserted root + one file
	if len(ms.upserted) != 2 {
		t.Fatalf("expected 2 upserts (root + file), got %d", len(ms.upserted))
	}
	fileEntry := ms.upserted[1]
	if fileEntry.IsDir != 0 {
		t.Errorf("expected file to have is_dir=0, got %d", fileEntry.IsDir)
	}
	if fileEntry.Size != 5 {
		t.Errorf("expected file size 5, got %d", fileEntry.Size)
	}
}

func TestSync_SetsParentIDForChildFile(t *testing.T) {
	root := t.TempDir()
	os.CreateTemp(root, "child-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// root is upserted first and gets id=1; child should reference it
	child := ms.upserted[1]
	if !child.ParentID.Valid {
		t.Error("expected child parent_id to be set")
	}
	if child.ParentID.Int64 != 1 {
		t.Errorf("expected child parent_id=1, got %d", child.ParentID.Int64)
	}
}

func TestSync_SetsParentIDForNestedDirectory(t *testing.T) {
	root := t.TempDir()
	subdir := filepath.Join(root, "subdir")
	os.Mkdir(subdir, 0755)
	os.CreateTemp(subdir, "nested-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	// Entries: root (id=1), subdir (id=2, parent=1), nested file (id=3, parent=2)
	if len(ms.upserted) != 3 {
		t.Fatalf("expected 3 upserts, got %d", len(ms.upserted))
	}
	subEntry := ms.upserted[1]
	if !subEntry.ParentID.Valid || subEntry.ParentID.Int64 != 1 {
		t.Errorf("subdir parent_id: got %v, want 1", subEntry.ParentID)
	}
	nestedEntry := ms.upserted[2]
	if !nestedEntry.ParentID.Valid || nestedEntry.ParentID.Int64 != 2 {
		t.Errorf("nested file parent_id: got %v, want 2", nestedEntry.ParentID)
	}
}

func TestSync_CallsDeleteMissingWithAllSeenPaths(t *testing.T) {
	root := t.TempDir()
	os.CreateTemp(root, "a-*.txt")

	ms := &mockStore{}
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	if len(ms.deleted) != 2 { // root + file
		t.Errorf("expected DeleteMissing called with 2 paths, got %d", len(ms.deleted))
	}
}

func TestSync_SkipsUnreadableEntry(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("running as root; permission checks don't apply")
	}
	root := t.TempDir()
	restricted := filepath.Join(root, "restricted")
	os.Mkdir(restricted, 0000)
	defer os.Chmod(restricted, 0755)

	ms := &mockStore{}
	// Should not return an error — unreadable entries are skipped
	if err := scanner.Sync(context.Background(), root, ms); err != nil {
		t.Fatalf("expected no error for unreadable entry, got: %v", err)
	}
}

// Verify *store.Store satisfies scanner.Store at compile time.
var _ scanner.Store = (*store.Store)(nil)
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/scanner/... -v
```

Expected: compile error — package `scanner` does not exist yet.

- [ ] **Step 4: Create `backend/internal/scanner/scanner.go`**

```go
package scanner

import (
	"context"
	"database/sql"
	"io/fs"
	"log"
	"path/filepath"
	"time"

	"pi-manager/internal/store"
)

// Store is the database interface required by Sync.
type Store interface {
	UpsertFile(ctx context.Context, arg store.UpsertFileParams) (int64, error)
	DeleteMissing(ctx context.Context, paths []string) error
}

// Sync walks root recursively, upserts every entry into s, then removes rows
// for paths that no longer exist on disk. Per-entry errors are logged and skipped.
func Sync(ctx context.Context, root string, s Store) error {
	pathToID := make(map[string]int64)
	var seen []string

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("scanner: skipping %q: %v", path, err)
			return nil
		}

		info, err := d.Info()
		if err != nil {
			log.Printf("scanner: stat %q: %v", path, err)
			return nil
		}

		var parentID sql.NullInt64
		if path != root {
			if pid, ok := pathToID[filepath.Dir(path)]; ok {
				parentID = sql.NullInt64{Int64: pid, Valid: true}
			}
		}

		id, err := s.UpsertFile(ctx, store.UpsertFileParams{
			ParentID:   parentID,
			Path:       path,
			Name:       d.Name(),
			Size:       info.Size(),
			IsDir:      boolToInt64(d.IsDir()),
			ModifiedAt: info.ModTime().Unix(),
			SyncedAt:   time.Now().Unix(),
		})
		if err != nil {
			log.Printf("scanner: upsert %q: %v", path, err)
			return nil
		}

		pathToID[path] = id
		seen = append(seen, path)
		return nil
	})
	if walkErr != nil {
		return walkErr
	}

	return s.DeleteMissing(ctx, seen)
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/scanner/... -v
```

Expected: all six tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/scanner/
git commit -m "feat: add scanner package with filesystem walk and DB sync"
```

---

## Task 5: Update `cmd/api/main.go`

**Files:**
- Modify: `backend/cmd/api/main.go`

- [ ] **Step 1: Replace `backend/cmd/api/main.go` with the updated version**

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/scanner"
	"pi-manager/internal/store"
)

func main() {
	managedDir := os.Getenv("MANAGED_DIR")
	if managedDir == "" {
		fmt.Fprintln(os.Stderr, "error: MANAGED_DIR environment variable is required")
		os.Exit(1)
	}

	if _, err := os.Stat(managedDir); err != nil {
		fmt.Fprintf(os.Stderr, "error: MANAGED_DIR %q is not accessible: %v\n", managedDir, err)
		os.Exit(1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./pi-manager.db"
	}

	db, err := store.Open(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	runSync := func() {
		log.Printf("sync: starting")
		start := time.Now()
		if err := scanner.Sync(ctx, managedDir, db); err != nil {
			log.Printf("sync: error: %v", err)
			return
		}
		log.Printf("sync: completed in %s", time.Since(start))
	}

	// Sync once at startup before accepting requests.
	runSync()

	// Sync every minute in the background.
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				runSync()
			case <-ctx.Done():
				return
			}
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))

	addr := ":" + port
	log.Printf("pi-manager starting on %s (MANAGED_DIR=%s, DB_PATH=%s)", addr, managedDir, dbPath)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
```

- [ ] **Step 2: Build to verify it compiles**

```bash
cd backend && go build ./cmd/api/...
```

Expected: binary produced with no errors.

- [ ] **Step 3: Smoke test locally**

```bash
cd backend
MANAGED_DIR=/tmp DB_PATH=/tmp/test-pi.db PORT=9090 ./api &
sleep 1
# Check the server is running
curl -s http://localhost:9090/api/disk | python3 -m json.tool
# Check the DB was created and populated
sqlite3 /tmp/test-pi.db "SELECT id, name, is_dir FROM files LIMIT 5;"
kill %1
rm ./api /tmp/test-pi.db
```

Expected: disk JSON returned; `sqlite3` shows rows for `/tmp` and its contents.

- [ ] **Step 4: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/api/main.go
git commit -m "feat: wire filesystem sync into main — startup + 1-minute ticker"
```

---

## Task 6: Update `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace `docker-compose.yml` with the updated version**

```yaml
services:
  backend:
    build:
      context: ./backend
    platform: linux/arm64
    expose:
      - "8080"
    environment:
      - MANAGED_DIR=/data
      - PORT=8080
      - DB_PATH=/db/pi-manager.db
    volumes:
      - ${PI_MANAGED_DIR:-/tmp}:/data
      - db-data:/db
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
    platform: linux/arm64
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  db-data:
```

- [ ] **Step 2: Verify the image builds**

```bash
docker build -t pi-manager-backend ./backend
```

Expected: image builds successfully.

- [ ] **Step 3: Smoke test with Compose**

```bash
PI_MANAGED_DIR=/tmp docker compose up -d
sleep 3
curl -s http://localhost:8080/api/disk | python3 -m json.tool
docker compose exec backend sqlite3 /db/pi-manager.db "SELECT count(*) FROM files;"
docker compose down
```

Expected: disk JSON returned; `SELECT count(*)` shows a non-zero row count.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add db-data volume and DB_PATH to docker-compose"
```

---

## Self-Review Notes

- **Spec coverage:** All goals covered — walk on startup ✓, 1-minute ticker ✓, hard delete missing ✓, stable IDs ✓, SQLite + modernc ✓, sqlc ✓, docker-compose volume ✓.
- **Timestamps:** Spec said `DATETIME`; implementation uses `INTEGER` (Unix seconds) — avoids driver parsing complexity, no functional difference for the tree view use case.
- **Empty slice edge case:** `DeleteMissing` handles `len(paths) == 0` by issuing `DELETE FROM files` directly, bypassing the sqlc query that would generate invalid SQL `NOT IN ()`.
- **Foreign keys:** `PRAGMA foreign_keys = ON` is set on every connection open — required for `ON DELETE CASCADE` to work in SQLite.
- **Compile-time interface check** in `scanner_test.go`: `var _ scanner.Store = (*store.Store)(nil)` catches signature drift between the concrete store and the scanner interface.
- **Type names:** `UpsertFileParams`, `Store`, `Sync`, `Open`, `Close` — all consistent across tasks.
