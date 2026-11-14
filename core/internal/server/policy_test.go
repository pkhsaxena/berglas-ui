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

func TestCreateUsesSourceKMSKey(t *testing.T) {
	body := `{"backend":"storage","parent":"demo-bucket","name":"new-one","plaintext":"eA=="}`
	if rec := post(demoServer(t, ""), "/api/secrets/create", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("no key anywhere: %d %s, want 400", rec.Code, rec.Body)
	}
	h := demoServer(t, "sources:\n  - {backend: storage, parent: demo-bucket, kmsKey: projects/p/locations/global/keyRings/r/cryptoKeys/k}\n")
	rec := post(h, "/api/secrets/create", body)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "cryptoKeys/k") {
		t.Fatalf("key from config: %d %s", rec.Code, rec.Body)
	}
}

func TestAuditLogRecordsWritesWithoutValues(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "sub", "audit.log")
	h := demoServer(t, "auditLog: "+logPath+"\n")
	value := "dG9wLXNlY3JldC12YWx1ZQ==" // base64("top-secret-value")
	if rec := post(h, "/api/secrets/update", `{"backend":"storage","parent":"demo-bucket","name":"search-api-key","plaintext":"`+value+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("update: %d %s", rec.Code, rec.Body)
	}
	if rec := post(h, "/api/secrets/delete", `{"backend":"sm","parent":"demo-project","name":"missing"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing: %d", rec.Code)
	}
	b, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) != 2 {
		t.Fatalf("want 2 lines, got %d:\n%s", len(lines), b)
	}
	for _, want := range []string{`"action":"update"`, `"name":"search-api-key"`, `"result":"ok"`, `"actor":"demo"`, `"version":"`} {
		if !strings.Contains(lines[0], want) {
			t.Errorf("first line lacks %s: %s", want, lines[0])
		}
	}
	if !strings.Contains(lines[1], `"result":"error"`) || !strings.Contains(lines[1], `"action":"delete"`) {
		t.Errorf("second line should record the failed delete: %s", lines[1])
	}
	if strings.Contains(string(b), value) || strings.Contains(string(b), "top-secret-value") {
		t.Fatal("audit log contains the secret value")
	}
	if info, _ := os.Stat(logPath); info.Mode().Perm() != 0o600 {
		t.Errorf("audit log perm = %v, want 0600", info.Mode().Perm())
	}
}

func TestAuditFailureIsReported(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	// a path under a regular file cannot be created
	h := demoServer(t, "auditLog: "+filepath.Join(blocker, "audit.log")+"\n")
	rec := post(h, "/api/secrets/update", update)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"auditError"`) {
		t.Fatalf("want 200 with auditError, got %d %s", rec.Code, rec.Body)
	}
}

func TestWritableSourceStillWrites(t *testing.T) {
	h := demoServer(t, "sources:\n  - {backend: sm, parent: demo-project, readOnly: true}\n")
	if rec := post(h, "/api/secrets/update", update); rec.Code != http.StatusOK {
		t.Fatalf("update on a writable source: %d %s", rec.Code, rec.Body)
	}
}

func TestSkinRoundTrips(t *testing.T) {
	h := demoServer(t, "theme: Nord\n")
	if rec := post(h, "/api/config", `{"skin":"mac"}`); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"skin":"mac"`) {
		t.Fatalf("set skin: status %d body %s", rec.Code, rec.Body)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	r.Host = "127.0.0.1:8740"
	r.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if !strings.Contains(rec.Body.String(), `"skin":"mac"`) || !strings.Contains(rec.Body.String(), `"theme":"Nord"`) {
		t.Fatalf("get config lacks skin or theme: %s", rec.Body)
	}
}

func TestZoomIsSavedAndBounded(t *testing.T) {
	h := demoServer(t, "")
	if rec := post(h, "/api/config", `{"zoom":67}`); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"zoom":67`) {
		t.Fatalf("set zoom: %d %s", rec.Code, rec.Body)
	}
	for _, bad := range []string{`{"zoom":20}`, `{"zoom":500}`} {
		if rec := post(h, "/api/config", bad); rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: %d, want 400", bad, rec.Code)
		}
	}
}
