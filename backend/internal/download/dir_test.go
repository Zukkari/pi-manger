package download

import (
	"path/filepath"
	"testing"
)

func TestValidateURL(t *testing.T) {
	good := []string{"http://example.com/a", "https://example.com/b.iso"}
	for _, u := range good {
		if _, err := validateURL(u); err != nil {
			t.Errorf("validateURL(%q) unexpected error: %v", u, err)
		}
	}
	bad := []string{"ftp://example.com/x", "file:///etc/passwd", "notaurl", "https://"}
	for _, u := range bad {
		if _, err := validateURL(u); err == nil {
			t.Errorf("validateURL(%q) expected error, got nil", u)
		}
	}
}

func TestResolveDirRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	ok, err := resolveDir(root, "downloads/iso")
	if err != nil {
		t.Fatalf("valid dir errored: %v", err)
	}
	if ok != filepath.Join(root, "downloads", "iso") {
		t.Fatalf("got %q", ok)
	}
	// A leading slash is treated as root-relative, not an escape.
	if got, err := resolveDir(root, "/etc"); err != nil || got != filepath.Join(root, "etc") {
		t.Fatalf("resolveDir(root, \"/etc\") = %q, %v", got, err)
	}
	// An empty dir resolves to the managed root (the folder picker sends "" when
	// the user picks the root as the destination).
	if got, err := resolveDir(root, ""); err != nil || got != root {
		t.Fatalf("resolveDir(root, \"\") = %q, %v", got, err)
	}
	for _, bad := range []string{"../escape", "downloads/../../escape", "a/../../../b"} {
		if _, err := resolveDir(root, bad); err == nil {
			t.Errorf("resolveDir(%q) expected error, got nil", bad)
		}
	}
}
