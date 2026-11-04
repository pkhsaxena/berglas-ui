package config

import "testing"

func TestPolicy(t *testing.T) {
	zero := 0
	c := Config{
		Protect:               []string{"*-prod-*"},
		ClipboardClearSeconds: &zero,
		Sources: []Source{
			{Backend: "storage", Parent: "b1", KMSKey: "k1", Protect: []string{"root-*"}},
			{Backend: "sm", Parent: "p1", ReadOnly: true},
		},
	}
	if c.ReadOnlyFor("storage", "b1") || !c.ReadOnlyFor("sm", "p1") || c.ReadOnlyFor("sm", "other") {
		t.Fatal("per-source readOnly wrong")
	}
	c2 := c
	c2.ReadOnly = true
	if !c2.ReadOnlyFor("storage", "anything") {
		t.Fatal("global readOnly should cover every source")
	}
	for name, want := range map[string]bool{"svc-prod-env": true, "svc-dev-env": false, "root-token": true} {
		if got := c.ProtectedFor("storage", "b1", name); got != want {
			t.Errorf("ProtectedFor(b1, %s) = %v, want %v", name, got, want)
		}
	}
	if c.ProtectedFor("storage", "b2", "root-token") {
		t.Error("per-source pattern must not leak to other sources")
	}
	if c.KMSKeyFor("storage", "b1") != "k1" || c.KMSKeyFor("storage", "b2") != "" {
		t.Error("KMSKeyFor wrong")
	}
	s := c.Settings()
	if s.RevealSeconds != DefaultRevealSeconds || s.ClipboardClearSeconds != 0 {
		t.Errorf("settings = %+v; want default reveal and explicit 0 clipboard", s)
	}
}
