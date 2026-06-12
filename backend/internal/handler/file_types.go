package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"

	"pi-manager/internal/store"
)

// FileTypesHandler handles GET /api/file-types requests: total bytes per
// content category (video, audio, image, archive, document, other), with the
// top extensions inside each.
type FileTypesHandler struct {
	store *store.Store
}

// NewFileTypesHandler creates a handler backed by the given store.
func NewFileTypesHandler(s *store.Store) *FileTypesHandler {
	return &FileTypesHandler{store: s}
}

const maxExtensionsPerCategory = 3

// extensionCategories maps known extensions to a display category. Anything
// unlisted (or extension-less) lands in "other".
var extensionCategories = map[string]string{
	"mkv": "video", "mp4": "video", "avi": "video", "mov": "video", "webm": "video", "m4v": "video", "ts": "video",
	"mp3": "audio", "flac": "audio", "wav": "audio", "aac": "audio", "ogg": "audio", "m4a": "audio",
	"jpg": "image", "jpeg": "image", "png": "image", "gif": "image", "webp": "image", "svg": "image", "heic": "image",
	"zip": "archive", "tar": "archive", "gz": "archive", "bz2": "archive", "7z": "archive", "rar": "archive", "xz": "archive", "iso": "archive", "img": "archive",
	"pdf": "document", "doc": "document", "docx": "document", "txt": "document", "md": "document",
	"xls": "document", "xlsx": "document", "ppt": "document", "pptx": "document", "csv": "document", "epub": "document",
}

type extensionTotal struct {
	Extension  string `json:"extension"`
	TotalBytes int64  `json:"total_bytes"`
}

type categoryTotal struct {
	Category   string           `json:"category"`
	TotalBytes int64            `json:"total_bytes"`
	Extensions []extensionTotal `json:"extensions"`
}

type fileTypesResponse struct {
	TotalBytes int64           `json:"total_bytes"`
	Categories []categoryTotal `json:"categories"`
}

// fileExtension returns the lowercase extension without the dot, or "" when
// the name has none (including dotfiles like ".bashrc").
func fileExtension(name string) string {
	idx := strings.LastIndex(name, ".")
	if idx <= 0 || idx == len(name)-1 {
		return ""
	}
	return strings.ToLower(name[idx+1:])
}

func (h *FileTypesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	files, err := h.store.FileNameSizes(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	extBytes := map[string]map[string]int64{} // category → extension → bytes
	var total int64
	for _, f := range files {
		ext := fileExtension(f.Name)
		category, ok := extensionCategories[ext]
		if !ok {
			category = "other"
		}
		if extBytes[category] == nil {
			extBytes[category] = map[string]int64{}
		}
		key := ext
		if key == "" {
			key = "(none)"
		}
		extBytes[category][key] += f.Size
		total += f.Size
	}

	resp := fileTypesResponse{TotalBytes: total, Categories: make([]categoryTotal, 0, len(extBytes))}
	for category, exts := range extBytes {
		ct := categoryTotal{Category: category, Extensions: make([]extensionTotal, 0, len(exts))}
		for ext, bytes := range exts {
			ct.TotalBytes += bytes
			ct.Extensions = append(ct.Extensions, extensionTotal{Extension: ext, TotalBytes: bytes})
		}
		sort.Slice(ct.Extensions, func(i, j int) bool {
			if ct.Extensions[i].TotalBytes != ct.Extensions[j].TotalBytes {
				return ct.Extensions[i].TotalBytes > ct.Extensions[j].TotalBytes
			}
			return ct.Extensions[i].Extension < ct.Extensions[j].Extension
		})
		if len(ct.Extensions) > maxExtensionsPerCategory {
			ct.Extensions = ct.Extensions[:maxExtensionsPerCategory]
		}
		resp.Categories = append(resp.Categories, ct)
	}
	sort.Slice(resp.Categories, func(i, j int) bool {
		if resp.Categories[i].TotalBytes != resp.Categories[j].TotalBytes {
			return resp.Categories[i].TotalBytes > resp.Categories[j].TotalBytes
		}
		return resp.Categories[i].Category < resp.Categories[j].Category
	})

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("file_types: encode response: %v", err)
	}
}
