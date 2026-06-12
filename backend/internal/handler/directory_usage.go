package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"pi-manager/internal/store"
)

// DirectoryUsageHandler handles GET /api/directories/{id}/usage requests,
// where {id} is "root" or a directory id. It returns the directory's direct
// children annotated with their recursive total file size — the data shape a
// click-to-zoom treemap consumes one level at a time.
type DirectoryUsageHandler struct {
	store *store.Store
}

// NewDirectoryUsageHandler creates a handler backed by the given store.
func NewDirectoryUsageHandler(s *store.Store) *DirectoryUsageHandler {
	return &DirectoryUsageHandler{store: s}
}

type usageChildResponse struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	IsDir      bool   `json:"is_dir"`
	TotalBytes int64  `json:"total_bytes"`
}

type directoryUsageResponse struct {
	ParentID   *int64               `json:"parent_id"`
	ParentPath *string              `json:"parent_path"`
	Children   []usageChildResponse `json:"children"`
}

func (h *DirectoryUsageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/directories/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[1] != "usage" || parts[0] == "" {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	var parentID *int64
	var parentPath *string
	if parts[0] != "root" {
		id, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid directory id")
			return
		}
		file, err := h.store.GetFile(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if file.IsDir == 0 {
			writeJSONError(w, http.StatusBadRequest, "id is not a directory")
			return
		}
		parentID = &id
		parentPath = &file.Path
	}

	children, err := h.store.TopChildren(r.Context(), parentID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := directoryUsageResponse{
		ParentID:   parentID,
		ParentPath: parentPath,
		Children:   make([]usageChildResponse, 0, len(children)),
	}
	for _, c := range children {
		resp.Children = append(resp.Children, usageChildResponse{
			ID: c.ID, Name: c.Name, IsDir: c.IsDir, TotalBytes: c.TotalBytes,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("directory_usage: encode response: %v", err)
	}
}

// writeJSONError sends a JSON error response with the given HTTP status.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(errorResponse{Error: msg}); err != nil {
		log.Printf("handler: encode %d: %v", status, err)
	}
}
