package handler

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

// FilesHandler handles GET /api/files requests.
type FilesHandler struct {
	store *store.Store
}

// NewFilesHandler creates a handler that queries filesystem entries from the store.
func NewFilesHandler(s *store.Store) *FilesHandler {
	return &FilesHandler{store: s}
}

type fileResponse struct {
	ID         int64  `json:"id"`
	ParentID   *int64 `json:"parent_id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	IsDir      bool   `json:"is_dir"`
	ModifiedAt int64  `json:"modified_at"`
}

func (h *FilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("files: encode 405: %v", err)
		}
		return
	}

	var parentID sql.NullInt64
	if raw := r.URL.Query().Get("parent_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid parent_id"}); err != nil {
				log.Printf("files: encode 400: %v", err)
			}
			return
		}
		parentID = sql.NullInt64{Int64: id, Valid: true}
	}

	files, err := h.store.ListChildren(r.Context(), parentID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("files: encode 500: %v", err)
		}
		return
	}

	resp := make([]fileResponse, 0, len(files))
	for _, f := range files {
		fr := fileResponse{
			ID:         f.ID,
			Name:       f.Name,
			Path:       f.Path,
			Size:       f.Size,
			IsDir:      f.IsDir != 0,
			ModifiedAt: f.ModifiedAt,
		}
		if f.ParentID.Valid {
			fr.ParentID = &f.ParentID.Int64
		}
		resp = append(resp, fr)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("files: encode response: %v", err)
	}
}
