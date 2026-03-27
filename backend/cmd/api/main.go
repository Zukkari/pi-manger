package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pi-manager/internal/handler"
	"pi-manager/internal/scanner"
	"pi-manager/internal/store"
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

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./pi-manager.db"
	}

	db, err := store.Open(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to open database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	runSync := func() {
		log.Printf("sync: starting")
		start := time.Now()
		if err := scanner.Sync(ctx, managedDir, db); err != nil {
			log.Printf("sync: error: %v", err)
			return
		}
		log.Printf("sync: completed in %s", time.Since(start))
	}

	// Sync once at startup before accepting requests.
	runSync()

	// Sync every minute in the background.
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				runSync()
			case <-ctx.Done():
				return
			}
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/api/disk", handler.NewDiskHandler(managedDir))
	mux.Handle("/api/files", handler.NewFilesHandler(db))
	mux.Handle("/api/files/", handler.NewDeleteFileHandler(db))

	addr := ":" + port
	log.Printf("pi-manager starting on %s (MANAGED_DIR=%s, DB_PATH=%s)", addr, managedDir, dbPath)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
