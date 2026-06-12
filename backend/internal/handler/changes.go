package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"pi-manager/internal/store"
)

const (
	changesDefaultLimit = 50
	changesMaxLimit     = 200
)

// ChangesHandler handles GET /api/changes requests: recent filesystem
// changes detected by the sync scanner, newest first.
type ChangesHandler struct {
	store *store.Store
}

// NewChangesHandler creates a handler backed by the given store.
func NewChangesHandler(s *store.Store) *ChangesHandler {
	return &ChangesHandler{store: s}
}

type changeResponse struct {
	ID         int64  `json:"id"`
	Path       string `json:"path"`
	ChangeType string `json:"change_type"`
	BytesDelta int64  `json:"bytes_delta"`
	DetectedAt int64  `json:"detected_at"`
}

func (h *ChangesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	limit := int64(changesDefaultLimit)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 1 || n > changesMaxLimit {
			writeJSONError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = n
	}

	changes, err := h.store.ListChanges(r.Context(), limit)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]changeResponse, 0, len(changes))
	for _, c := range changes {
		resp = append(resp, changeResponse{
			ID: c.ID, Path: c.Path, ChangeType: c.ChangeType,
			BytesDelta: c.BytesDelta, DetectedAt: c.DetectedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("changes: encode response: %v", err)
	}
}
