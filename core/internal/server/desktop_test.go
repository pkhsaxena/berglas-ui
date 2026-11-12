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
}

func (f *fakeDesktop) SetClipboard(t string) error    { f.board = t; return nil }
func (f *fakeDesktop) ClipboardText() (string, error) { return f.board, nil }
func (f *fakeDesktop) OpenURL(u string) error         { f.opened = append(f.opened, u); return nil }

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
