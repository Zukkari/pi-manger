package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"pi-manager/internal/store"
)

// DeleteFileHandler handles DELETE /api/files/{id} requests.
type DeleteFileHandler struct {
	store *store.Store
}

// NewDeleteFileHandler creates a handler that deletes a file by id.
func NewDeleteFileHandler(s *store.Store) *DeleteFileHandler {
	return &DeleteFileHandler{store: s}
}

func (h *DeleteFileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", http.MethodDelete)
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("delete: encode 405: %v", err)
		}
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/api/files/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || idStr == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "invalid id"}); err != nil {
			log.Printf("delete: encode 400: %v", err)
		}
		return
	}

	file, err := h.store.GetFile(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "not found"}); err != nil {
			log.Printf("delete: encode 404: %v", err)
		}
		return
	}
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("delete: encode 500: %v", err)
		}
		return
	}

	if err := h.store.DeleteFile(r.Context(), id); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("delete: encode 500: %v", err)
		}
		return
	}

	if err := os.RemoveAll(file.Path); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("delete: encode 500: %v", err)
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
