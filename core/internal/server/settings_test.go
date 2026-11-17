package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/secrets"
)

// settingsServer is demoServer that also hands back the config file's path.
func settingsServer(t *testing.T, cfgBody string) (http.Handler, string) {
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
	return s.Handler(), path
}

func TestSetConfigSavesEverySetting(t *testing.T) {
	h, path := settingsServer(t, "sources:\n  - {backend: storage, parent: demo-bucket}\n")
	rec := post(h, "/api/config", `{"readOnly":true,"protect":["*-prod-*"],"lockAfterMinutes":5,"revealSeconds":20,"clipboardClearSeconds":0,
		"allowScreenCapture":true,"cacheSeconds":30,"cacheEntries":7,"watchMinutes":2,"listen":"127.0.0.1:9000","openBrowser":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	var got config.Settings
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.ReadOnly || len(got.Protect) != 1 || got.LockAfterMinutes != 5 || got.RevealSeconds != 20 || got.ClipboardClearSeconds != 0 ||
		!got.AllowScreenCapture || got.CacheSeconds != 30 || got.CacheEntries != 7 || got.WatchMinutes != 2 || got.Listen != "127.0.0.1:9000" || !got.OpenBrowser {
		t.Fatalf("answer %+v", got)
	}
	// read-only is enforced at once, no restart
	if rec := post(h, "/api/secrets/update", update); rec.Code != http.StatusForbidden {
		t.Fatalf("write after readOnly: %d %s", rec.Code, rec.Body)
	}
	saved, _ := os.ReadFile(path)
	for _, want := range []string{"readOnly: true", "lockAfterMinutes: 5", "allowScreenCapture: true", "watchMinutes: 2", "listen: 127.0.0.1:9000"} {
		if !strings.Contains(string(saved), want) {
			t.Fatalf("file lacks %q:\n%s", want, saved)
		}
	}
}

func TestSetConfigRefusesABadValueWhole(t *testing.T) {
	h, path := settingsServer(t, "theme: Nord\n")
	rec := post(h, "/api/config", `{"readOnly":true,"revealSeconds":-5}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "revealSeconds") {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if saved, _ := os.ReadFile(path); strings.Contains(string(saved), "readOnly") {
		t.Fatalf("half of a refused save was written:\n%s", saved)
	}
	if rec := post(h, "/api/secrets/update", update); rec.Code != http.StatusOK {
		t.Fatalf("readOnly took effect although the save was refused: %d", rec.Code)
	}
}

func TestSafetyChangesAreAudited(t *testing.T) {
	dir := t.TempDir()
	log1, log2 := filepath.Join(dir, "a.log"), filepath.Join(dir, "b.log")
	h, _ := settingsServer(t, "auditLog: "+log1+"\nsources:\n  - {backend: storage, parent: demo-bucket}\n")

	// not a safety setting: nothing logged
	if rec := post(h, "/api/config", `{"theme":"Nord","cacheSeconds":5}`); rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if b, _ := os.ReadFile(log1); len(b) != 0 {
		t.Fatalf("theme change was audited: %s", b)
	}

	rec := post(h, "/api/config", `{"readOnly":true,"revealSeconds":0,"sources":[{"backend":"storage","parent":"demo-bucket","protect":["*-prod-*"]}]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	b, _ := os.ReadFile(log1)
	line := string(b)
	for _, want := range []string{`"action":"settings change"`, `"actor":"demo"`, "readOnly: false → true", "revealSeconds: 60 → 0", "sources[storage:demo-bucket].protect: [] → [*-prod-*]"} {
		if !strings.Contains(line, want) {
			t.Fatalf("audit line lacks %q: %s", want, line)
		}
	}
	if strings.Count(line, "\n") != 1 {
		t.Fatalf("want one line for one save, got: %s", line)
	}

	// moving the log is on record in the old file and the new one; turning it off, in the old one
	if rec := post(h, "/api/config", `{"auditLog":"`+log2+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	old, _ := os.ReadFile(log1)
	moved, _ := os.ReadFile(log2)
	if !strings.Contains(string(old), "auditLog: "+log1+" → "+log2) || !strings.Contains(string(moved), "auditLog: "+log1+" → "+log2) {
		t.Fatalf("move not in both logs:\n%s\n---\n%s", old, moved)
	}
	if rec := post(h, "/api/config", `{"auditLog":""}`); rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if moved, _ = os.ReadFile(log2); !strings.Contains(string(moved), "auditLog: "+log2+" → off") {
		t.Fatalf("turning the log off is not on record: %s", moved)
	}
}
