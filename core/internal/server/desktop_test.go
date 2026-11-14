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

type fakeDesktop struct {
	board  string
	opened []string
	// saveTo is what SaveFile returns ("" = the user cancelled)
	saveTo string
	asked  string
}

func (f *fakeDesktop) SetClipboard(t string) error    { f.board = t; return nil }
func (f *fakeDesktop) ClipboardText() (string, error) { return f.board, nil }
func (f *fakeDesktop) OpenURL(u string) error         { f.opened = append(f.opened, u); return nil }
func (f *fakeDesktop) CanAuthenticate() bool          { return true }
func (f *fakeDesktop) Authenticate(reason string) (bool, error) {
	f.asked = reason
	return f.saveTo != "no", nil
}
func (f *fakeDesktop) SaveFile(name string) (string, error) {
	f.asked = name
	return f.saveTo, nil
}

func desktopServer(t *testing.T, cfgBody string) (http.Handler, *fakeDesktop) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(cfgBody), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	d := &fakeDesktop{}
	s := New("", secrets.NewDemo(), cfg, nil, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.Demo = true
	return s.DesktopHandler(d), d
}

// desk sends a request the way the web view does: no token, host "wails".
func desk(h http.Handler, method, path, body string, headers ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "wails://wails"+path, strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestDesktopNeedsNoTokenButKeepsPolicy(t *testing.T) {
	h, _ := desktopServer(t, "protect: [\"search-*\"]\n")
	if rec := desk(h, http.MethodGet, "/api/desktop", ""); rec.Code != http.StatusOK {
		t.Fatalf("GET /api/desktop: %d", rec.Code)
	}
	if rec := desk(h, http.MethodGet, "/api/secrets?backend=storage&parent=demo-bucket", ""); rec.Code != http.StatusOK {
		t.Fatalf("list without token: %d %s", rec.Code, rec.Body)
	}
	if rec := desk(h, http.MethodPost, "/api/secrets/update", update); rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("protected write without confirm: %d, want 428", rec.Code)
	}
	if rec := desk(h, http.MethodPost, "/api/secrets/update", update, ConfirmHeader, "search-api-key"); rec.Code != http.StatusOK {
		t.Fatalf("protected write with confirm: %d %s", rec.Code, rec.Body)
	}
}

func TestDesktopClipboardClearsOnlyItsOwnValue(t *testing.T) {
	h, d := desktopServer(t, "")
	if rec := desk(h, http.MethodPost, "/api/desktop/clipboard", `{"text":"s3cret"}`); rec.Code != http.StatusOK || d.board != "s3cret" {
		t.Fatalf("set: %d board %q", rec.Code, d.board)
	}
	d.board = "copied later"
	if rec := desk(h, http.MethodPost, "/api/desktop/clipboard/clear", `{"ifEquals":"s3cret"}`); !strings.Contains(rec.Body.String(), `"cleared":false`) || d.board != "copied later" {
		t.Fatalf("clear of a replaced value: %s board %q", rec.Body, d.board)
	}
	d.board = "s3cret"
	if rec := desk(h, http.MethodPost, "/api/desktop/clipboard/clear", `{"ifEquals":"s3cret"}`); !strings.Contains(rec.Body.String(), `"cleared":true`) || d.board != "" {
		t.Fatalf("clear: %s board %q", rec.Body, d.board)
	}
}

func TestDesktopOpenAllowsOnlyWebAndMail(t *testing.T) {
	h, d := desktopServer(t, "")
	for _, u := range []string{"mailto:a@example.com", "https://example.com/x"} {
		if rec := desk(h, http.MethodPost, "/api/desktop/open", `{"url":"`+u+`"}`); rec.Code != http.StatusOK {
			t.Fatalf("open %s: %d", u, rec.Code)
		}
	}
	for _, u := range []string{"file:///etc/passwd", "javascript:alert(1)", "/Applications/Calculator.app", "x-apple.systempreferences:"} {
		if rec := desk(h, http.MethodPost, "/api/desktop/open", `{"url":"`+u+`"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("open %s: %d, want 400", u, rec.Code)
		}
	}
	if len(d.opened) != 2 {
		t.Fatalf("opened %v", d.opened)
	}
}

func TestBrowserHandlerHasNoDesktopRoutes(t *testing.T) {
	h := demoServer(t, "")
	r := httptest.NewRequest(http.MethodGet, "/api/desktop", nil)
	r.Host = "127.0.0.1:8740"
	r.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("browser GET /api/desktop: %d, want 404", rec.Code)
	}
}

func TestDesktopSaveWritesPrivateFileAndAudits(t *testing.T) {
	dir := t.TempDir()
	audit := filepath.Join(dir, "audit.log")
	h, d := desktopServer(t, "auditLog: "+audit+"\nprotect: [\"*-prod-env\"]\n")
	out := filepath.Join(dir, "out.env")
	// a stale wider file must end up 0600
	if err := os.WriteFile(out, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	d.saveTo = out
	rec := desk(h, http.MethodPost, "/api/desktop/save", `{"backend":"storage","parent":"demo-bucket","name":"orders-dev-env"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), out) {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	if d.asked != "orders-dev-env.env" {
		t.Fatalf("default name %q", d.asked)
	}
	st, err := os.Stat(out)
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v err %v", st.Mode(), err)
	}
	b, _ := os.ReadFile(out)
	if !strings.HasPrefix(string(b), "API_URL=") {
		t.Fatal("file does not hold the secret's value")
	}
	if strings.Contains(rec.Body.String(), "API_URL") {
		t.Fatal("the response must not carry the value")
	}
	log, _ := os.ReadFile(audit)
	if !strings.Contains(string(log), `"action":"export"`) || !strings.Contains(string(log), out) || strings.Contains(string(log), "API_URL") {
		t.Fatalf("audit line: %s", log)
	}

	// protected: refused without the typed name, allowed with it
	if rec := desk(h, http.MethodPost, "/api/desktop/save", `{"backend":"storage","parent":"demo-bucket","name":"orders-prod-env"}`); rec.Code != http.StatusPreconditionRequired {
		t.Fatalf("protected without confirm: %d", rec.Code)
	}
	if rec := desk(h, http.MethodPost, "/api/desktop/save", `{"backend":"storage","parent":"demo-bucket","name":"orders-prod-env"}`, ConfirmHeader, "orders-prod-env"); rec.Code != http.StatusOK {
		t.Fatalf("protected with confirm: %d %s", rec.Code, rec.Body)
	}

	// cancelled: nothing written
	d.saveTo = ""
	if rec := desk(h, http.MethodPost, "/api/desktop/save", `{"backend":"storage","parent":"demo-bucket","name":"tls-cert"}`); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "cancelled") {
		t.Fatalf("cancel: %d %s", rec.Code, rec.Body)
	}
}

func TestExportName(t *testing.T) {
	for in, want := range map[string]string{"payments-dev-env": "payments-dev-env.env", "a/b/tls-cert": "tls-cert", "x:y": "x_y", "db_env": "db_env.env"} {
		if got := exportName(in); got != want {
			t.Errorf("exportName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDesktopAuthenticate(t *testing.T) {
	h, d := desktopServer(t, "")
	if rec := desk(h, http.MethodGet, "/api/desktop", ""); !strings.Contains(rec.Body.String(), `"auth":true`) {
		t.Fatalf("GET /api/desktop: %s", rec.Body)
	}
	if rec := desk(h, http.MethodPost, "/api/desktop/authenticate", `{}`); !strings.Contains(rec.Body.String(), `"ok":true`) || d.asked != "unlock berglas-ui" {
		t.Fatalf("authenticate: %s (asked %q)", rec.Body, d.asked)
	}
	d.saveTo = "no"
	if rec := desk(h, http.MethodPost, "/api/desktop/authenticate", `{"reason":"x"}`); !strings.Contains(rec.Body.String(), `"ok":false`) {
		t.Fatalf("refused: %s", rec.Body)
	}
}
