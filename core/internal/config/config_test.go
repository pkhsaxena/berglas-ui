package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMissingFileIsEmptyAndCreatedOnSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "config.yaml")
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if c := f.Get(); c.Theme != "" || len(c.Sources) != 0 {
		t.Fatalf("want empty config, got %+v", c)
	}
	if err := f.SetSources([]Source{{Backend: "storage", Parent: "b1"}}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("perm = %v, want 0600", info.Mode().Perm())
	}
	if b, _ := os.ReadFile(path); !strings.HasPrefix(string(b), "# berglas-ui config.") {
		t.Fatalf("new file should start with the commented template:\n%s", b)
	}
	g, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if s := g.Get().Sources; len(s) != 1 || s[0].Parent != "b1" {
		t.Fatalf("reloaded sources = %+v", s)
	}
}

func TestWritesKeepCommentsAndOtherKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	in := "# my notes\nlisten: 127.0.0.1:9000 # fixed port for bookmarks\ntheme: Nord\nsources:\n  - backend: sm\n    parent: p1\n"
	if err := os.WriteFile(path, []byte(in), 0o600); err != nil {
		t.Fatal(err)
	}
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if c := f.Get(); c.Listen != "127.0.0.1:9000" || c.Theme != "Nord" {
		t.Fatalf("loaded %+v", c)
	}
	if err := f.SetTheme("Monokai"); err != nil {
		t.Fatal(err)
	}
	if err := f.SetSkin("mac"); err != nil {
		t.Fatal(err)
	}
	if c := f.Get(); c.Skin != "mac" {
		t.Fatalf("skin not applied: %+v", c)
	}
	if err := f.SetSources([]Source{{Backend: "sm", Parent: "p1"}, {Backend: "storage", Parent: "b2"}}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	out := string(b)
	for _, want := range []string{"# my notes", "# fixed port for bookmarks", "listen: 127.0.0.1:9000", "theme: Monokai", "skin: mac", "\n  - backend: storage\n    parent: b2"} {
		if !strings.Contains(out, want) {
			t.Errorf("saved file lacks %q:\n%s", want, out)
		}
	}
}

func TestInvalidConfigIsRejected(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	for name, body := range map[string]string{
		"bad backend":  "sources:\n  - backend: gcs\n    parent: b\n",
		"empty parent": "sources:\n  - backend: sm\n",
		"duplicate":    "sources:\n  - {backend: sm, parent: p}\n  - {backend: sm, parent: p}\n",
		"not yaml":     "sources: [",
		"negative ttl": "cacheSeconds: -1\n",
		"neg entries":  "cacheEntries: -5\n",
		"zoom too low": "zoom: 10\n",
		"typo key":     "readonly: true\n",
		"bad protect":  "protect: ['[']\n",
		"two defaults": "sources:\n  - {backend: sm, parent: a, default: true}\n  - {backend: sm, parent: b, default: true}\n",
		"kms on sm":    "sources:\n  - {backend: sm, parent: a, kmsKey: k}\n",
		"bad group":    "sources:\n  - {backend: sm, parent: a, group: plain}\n",
		"neg reveal":   "revealSeconds: -1\n",
		"bad tz":       "timeZone: mars\n",
		"bad order":    "envOrder: random\n",
		"bad sa":       "credentials: {impersonateServiceAccount: nope}\n",
	} {
		t.Run(name, func(t *testing.T) {
			if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path); err == nil {
				t.Fatal("want error")
			}
		})
	}
}

func TestFavoritesRecentWatchRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	ref := SecretRef{Backend: "storage", Parent: "b", Name: "orders-prod-env"}
	if err := f.SetFavorites([]SecretRef{ref}); err != nil {
		t.Fatal(err)
	}
	if err := f.SetRecent([]SecretRef{ref}); err != nil {
		t.Fatal(err)
	}
	if err := f.SetWatch([]SecretRef{ref}); err != nil {
		t.Fatal(err)
	}
	if err := f.SetRecentCollapsed(true); err != nil {
		t.Fatal(err)
	}
	again, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	s := again.Get().Settings()
	if len(s.Favorites) != 1 || s.Favorites[0] != ref || len(s.Recent) != 1 || len(s.Watch) != 1 || s.WatchMinutes != DefaultWatchMinutes || !s.RecentCollapsed {
		t.Fatalf("settings %+v", s)
	}
	if err := f.SetFavorites([]SecretRef{{Backend: "x", Parent: "b", Name: "n"}}); err == nil {
		t.Fatal("bad backend accepted")
	}
	if err := f.SetRecent(make([]SecretRef, MaxRecent+1)); err == nil {
		t.Fatal("too many recent accepted")
	}
}

func TestApplyWritesSeveralSettingsOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	body := "# mine\nreadOnly: false # keep me\nsources:\n  - {backend: storage, parent: b1}\ntheme: Nord\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	yes, reveal, lock, zero := true, 15, 10, 0
	protect := []string{"*-prod-*"}
	audit, listen := "~/audit.log", "127.0.0.1:8740"
	if err := f.Apply(Patch{
		ReadOnly: &yes, Protect: &protect, RevealSeconds: &reveal, LockAfterMinutes: &lock, ClipboardClearSeconds: &zero,
		AllowScreenCapture: &yes, CacheSeconds: &zero, CacheEntries: &lock, WatchMinutes: &lock, AuditLog: &audit, Listen: &listen, OpenBrowser: &yes,
	}); err != nil {
		t.Fatal(err)
	}
	again, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	s := again.Get().Settings()
	if !s.ReadOnly || len(s.Protect) != 1 || s.RevealSeconds != 15 || s.LockAfterMinutes != 10 || s.ClipboardClearSeconds != 0 ||
		!s.AllowScreenCapture || s.CacheSeconds != 0 || s.CacheEntries != 10 || s.WatchMinutes != 10 || s.Listen != listen || !s.OpenBrowser ||
		!strings.HasSuffix(s.AuditLog, "/audit.log") || strings.HasPrefix(s.AuditLog, "~") || s.Theme != "Nord" || len(s.Sources) != 1 {
		t.Fatalf("settings %+v", s)
	}
	b, _ := os.ReadFile(path)
	if !strings.Contains(string(b), "# mine") || !strings.Contains(string(b), "readOnly: true # keep me") {
		t.Fatalf("comments lost:\n%s", b)
	}
	if st, _ := os.Stat(path); st.Mode().Perm() != 0o600 {
		t.Fatalf("mode %o", st.Mode().Perm())
	}
	if got := f.Get().Settings(); !got.ReadOnly || got.RevealSeconds != 15 {
		t.Fatalf("in memory %+v", got)
	}
}

func TestApplyIsAllOrNothing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	yes, bad := true, -1
	for name, p := range map[string]Patch{
		"negative timer": {ReadOnly: &yes, RevealSeconds: &bad},
		"bad pattern":    {ReadOnly: &yes, Protect: &[]string{"[a"}},
		"bad listen":     {ReadOnly: &yes, Listen: ptr("nope")},
		"zoom range":     {ReadOnly: &yes, Zoom: ptr(10)},
		"two defaults":   {ReadOnly: &yes, Sources: &[]Source{{Backend: "storage", Parent: "a", Default: true}, {Backend: "sm", Parent: "b", Default: true}}},
	} {
		err := f.Apply(p)
		var invalid *InvalidError
		if !errors.As(err, &invalid) {
			t.Fatalf("%s: err %v, want an InvalidError", name, err)
		}
		if f.Get().ReadOnly {
			t.Fatalf("%s: readOnly applied although the patch was refused", name)
		}
		if _, err := os.Stat(path); err == nil {
			t.Fatalf("%s: file written although the patch was refused", name)
		}
	}
	if err := f.Apply(Patch{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("an empty patch wrote the file")
	}
}

func ptr[T any](v T) *T { return &v }

func TestSidebarCollapsedRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	f, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if f.Get().Settings().SidebarCollapsed {
		t.Fatal("the side bar starts open")
	}
	yes := true
	if err := f.Apply(Patch{SidebarCollapsed: &yes}); err != nil {
		t.Fatal(err)
	}
	again, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !again.Get().Settings().SidebarCollapsed {
		t.Fatalf("sidebarCollapsed not kept: %+v", again.Get().Settings())
	}
}
