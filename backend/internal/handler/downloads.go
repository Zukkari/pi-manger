package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"pi-manager/internal/download"
)

// Downloader is the subset of download.Manager the handler needs.
type Downloader interface {
	Start(rawURL, dir, name string) (*download.Job, error)
	List() []download.Job
}

// DownloadsHandler handles POST and GET /api/downloads.
type DownloadsHandler struct {
	mgr Downloader
}

// NewDownloadsHandler creates a handler backed by the given download manager.
func NewDownloadsHandler(mgr Downloader) *DownloadsHandler {
	return &DownloadsHandler{mgr: mgr}
}

type createDownloadRequest struct {
	URL  string `json:"url"`
	Dir  string `json:"dir"`
	Name string `json:"name"`
}

type downloadResponse struct {
	ID              string `json:"id"`
	URL             string `json:"url"`
	Dir             string `json:"dir"`
	Name            string `json:"name"`
	Status          string `json:"status"`
	BytesDownloaded int64  `json:"bytes_downloaded"`
	TotalBytes      int64  `json:"total_bytes"`
	Error           string `json:"error"`
	CreatedAt       int64  `json:"created_at"`
	FinishedAt      int64  `json:"finished_at"`
}

func toDownloadResponse(j download.Job) downloadResponse {
	return downloadResponse{
		ID:              j.ID,
		URL:             j.URL,
		Dir:             j.Dir,
		Name:            j.Name,
		Status:          string(j.Status),
		BytesDownloaded: j.BytesDownloaded,
		TotalBytes:      j.TotalBytes,
		Error:           j.Err,
		CreatedAt:       j.CreatedAt,
		FinishedAt:      j.FinishedAt,
	}
}

func (h *DownloadsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.create(w, r)
	case http.MethodGet:
		h.list(w, r)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Allow", "GET, POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "method not allowed"}); err != nil {
			log.Printf("downloads: encode 405: %v", err)
		}
	}
}

func (h *DownloadsHandler) create(w http.ResponseWriter, r *http.Request) {
	var req createDownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: "malformed request body"}); err != nil {
			log.Printf("downloads: encode 400: %v", err)
		}
		return
	}

	job, err := h.mgr.Start(req.URL, req.Dir, req.Name)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		if err := json.NewEncoder(w).Encode(errorResponse{Error: err.Error()}); err != nil {
			log.Printf("downloads: encode 422: %v", err)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	if err := json.NewEncoder(w).Encode(toDownloadResponse(*job)); err != nil {
		log.Printf("downloads: encode 202: %v", err)
	}
}

func (h *DownloadsHandler) list(w http.ResponseWriter, _ *http.Request) {
	jobs := h.mgr.List()
	resp := make([]downloadResponse, 0, len(jobs))
	for _, j := range jobs {
		resp = append(resp, toDownloadResponse(j))
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("downloads: encode list: %v", err)
	}
}
