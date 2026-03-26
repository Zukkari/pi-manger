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
