package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"berglas-ui/core/internal/secrets"
)

const testToken = "t0ken"

func newTestServer() http.Handler {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(testToken, &secrets.Service{}, nil, "test", log).Handler()
}

// apiReq builds a request to an endpoint that is rejected by validation before
// any Google Cloud call, so the tests run offline.
func apiReq(host string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/secrets?backend=bogus&parent=x", nil)
	r.Host = host
	return r
}

func TestSecurity(t *testing.T) {
	h := newTestServer()

	tests := []struct {
		name string
		req  func() *http.Request
		want int
	}{
		{"no token", func() *http.Request { return apiReq("127.0.0.1:8740") }, http.StatusUnauthorized},
		{"wrong token", func() *http.Request {
			r := apiReq("127.0.0.1:8740")
			r.Header.Set("Authorization", "Bearer nope")
			return r
		}, http.StatusUnauthorized},
		{"bearer token reaches handler", func() *http.Request {
			r := apiReq("127.0.0.1:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			return r
		}, http.StatusBadRequest},
		{"cookie token reaches handler", func() *http.Request {
			r := apiReq("localhost:8740")
			r.AddCookie(&http.Cookie{Name: "berglas_ui_8740", Value: testToken})
			return r
		}, http.StatusBadRequest},
		{"cookie for another port is ignored", func() *http.Request {
			r := apiReq("localhost:8740")
			r.AddCookie(&http.Cookie{Name: "berglas_ui_9999", Value: testToken})
			return r
		}, http.StatusUnauthorized},
		{"ipv6 loopback host", func() *http.Request {
			r := apiReq("[::1]:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			return r
		}, http.StatusBadRequest},
		{"dns rebinding host rejected even with token", func() *http.Request {
			r := apiReq("evil.example:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			return r
		}, http.StatusForbidden},
		{"cross-site fetch rejected", func() *http.Request {
			r := apiReq("127.0.0.1:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			r.Header.Set("Sec-Fetch-Site", "cross-site")
			return r
		}, http.StatusForbidden},
		{"foreign origin rejected", func() *http.Request {
			r := apiReq("127.0.0.1:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			r.Header.Set("Origin", "https://evil.example")
			return r
		}, http.StatusForbidden},
		{"same origin allowed", func() *http.Request {
			r := apiReq("127.0.0.1:8740")
			r.Header.Set("Authorization", "Bearer "+testToken)
			r.Header.Set("Origin", "http://127.0.0.1:8740")
			r.Header.Set("Sec-Fetch-Site", "same-origin")
			return r
		}, http.StatusBadRequest},
		{"ui without build is served on loopback", func() *http.Request {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.Host = "127.0.0.1:8740"
			return r
		}, http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, tt.req())
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, tt.want, rec.Body.String())
			}
			if got := rec.Header().Get("Cache-Control"); tt.want != http.StatusForbidden && got != "no-store" {
				t.Fatalf("Cache-Control = %q, want no-store", got)
			}
		})
	}
}

func TestAuthExchangesTokenForCookie(t *testing.T) {
	h := newTestServer()

	bad := httptest.NewRequest(http.MethodGet, "/auth?token=nope", nil)
	bad.Host = "127.0.0.1:8740"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, bad)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad token: status = %d, want 401", rec.Code)
	}

	good := httptest.NewRequest(http.MethodGet, "/auth?token="+testToken, nil)
	good.Host = "127.0.0.1:8740"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, good)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/" {
		t.Fatalf("good token: status = %d location = %q, want 303 to /", rec.Code, rec.Header().Get("Location"))
	}
	c := rec.Result().Cookies()
	if len(c) != 1 || c[0].Name != "berglas_ui_8740" || !c[0].HttpOnly || c[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("cookie = %+v, want one HttpOnly SameSite=Strict berglas_ui_8740", c)
	}
}

func TestReadRejectsUnknownFieldsAndDestinationRefs(t *testing.T) {
	h := newTestServer()
	for name, tc := range map[string]struct {
		path, body string
		want       int
	}{
		"unknown field":         {"/api/secrets/read", `{"backend":"sm","parent":"p","name":"n","extra":1}`, http.StatusBadRequest},
		"destination reference": {"/api/resolve", `{"ref":"sm://p/n?destination=/tmp/x"}`, http.StatusBadRequest},
		"not a reference":       {"/api/resolve", `{"ref":"plain"}`, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
			r.Host = "127.0.0.1:8740"
			r.Header.Set("Authorization", "Bearer "+testToken)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, r)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}
