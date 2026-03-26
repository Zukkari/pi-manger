package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"pi-manager/internal/handler"
)

func main() {
	managedDir := os.Getenv("MANAGED_DIR")
	if managedDir == "" {
		fmt.Fprintln(os.Stderr, "error: MANAGED_DIR environment variable is required")
		os.Exit(1)
	}

	if _, err := os.Stat(managedDir); err != nil {
		fmt.Fprintf(os.Stderr, "error: MANAGED_DIR %q is not accessible: %v\n", managedDir, err)
		os.Exit(1)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	// /api/disk is registered as an exact match; requests to /api/disk/ will 404.
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))

	addr := ":" + port
	log.Printf("pi-manager starting on %s (MANAGED_DIR=%s)", addr, managedDir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
