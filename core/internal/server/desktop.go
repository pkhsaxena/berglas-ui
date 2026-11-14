package server

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"berglas-ui/core/internal/secrets"
)

// Desktop is what a desktop shell offers the ui that a browser page cannot
// do for itself: a web view only lets a page touch the clipboard inside a
// click, so the clipboard auto-clear would fail, and links must open in the
// user's browser instead of replacing the app.
type Desktop interface {
	SetClipboard(text string) error
	ClipboardText() (string, error)
	OpenURL(u string) error
	// SaveFile asks where to save a file (a native Save dialog) and returns
	// the chosen path, or "" if the user cancelled.
	SaveFile(defaultName string) (string, error)
	// CanAuthenticate says whether Authenticate can ask the user (Touch ID
	// or the login password); Authenticate asks and reports whether they
	// passed. reason is shown in the system prompt.
	CanAuthenticate() bool
	Authenticate(reason string) (bool, error)
}

// exportName is a file name for a secret: its last path part, with
// characters a file name shouldn't hold replaced, and .env added to names
// ending in -env or _env.
func exportName(name string) string {
	n := name[strings.LastIndex(name, "/")+1:]
	n = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r < ' ' {
			return '_'
		}
		return r
	}, n)
	if n == "" {
		n = "secret"
	}
	if strings.HasSuffix(n, "-env") || strings.HasSuffix(n, "_env") {
		n += ".env"
	}
	return n
}

// writePrivate writes data to path readable by the owner only, also when the
// file already existed with a wider mode.
func writePrivate(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// DesktopHandler serves the same api and ui to a desktop shell's own web view
// (Wails), which hands requests to Go in-process with no network listener.
// Nothing else can reach it, so the localhost defences (Host check, token,
// Origin) do not apply; the config's read-only and protect rules still do.
// It adds /api/desktop: GET says the ui runs in the desktop app, and the
// clipboard and open routes go through d.
func (s *Server) DesktopHandler(d Desktop) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/desktop", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"desktop": true, "auth": d.CanAuthenticate()})
	})
	mux.HandleFunc("POST /api/desktop/clipboard", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Text string `json:"text"`
		}
		if !decode(w, r, &in) {
			return
		}
		if err := d.SetClipboard(in.Text); err != nil {
			writeError(w, http.StatusInternalServerError, "clipboard", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	// clear empties the clipboard only if it still holds ifEquals, so text
	// the user copied since is left alone. There is no route to read it.
	mux.HandleFunc("POST /api/desktop/clipboard/clear", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			IfEquals string `json:"ifEquals"`
		}
		if !decode(w, r, &in) {
			return
		}
		cur, err := d.ClipboardText()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "clipboard", err.Error())
			return
		}
		if cur != in.IfEquals {
			writeJSON(w, http.StatusOK, map[string]bool{"cleared": false})
			return
		}
		if err := d.SetClipboard(""); err != nil {
			writeError(w, http.StatusInternalServerError, "clipboard", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"cleared": true})
	})
	mux.HandleFunc("POST /api/desktop/open", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			URL string `json:"url"`
		}
		if !decode(w, r, &in) {
			return
		}
		u, err := url.Parse(in.URL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http" && u.Scheme != "mailto") {
			writeError(w, http.StatusBadRequest, "invalid", "only http, https and mailto links open outside the app")
			return
		}
		if err := d.OpenURL(u.String()); err != nil {
			writeError(w, http.StatusInternalServerError, "open", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	// authenticate asks for Touch ID or the login password (unlocking the ui).
	mux.HandleFunc("POST /api/desktop/authenticate", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Reason string `json:"reason"`
		}
		if !decode(w, r, &in) {
			return
		}
		if in.Reason == "" {
			in.Reason = "unlock berglas-ui"
		}
		ok, err := d.Authenticate(in.Reason)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": ok})
	})
	// save writes one version's value to a file the user picks, as plain
	// text with mode 0600. The core reads the value itself, so the request
	// carries only the ref. Protected names need the name typed, like a write;
	// each export goes to the audit log with its path.
	mux.HandleFunc("POST /api/desktop/save", func(w http.ResponseWriter, r *http.Request) {
		var in secrets.Ref
		if !decode(w, r, &in) {
			return
		}
		if s.cfg.Get().ProtectedFor(string(in.Backend), in.Parent, in.Name) && r.Header.Get(ConfirmHeader) != in.Name {
			writeError(w, http.StatusPreconditionRequired, "confirm_required", in.Name+" is protected by config — type its name to save it to a file")
			return
		}
		ctx, cancel := timeout(r)
		defer cancel()
		sec, err := s.svc.Read(ctx, in)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		path, err := d.SaveFile(exportName(in.Name))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save", err.Error())
			return
		}
		if path == "" {
			writeJSON(w, http.StatusOK, map[string]bool{"cancelled": true})
			return
		}
		if !filepath.IsAbs(path) {
			writeError(w, http.StatusInternalServerError, "save", fmt.Sprintf("not an absolute path: %q", path))
			return
		}
		err = writePrivate(path, sec.Plaintext)
		audit := s.record(ctx, auditEntry{Action: "export", Backend: string(in.Backend), Parent: in.Parent, Name: in.Name, Version: versionOf(sec), Path: path}, err)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save", err.Error())
			return
		}
		s.log.Info("secret exported", "backend", in.Backend, "parent", in.Parent, "name", in.Name, "path", path)
		writeOK(w, map[string]any{"path": path}, audit)
	})
	mux.Handle("/api/", s.apiMux())
	mux.Handle("/", s.uiHandler())
	return securityHeaders(mux)
}
