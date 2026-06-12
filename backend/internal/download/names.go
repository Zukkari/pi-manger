package download

import (
	"fmt"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// lastPathSegment returns the final path element of a URL path, or "" if none.
func lastPathSegment(p string) string {
	p = strings.TrimRight(p, "/")
	if p == "" {
		return ""
	}
	seg := path.Base(p)
	if seg == "/" || seg == "." {
		return ""
	}
	return seg
}

// filenameFromContentDisposition extracts a base filename from a
// Content-Disposition header value, or "" if none is present.
func filenameFromContentDisposition(v string) string {
	if v == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(v)
	if err != nil {
		return ""
	}
	name := params["filename"]
	if name == "" {
		return ""
	}
	return filepath.Base(name)
}

// available reports whether neither name nor its .part sibling exists in dir.
func available(dir, name string) bool {
	if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, name+".part")); err == nil {
		return false
	}
	return true
}

// uniqueName returns name, or name with a " (n)" suffix before the extension,
// such that neither the final name nor its .part sibling already exists in dir.
func uniqueName(dir, name string) string {
	if available(dir, name) {
		return name
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 1; ; i++ {
		cand := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if available(dir, cand) {
			return cand
		}
	}
}
