# pi-manager

A full-stack web app for monitoring Raspberry Pi resources. The backend is a Go API server that syncs a managed directory into SQLite and exposes HTTP endpoints. The frontend is a React + TypeScript + Vite app that visualizes disk and file data.

## Stack

- **Backend**: Go, SQLite (via sqlc), net/http
- **Frontend**: React, TypeScript, Vite, TanStack Router, React Query
- **Deployment**: Docker Compose targeting `linux/arm64` (Raspberry Pi)

## Getting Started

### With Docker (recommended)

```bash
PI_MANAGED_DIR=/path/to/monitor docker-compose up --build
```

Frontend is available at `http://localhost:80`. Backend runs on port 8080 (internal).

### Backend (local)

```bash
cd backend
MANAGED_DIR=/path/to/monitor go run ./cmd/api
```

Optional env vars:
- `PORT` — default `8080`
- `DB_PATH` — default `./pi-manager.db`

### Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

Dev server starts with HMR. Expects backend at `/api`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/disk` | Disk usage stats (`total_bytes`, `used_bytes`, `free_bytes`, `used_percent`) |
| GET | `/api/files` | List files; optional `?parent_id=<id>`, omit for root entries |

## Project Structure

```
backend/
├── cmd/api/main.go          # Entry point
└── internal/
    ├── disk/                # Disk stats via syscall
    ├── handler/             # HTTP handlers
    ├── scanner/             # Filesystem walk + DB sync
    └── store/               # SQLite layer (sqlc-generated)

frontend/src/
├── app/router.tsx           # TanStack Router config
├── features/                # Feature modules (types, api, query hooks, components)
├── pages/                   # Page components (compose layouts + feature components)
├── layouts/                 # Structural layout wrappers
└── shared/api/client.ts     # Base fetch client
```

## Development Notes

- SQL queries live in `backend/internal/store/query.sql`. After editing, run `cd backend && sqlc generate` to regenerate Go code. Do not edit `query.sql.go` directly.
- The scanner syncs `MANAGED_DIR` at startup and every 60 seconds.
- Frontend components fetch their own data independently — a failing widget does not block the rest of the page.
