package config

import (
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Defaults for settings left unset.
const (
	DefaultRevealSeconds         = 60
	DefaultClipboardClearSeconds = 30
)

// Settings is the resolved config the ui needs: defaults applied, paths
// expanded. It is what GET /api/config returns besides the raw sources.
type Settings struct {
	Theme                 string      `json:"theme"`
	ReadOnly              bool        `json:"readOnly"`
	Protect               []string    `json:"protect"`
	RevealSeconds         int         `json:"revealSeconds"`
	ClipboardClearSeconds int         `json:"clipboardClearSeconds"`
	AuditLog              string      `json:"auditLog"`
	Credentials           Credentials `json:"credentials"`
	Sources               []Source    `json:"sources"`
}

// Settings resolves c's defaults.
func (c Config) Settings() Settings {
	s := Settings{
		Theme: c.Theme, ReadOnly: c.ReadOnly, Protect: c.Protect,
		RevealSeconds: DefaultRevealSeconds, ClipboardClearSeconds: DefaultClipboardClearSeconds,
		AuditLog: ExpandHome(c.AuditLog), Credentials: c.Credentials, Sources: c.Sources,
	}
	if c.RevealSeconds != nil {
		s.RevealSeconds = *c.RevealSeconds
	}
	if c.ClipboardClearSeconds != nil {
		s.ClipboardClearSeconds = *c.ClipboardClearSeconds
	}
	if s.Protect == nil {
		s.Protect = []string{}
	}
	if s.Sources == nil {
		s.Sources = []Source{}
	}
	return s
}

// Source returns the configured source for backend/parent, or nil when the
// caller works on a bucket or project that is not in the config.
func (c Config) Source(backend, parent string) *Source {
	for i := range c.Sources {
		if c.Sources[i].Backend == backend && c.Sources[i].Parent == parent {
			return &c.Sources[i]
		}
	}
	return nil
}

// ReadOnlyFor reports whether writes to backend/parent are refused.
func (c Config) ReadOnlyFor(backend, parent string) bool {
	if c.ReadOnly {
		return true
	}
	s := c.Source(backend, parent)
	return s != nil && s.ReadOnly
}

// ProtectedFor reports whether name matches a global or per-source protect
// pattern, so writing or deleting it needs the name typed to confirm.
func (c Config) ProtectedFor(backend, parent, name string) bool {
	pats := c.Protect
	if s := c.Source(backend, parent); s != nil {
		pats = append(append([]string(nil), pats...), s.Protect...)
	}
	for _, p := range pats {
		if ok, _ := path.Match(p, name); ok {
			return true
		}
	}
	return false
}

// KMSKeyFor is the default kms key for new secrets in a storage bucket.
func (c Config) KMSKeyFor(backend, parent string) string {
	if s := c.Source(backend, parent); s != nil {
		return s.KMSKey
	}
	return ""
}

// ExpandHome turns a leading ~ into the user's home directory.
func ExpandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}
