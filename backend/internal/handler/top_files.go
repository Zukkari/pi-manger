package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

const (
	defaultTopLimit = 5
	maxTopLimit     = 20
	minTopLimit     = 1
)

// TopFilesHandler handles GET /api/files/top requests.
type TopFilesHandler struct {
	store *store.Store
}

// NewTopFilesHandler creates a handler that returns the top-N largest children
// of a given parent (plus an aggregated "other" bucket) by total descendant size.
func NewTopFilesHandler(s *store.Store) *TopFilesHandler {
	return &TopFilesHandler{store: s}
}

type topEntryResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	IsDir     bool   `json:"is_dir"`
	SizeBytes int64  `json:"size_bytes"`
}

type topFilesResponse struct {
	ParentID   *int64             `json:"parent_id"`
	ParentPath *string            `json:"parent_path"`
	Entries    []topEntryResponse `json:"entries"`
	OtherBytes int64              `json:"other_bytes"`
	TotalBytes int64              `json:"total_bytes"`
}

func (h *TopFilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("top_files: encode 405: %v", err)
		}
		return
	}

	q := r.URL.Query()

	// Parse parent_id (optional).
	var parentID *int64
	var parentPath *string
	if raw := q.Get("parent_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid parent_id"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		// Look the parent up so we can: validate existence (404), validate it is
		// a directory (400), and include its path in the response.
		file, err := h.store.GetFile(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "not found"}); err != nil {
				log.Printf("top_files: encode 404: %v", err)
			}
			return
		}
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
				log.Printf("top_files: encode 500: %v", err)
			}
			return
		}
		if file.IsDir == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "parent_id is not a directory"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		parentID = &id
		parentPath = &file.Path
	}

	// Parse limit (optional, clamped silently).
	limit := defaultTopLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid limit"}); err != nil {
				log.Printf("top_files: encode 400: %v", err)
			}
			return
		}
		limit = clampLimit(n)
	}

	children, err := h.store.TopChildren(r.Context(), parentID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("top_files: encode 500: %v", err)
		}
		return
	}

	resp := topFilesResponse{
		ParentID:   parentID,
		ParentPath: parentPath,
		Entries:    make([]topEntryResponse, 0, limit),
	}
	for i, c := range children {
		if i < limit {
			resp.Entries = append(resp.Entries, topEntryResponse{
				ID:        c.ID,
				Name:      c.Name,
				IsDir:     c.IsDir,
				SizeBytes: c.TotalBytes,
			})
			resp.TotalBytes += c.TotalBytes
		} else {
			resp.OtherBytes += c.TotalBytes
		}
	}
	resp.TotalBytes += resp.OtherBytes

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("top_files: encode response: %v", err)
	}
}

func clampLimit(n int) int {
	if n < minTopLimit {
		return minTopLimit
	}
	if n > maxTopLimit {
		return maxTopLimit
	}
	return n
}
