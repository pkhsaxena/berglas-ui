package server

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
)

// The core serves secrets over plain HTTP on a local port, so any web page the
// user has open could try to reach it. These checks stop that:
//
//   - loopbackHost rejects requests whose Host is not localhost, which defeats
//     DNS rebinding (evil.example resolving to 127.0.0.1).
//   - requireToken rejects API calls without the per-launch token, sent as an
//     HttpOnly SameSite=Strict cookie (browser) or a Bearer header (other
//     clients, such as a desktop shell).
//   - sameOrigin rejects cross-site browser requests via Origin and
//     Sec-Fetch-Site, as a second line behind the SameSite cookie.

func isLoopbackHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func loopbackHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackHost(r.Host) {
			http.Error(w, "error: host not allowed — open the ui via localhost", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

func sameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("Sec-Fetch-Site") {
		case "", "same-origin", "none":
		default:
			writeError(w, http.StatusForbidden, "cross_site", "cross-site request blocked")
			return
		}
		if o := r.Header.Get("Origin"); o != "" && o != "http://"+r.Host {
			writeError(w, http.StatusForbidden, "cross_site", "cross-origin request blocked")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) cookieName(r *http.Request) string {
	// Cookies ignore ports, so two instances on different ports would
	// overwrite each other's cookie without the port in the name.
	_, port, _ := net.SplitHostPort(r.Host)
	return "berglas_ui_" + port
}

func (s *Server) tokenOK(got string) bool {
	return got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) == 1
}

func (s *Server) requireToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := ""
		if a := r.Header.Get("Authorization"); strings.HasPrefix(a, "Bearer ") {
			got = strings.TrimPrefix(a, "Bearer ")
		} else if c, err := r.Cookie(s.cookieName(r)); err == nil {
			got = c.Value
		}
		if !s.tokenOK(got) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "open the link printed in the terminal that started berglas-ui")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleAuth exchanges the token from the printed launch link for a cookie, so
// the token leaves the address bar and browser history after one redirect.
func (s *Server) handleAuth(w http.ResponseWriter, r *http.Request) {
	if !s.tokenOK(r.URL.Query().Get("token")) {
		http.Error(w, "error: invalid token — use the link printed in the terminal", http.StatusUnauthorized)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(r),
		Value:    s.token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
