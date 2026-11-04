package config

import (
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
	if err := f.SetSources([]Source{{Backend: "sm", Parent: "p1"}, {Backend: "storage", Parent: "b2"}}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	out := string(b)
	for _, want := range []string{"# my notes", "# fixed port for bookmarks", "listen: 127.0.0.1:9000", "theme: Monokai", "\n  - backend: storage\n    parent: b2"} {
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
		"typo key":     "readonly: true\n",
		"bad protect":  "protect: ['[']\n",
		"two defaults": "sources:\n  - {backend: sm, parent: a, default: true}\n  - {backend: sm, parent: b, default: true}\n",
		"kms on sm":    "sources:\n  - {backend: sm, parent: a, kmsKey: k}\n",
		"bad group":    "sources:\n  - {backend: sm, parent: a, group: plain}\n",
		"neg reveal":   "revealSeconds: -1\n",
		"bad tz":       "timeZone: mars\n",
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
