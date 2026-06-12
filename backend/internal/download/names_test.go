package download

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLastPathSegment(t *testing.T) {
	cases := map[string]string{
		"/files/ubuntu.iso": "ubuntu.iso",
		"/files/sub/":       "sub",
		"/":                 "",
		"":                  "",
		"/a/b/c.tar.gz":     "c.tar.gz",
	}
	for in, want := range cases {
		if got := lastPathSegment(in); got != want {
			t.Errorf("lastPathSegment(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFilenameFromContentDisposition(t *testing.T) {
	cases := map[string]string{
		`attachment; filename="report.pdf"`: "report.pdf",
		`attachment; filename=plain.txt`:    "plain.txt",
		`inline`:                            "",
		``:                                  "",
		`attachment; filename="../etc/x"`:   "x",
	}
	for in, want := range cases {
		if got := filenameFromContentDisposition(in); got != want {
			t.Errorf("filenameFromContentDisposition(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUniqueNameSuffixesCollisions(t *testing.T) {
	dir := t.TempDir()
	if got := uniqueName(dir, "file.iso"); got != "file.iso" {
		t.Fatalf("empty dir: got %q, want file.iso", got)
	}
	if err := os.WriteFile(filepath.Join(dir, "file.iso"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniqueName(dir, "file.iso"); got != "file (1).iso" {
		t.Fatalf("one collision: got %q, want file (1).iso", got)
	}
	// A leftover .part from a prior failed download must also force a new name.
	if err := os.WriteFile(filepath.Join(dir, "file (1).iso.part"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := uniqueName(dir, "file.iso"); got != "file (2).iso" {
		t.Fatalf("collision vs .part: got %q, want file (2).iso", got)
	}
}
