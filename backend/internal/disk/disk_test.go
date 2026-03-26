package disk_test

import (
	"os"
	"testing"

	"pi-manager/internal/disk"
)

func TestStats_ReturnsValidStats(t *testing.T) {
	dir := t.TempDir()

	stats, err := disk.Stats(dir)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if stats.Path != dir {
		t.Errorf("expected path %q, got %q", dir, stats.Path)
	}
	if stats.TotalBytes == 0 {
		t.Error("expected TotalBytes > 0")
	}
	if stats.FreeBytes > stats.TotalBytes {
		t.Errorf("FreeBytes (%d) > TotalBytes (%d)", stats.FreeBytes, stats.TotalBytes)
	}
	if stats.UsedBytes != stats.TotalBytes-stats.FreeBytes {
		t.Errorf("UsedBytes mismatch: got %d, want %d", stats.UsedBytes, stats.TotalBytes-stats.FreeBytes)
	}
	if stats.UsedPercent < 0 || stats.UsedPercent > 100 {
		t.Errorf("UsedPercent out of range: %f", stats.UsedPercent)
	}
}

func TestStats_ErrorOnInvalidPath(t *testing.T) {
	_, err := disk.Stats("/this/path/does/not/exist/xyz123")
	if err == nil {
		t.Fatal("expected error for invalid path, got nil")
	}
}

func TestStats_UsesGivenPath(t *testing.T) {
	dir, err := os.MkdirTemp("", "disk-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)

	stats, err := disk.Stats(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stats.Path != dir {
		t.Errorf("expected path %q, got %q", dir, stats.Path)
	}
}
