package server

import (
	"net/http"
	"net/url"
)

// Desktop is what a desktop shell offers the ui that a browser page cannot
// do for itself: a web view only lets a page touch the clipboard inside a
// click, so the clipboard auto-clear would fail, and links must open in the
// user's browser instead of replacing the app.
type Desktop interface {
	SetClipboard(text string) error
	ClipboardText() (string, error)
	OpenURL(u string) error
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
		writeJSON(w, http.StatusOK, map[string]bool{"desktop": true})
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
	mux.Handle("/api/", s.apiMux())
	mux.Handle("/", s.uiHandler())
	return securityHeaders(mux)
}
