# Pi Manager — Backend API Design (Disk Space Feature)

**Date:** 2026-03-26

## Overview

A Go HTTP API running inside a Docker container on a Raspberry Pi. It exposes endpoints for managing a specific directory on the Pi. The first feature is a disk space endpoint that reports usage for a mounted volume.

The project is structured to support a future React frontend in the same repository, with a reverse proxy unifying both services under one origin.

---

## Project Layout

```
pi-manager/
├── backend/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go          # entry point, wires server together
│   ├── internal/
│   │   ├── disk/
│   │   │   └── disk.go          # disk stats via syscall.Statfs
│   │   └── handler/
│   │       └── disk.go          # HTTP handler for disk endpoint
│   ├── Dockerfile
│   └── go.mod
├── docker-compose.yml            # at root, orchestrates all services
└── (frontend/ added later)
```

---

## Deployment

- The entire stack is deployed via `docker-compose.yml` at the repo root.
- The Go API runs inside a Docker container on the Raspberry Pi.
- The managed directory is mounted into the container as a volume via Compose.
- A reverse proxy (to be configured) serves both backend and frontend from one origin, so no CORS handling is needed.

---

## Configuration

| Env var       | Required | Default | Description                              |
|---------------|----------|---------|------------------------------------------|
| `MANAGED_DIR` | Yes      | —       | Path inside the container to the mounted volume |
| `PORT`        | No       | `8080`  | Port the HTTP server listens on          |

---

## API

### `GET /api/disk`

Returns disk usage statistics for the directory at `MANAGED_DIR`.

**Response — 200 OK:**
```json
{
  "path": "/data",
  "total_bytes": 32000000000,
  "used_bytes": 12000000000,
  "free_bytes": 20000000000,
  "used_percent": 37.5
}
```

**Response — 500 Internal Server Error:**
```json
{
  "error": "failed to stat path: ..."
}
```

---

## Internal Design

### `internal/disk/disk.go`

Exposes a single function:

```go
func Stats(path string) (DiskStats, error)
```

Uses `syscall.Statfs` directly — no shelling out to `df`. Computes `used_percent` as `(total - free) / total * 100`.

```go
type DiskStats struct {
    Path        string
    TotalBytes  uint64
    UsedBytes   uint64
    FreeBytes   uint64
    UsedPercent float64
}
```

### `internal/handler/disk.go`

HTTP handler that calls `disk.Stats` with the path from `MANAGED_DIR` and writes a JSON response. Path is injected at construction time (read once at startup).

### `cmd/api/main.go`

- Reads `MANAGED_DIR` — exits with a clear error if not set.
- Reads `PORT`, defaults to `8080`.
- Registers routes and starts the HTTP server.

---

## Error Handling

| Scenario                          | Behavior                                      |
|-----------------------------------|-----------------------------------------------|
| `MANAGED_DIR` not set             | Server exits at startup with a clear message  |
| Path doesn't exist / inaccessible | `500` with JSON `{"error": "..."}` body       |

---

## Out of Scope (this phase)

- Authentication / authorization
- Frontend UI
- Any endpoint beyond `GET /api/disk`
- Reverse proxy configuration (handled separately)
