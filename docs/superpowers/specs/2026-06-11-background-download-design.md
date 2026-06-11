# Background Download from Link — Design

**Date:** 2026-06-11
**Status:** Approved

## Overview

A user pastes a URL, optionally names the file, and picks a destination folder
under `MANAGED_DIR`. The server downloads the file in the background. Progress
and outcome are tracked as in-memory jobs that the UI polls. The existing
scanner picks the finished file into the `files` table on its next pass (within
60s), so it shows up in the normal file list with no extra wiring.

## Decisions

| Topic | Decision |
|---|---|
| Status tracking | Tracked jobs with a status API, held in memory (not persisted; lost on restart) |
| Destination | Subfolder under `MANAGED_DIR`; user supplies a relative path; created if missing; traversal rejected |
| URL validation | Minimal — require `http`/`https` scheme only; no SSRF/private-IP blocking, no size cap |
| Filename | User may override; otherwise derive (URL last segment → `Content-Disposition` → `download`); auto-suffix collisions ` (1)`, ` (2)`… (never overwrite) |
| Failed download | Partial `.part` file is left on disk (never auto-deleted); it shows up in the file list so the user removes it with the existing delete action |
| UI trigger | Floating `+` button opening a full-screen form sheet (paper theme) |
| Folder picker | Drill-down tree built on existing `/api/files` tree; inline create-subfolder |
| API path | `/api/downloads` (plural noun) |
| Polling cadence | React Query `refetchInterval` ~1.5s while any job is active; stops when none active |

## Backend

### Package `internal/download`

A `Manager` holds jobs in memory:

- State: `map[string]*Job` guarded by a `sync.RWMutex`.
- `Job` fields: `ID` (string), `URL`, `Dir` (relative to `MANAGED_DIR`),
  `Name` (resolved filename), `Status`, `BytesDownloaded`, `TotalBytes`
  (from `Content-Length`; `0` when unknown), `Error`, `CreatedAt`, `FinishedAt`.
- `Status` is one of `queued`, `downloading`, `completed`, `failed`
  (serialized as strings).

`Manager.Start(url, dir, name) (*Job, error)`:

1. Validate the request (see Validation). On invalid input, return an error
   without creating a job (handler maps it to 422).
2. Create the job in `queued` state, store it, launch a goroutine, return it.

Download goroutine:

1. Resolve destination directory: `filepath.Join(managedDir, filepath.Clean("/"+dir))`
   then verify the result is still within `managedDir` (prefix check). Reject
   traversal.
2. `os.MkdirAll(destDir, 0o755)`.
3. Resolve filename: explicit `name` → last path segment of the URL →
   `Content-Disposition` filename → `download`. Sanitize to a base name.
4. Collision handling: if `name` exists, append ` (1)`, ` (2)`, … before the
   extension until free. Never overwrite.
5. Set status `downloading`. Stream the response body through a counting writer
   that updates `BytesDownloaded`, writing to `<name>.part`.
6. On success: `rename` `.part` → final name, status `completed`, set
   `FinishedAt`.
7. On any error: **leave the partial `.part` file in place**, status `failed`,
   store the error message, set `FinishedAt`. The scanner picks the `.part`
   file into the file list so the user can remove it via the existing delete
   action — the server never auto-deletes partial downloads.

A context timeout guards stuck connections. No size cap.

The manager is constructed in `main.go` with `managedDir` and an
`*http.Client`, and shared with the handler.

### Handlers — `internal/handler/downloads.go`

Registered in `main.go` on the existing `mux`.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/downloads` | Body `{ "url": string, "dir": string, "name"?: string }`. Returns **202** with the created job JSON. **400** for a malformed/unparseable body, **422** for a syntactically valid body that fails validation (bad scheme, dir escapes `MANAGED_DIR`). |
| GET | `/api/downloads` | Returns all jobs, newest first, as a JSON array for polling. |

Error responses follow the existing handler style in this codebase.

## Frontend

New feature module `features/downloads/` mirroring the existing feature pattern
(`types/`, `api/`, `queries/`, `ui/`). Named exports only.

- **`api/`** — `createDownload({url, dir, name})` → POST `/api/downloads`;
  `getDownloads()` → GET `/api/downloads`.
- **`queries/`** — `useDownloads()` with `refetchInterval` ~1.5s while any job
  is `queued`/`downloading`, disabled otherwise; `useCreateDownload()` mutation
  that invalidates the list.
- **`ui/AddDownloadButton`** — floating round `+` button in the paper accent
  colour; opens the form sheet.
- **`ui/AddDownloadSheet`** — full-screen sheet: Link field, Destination folder
  row (opens `FolderPicker`), optional Name field, "Start Download" button.
  Shows inline validation errors from 422 responses.
- **`ui/FolderPicker`** — drill-down tree over the existing `/api/files`
  endpoint. Starts at root (`/api/files` with no `parent_id`); tapping a folder
  lists its children via `?parent_id={id}` and appends the folder *name* to an
  accumulated relative path (so absolute paths / `MANAGED_DIR` are never
  needed). Breadcrumb to navigate up, "USE" to confirm, inline "create
  subfolder" that appends a typed name (server `MkdirAll`s it on download).
- **`ui/DownloadsList`** — dashboard widget listing jobs with progress bars
  (`--paper-safe` green), and `completed`/`failed` states styled per theme.
  `failed` rows show the error message.

These are added to the dashboard page alongside the existing widgets.

## Error handling

- Each widget fetches its own data and owns its loading/error state; a failing
  downloads widget must not block the rest of the dashboard.
- Job-level failures surface as a `failed` row with the server error message.
- Form surfaces 422 validation errors inline.

## Testing

### Backend
- `download` package unit tests against an `httptest` server:
  - successful download writes the file and reaches `completed`;
  - filename derivation (URL segment, `Content-Disposition`, fallback);
  - collision suffixing;
  - traversal rejection (`dir` escaping `MANAGED_DIR`);
  - non-http(s) scheme rejection;
  - failure mid-stream leaves the `.part` file in place and reaches `failed`;
  - `BytesDownloaded` progress counting.
- Handler tests: 202 on valid POST, 400 on malformed body, 422 on invalid
  url/dir, list endpoint returns jobs.

### Frontend (Vitest)
- `FolderPicker`: navigation and relative-path accumulation, create-subfolder.
- `DownloadsList`: progress / completed / failed rendering.
- `AddDownloadSheet`: validation and submit behaviour.

## Out of scope (YAGNI)

- Resume / retry of interrupted downloads.
- Persistence of job history across restarts.
- SSRF hardening, size caps, auth.
- Concurrency limits / a download queue (jobs run as they arrive).
