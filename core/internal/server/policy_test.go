package server

import (
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

// demoServer serves the in-memory demo store with the given config body.
func demoServer(t *testing.T, cfgBody string) http.Handler {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(cfgBody), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	s := New(testToken, secrets.NewDemo(), cfg, nil, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.Demo = true
	return s.Handler()
}

func post(h http.Handler, path, body string, headers ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.Host = "127.0.0.1:8740"
	r.Header.Set("Authorization", "Bearer "+testToken)
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

const update = `{"backend":"storage","parent":"demo-bucket","name":"search-api-key","plaintext":"eA=="}`

func TestReadOnlyRefusesWrites(t *testing.T) {
	for name, body := range map[string]string{
		"global":     "readOnly: true\n",
		"per source": "sources:\n  - {backend: storage, parent: demo-bucket, readOnly: true}\n",
	} {
		t.Run(name, func(t *testing.T) {
			h := demoServer(t, body)
			for _, path := range []string{"/api/secrets/update", "/api/secrets/delete"} {
				b := update
				if strings.HasSuffix(path, "delete") {
					b = `{"backend":"storage","parent":"demo-bucket","name":"search-api-key"}`
				}
				if rec := post(h, path, b); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "read_only") {
					t.Fatalf("%s: status %d body %s, want 403 read_only", path, rec.Code, rec.Body)
				}
			}
			// reads still work
			if rec := post(h, "/api/secrets/read", `{"backend":"storage","parent":"demo-bucket","name":"search-api-key"}`); rec.Code != http.StatusOK {
				t.Fatalf("read: %d %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestProtectedNamesNeedTypedConfirmation(t *testing.T) {
	h := demoServer(t, "protect: ['*-prod-*']\n")
	prod := `{"backend":"storage","parent":"demo-bucket","name":"payments-prod-env","plaintext":"eA=="}`
	if rec := post(h, "/api/secrets/update", prod); rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("no confirmation: %d %s, want 428", rec.Code, rec.Body)
	}
	if rec := post(h, "/api/secrets/update", prod, ConfirmHeader, "payments-dev-env"); rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("wrong name: %d, want 428", rec.Code)
	}
	if rec := post(h, "/api/secrets/update", prod, ConfirmHeader, "payments-prod-env"); rec.Code != http.StatusOK {
		t.Fatalf("typed name: %d %s, want 200", rec.Code, rec.Body)
	}
	if rec := post(h, "/api/secrets/update", update); rec.Code != http.StatusOK {
		t.Fatalf("unprotected name: %d %s, want 200", rec.Code, rec.Body)
	}
}

func TestWritableSourceStillWrites(t *testing.T) {
	h := demoServer(t, "sources:\n  - {backend: sm, parent: demo-project, readOnly: true}\n")
	if rec := post(h, "/api/secrets/update", update); rec.Code != http.StatusOK {
		t.Fatalf("update on a writable source: %d %s", rec.Code, rec.Body)
	}
}
