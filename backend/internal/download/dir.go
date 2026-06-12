package download

import (
	"errors"
	"net/url"
	"path/filepath"
	"strings"
)

var (
	errBadScheme = errors.New("url must be http or https")
	errBadURL    = errors.New("invalid url")
	errBadDir    = errors.New("destination escapes managed directory")
)

// validateURL parses the raw URL string and requires an http/https scheme
// with a host.
func validateURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, errBadURL
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errBadScheme
	}
	if u.Host == "" {
		return nil, errBadURL
	}
	return u, nil
}

// resolveDir joins a user-supplied dir onto managedDir, rejecting any path
// that escapes managedDir via "..". Any leading slashes are stripped and the
// dir is treated as root-relative so that e.g. "/etc" resolves to
// managedDir/etc rather than escaping to the filesystem root. An empty dir
// resolves to managedDir itself, which is intentional: the folder picker sends
// "" when the user chooses the managed root as the download destination.
func resolveDir(managedDir, dir string) (string, error) {
	// Strip leading slashes so the caller cannot anchor to the filesystem root.
	// filepath.Join then normalises remaining ".." components.
	trimmed := strings.TrimLeft(dir, string(filepath.Separator))
	full := filepath.Join(managedDir, trimmed)
	rel, err := filepath.Rel(managedDir, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errBadDir
	}
	return full, nil
}
