package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/secrets"
)

func TestWatcherReportsOtherWritesNotOwn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	body := "watch:\n  - {backend: storage, parent: demo-bucket, name: orders-dev-env}\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	store := secrets.NewDemo()
	s := New(testToken, store, cfg, nil, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.Demo = true
	var notified []Change
	s.watch().notify = func(c Change) { notified = append(notified, c) }
	ctx := context.Background()

	if got := s.CheckWatched(ctx); len(got) != 0 {
		t.Fatalf("first look should only record: %+v", got)
	}
	// someone else writes (straight to the store, not through this core)
	if _, err := store.Update(ctx, secrets.UpdateInput{Backend: secrets.Storage, Parent: "demo-bucket", Name: "orders-dev-env", Plaintext: []byte("A=2\n")}); err != nil {
		t.Fatal(err)
	}
	got := s.CheckWatched(ctx)
	if len(got) != 1 || got[0].Name != "orders-dev-env" || got[0].Version == "" || len(notified) != 1 {
		t.Fatalf("other write: got %+v notified %+v", got, notified)
	}
	// our own save through the api: no report
	h := s.Handler()
	if rec := post(h, "/api/secrets/update", `{"backend":"storage","parent":"demo-bucket","name":"orders-dev-env","plaintext":"QT0zCg=="}`); rec.Code != http.StatusOK {
		t.Fatalf("update: %d %s", rec.Code, rec.Body)
	}
	if got := s.CheckWatched(ctx); len(got) != 0 || len(notified) != 1 {
		t.Fatalf("own write reported: %+v", got)
	}
	// the change stays listed until acknowledged
	r := get(h, "/api/watch")
	if !strings.Contains(r.Body.String(), `"name":"orders-dev-env"`) {
		t.Fatalf("GET /api/watch: %s", r.Body)
	}
	post(h, "/api/watch/ack", `{"backend":"storage","parent":"demo-bucket","name":"orders-dev-env"}`)
	if r := get(h, "/api/watch"); strings.Contains(r.Body.String(), "orders-dev-env") {
		t.Fatalf("after ack: %s", r.Body)
	}
	// deleted by someone else
	if err := store.Delete(ctx, secrets.Ref{Backend: secrets.Storage, Parent: "demo-bucket", Name: "orders-dev-env"}); err != nil {
		t.Fatal(err)
	}
	if got := s.CheckWatched(ctx); len(got) != 1 || !got[0].Deleted {
		t.Fatalf("delete: %+v", got)
	}
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.Host = "127.0.0.1:8740"
	r.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}
