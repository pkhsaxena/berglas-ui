package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/gcpauth"
	"berglas-ui/core/internal/secrets"
)

// switchStore records the identities it is given.
type switchStore struct {
	*secrets.Memory
	got []gcpauth.Auth
}

func (s *switchStore) SetAuth(a gcpauth.Auth) { s.got = append(s.got, a) }

func TestCredentialsSwitchIdentity(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	body := "credentials:\n  choices:\n    - {label: deployer, impersonateServiceAccount: deploy@p.iam.gserviceaccount.com}\n    - {label: me}\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	st := &switchStore{Memory: secrets.NewDemo()}
	s := New(testToken, st, cfg, nil, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	s.Demo = true
	h := s.Handler()

	rec := post(h, "/api/credentials", `{"impersonateServiceAccount":"deploy@p.iam.gserviceaccount.com","quotaProject":"q"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("switch: %d %s", rec.Code, rec.Body)
	}
	if len(st.got) != 1 || st.got[0].Impersonate != "deploy@p.iam.gserviceaccount.com" || st.got[0].QuotaProject != "q" {
		t.Fatalf("store got %+v", st.got)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	r.Host = "127.0.0.1:8740"
	r.Header.Set("Authorization", "Bearer "+testToken)
	srec := httptest.NewRecorder()
	h.ServeHTTP(srec, r)
	var status statusResp
	_ = json.Unmarshal(srec.Body.Bytes(), &status)
	if status.Impersonating != "deploy@p.iam.gserviceaccount.com" || status.QuotaProject != "q" {
		t.Fatalf("status %+v", status)
	}
	saved, _ := os.ReadFile(path)
	if !strings.Contains(string(saved), "impersonateServiceAccount: deploy@p.iam.gserviceaccount.com") || !strings.Contains(string(saved), "label: deployer") {
		t.Fatalf("config not saved with choices kept:\n%s", saved)
	}

	// back to your own identity
	if rec := post(h, "/api/credentials", `{"impersonateServiceAccount":""}`); rec.Code != http.StatusOK || st.got[1].Impersonate != "" {
		t.Fatalf("back to adc: %d %+v", rec.Code, st.got)
	}
	// not an email: refused, nothing switched
	if rec := post(h, "/api/credentials", `{"impersonateServiceAccount":"nope"}`); rec.Code != http.StatusBadRequest || len(st.got) != 2 {
		t.Fatalf("bad sa: %d %+v", rec.Code, st.got)
	}
}
