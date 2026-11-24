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
	DefaultCacheSeconds          = 600
	DefaultCacheEntries          = 500
	DefaultZoom                  = 100
	MinZoom, MaxZoom             = 50, 200
)

// Settings is the resolved config the ui needs: defaults applied, paths
// expanded. It is what GET /api/config returns besides the raw sources.
type Settings struct {
	Skin                  string      `json:"skin"`
	Theme                 string      `json:"theme"`
	TimeZone              string      `json:"timeZone"`
	EnvOrder              string      `json:"envOrder"`
	ReadOnly              bool        `json:"readOnly"`
	Protect               []string    `json:"protect"`
	RevealSeconds         int         `json:"revealSeconds"`
	LockAfterMinutes      int         `json:"lockAfterMinutes"`
	ClipboardClearSeconds int         `json:"clipboardClearSeconds"`
	CacheSeconds          int         `json:"cacheSeconds"`
	CacheEntries          int         `json:"cacheEntries"`
	Zoom                  int         `json:"zoom"`
	AuditLog              string      `json:"auditLog"`
	Credentials           Credentials `json:"credentials"`
	Sources               []Source    `json:"sources"`
	Favorites             []SecretRef `json:"favorites"`
	Recent                []SecretRef `json:"recent"`
	RecentCollapsed       bool        `json:"recentCollapsed"`
	SidebarCollapsed      bool        `json:"sidebarCollapsed"`
	Watch                 []SecretRef `json:"watch"`
	WatchMinutes          int         `json:"watchMinutes"`
	AllowScreenCapture    bool        `json:"allowScreenCapture"`
	// Listen and OpenBrowser are the browser version's; shown as written
	Listen      string `json:"listen"`
	OpenBrowser bool   `json:"openBrowser"`
}

// Settings resolves c's defaults.
func (c Config) Settings() Settings {
	s := Settings{
		Skin: c.Skin, Theme: c.Theme, TimeZone: c.TimeZone, EnvOrder: c.EnvOrder, ReadOnly: c.ReadOnly, Protect: c.Protect,
		RevealSeconds: DefaultRevealSeconds, ClipboardClearSeconds: DefaultClipboardClearSeconds,
		CacheSeconds: DefaultCacheSeconds, CacheEntries: DefaultCacheEntries, Zoom: DefaultZoom,
		AuditLog: ExpandHome(c.AuditLog), Credentials: c.Credentials, Sources: c.Sources,
		LockAfterMinutes: c.LockAfterMinutes, AllowScreenCapture: c.AllowScreenCapture, Listen: c.Listen, OpenBrowser: c.OpenBrowser,
		Favorites: nonNil(c.Favorites), Recent: nonNil(c.Recent), RecentCollapsed: c.RecentCollapsed, SidebarCollapsed: c.SidebarCollapsed, Watch: nonNil(c.Watch), WatchMinutes: DefaultWatchMinutes,
	}
	if c.WatchMinutes > 0 {
		s.WatchMinutes = c.WatchMinutes
	}
	if c.RevealSeconds != nil {
		s.RevealSeconds = *c.RevealSeconds
	}
	if c.ClipboardClearSeconds != nil {
		s.ClipboardClearSeconds = *c.ClipboardClearSeconds
	}
	if c.CacheSeconds != nil {
		s.CacheSeconds = *c.CacheSeconds
	}
	if c.CacheEntries != nil {
		s.CacheEntries = *c.CacheEntries
	}
	if c.Zoom != nil {
		s.Zoom = *c.Zoom
	}
	if s.EnvOrder == "" {
		s.EnvOrder = "sorted"
	}
	if s.TimeZone == "" {
		s.TimeZone = "local"
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
// pattern, so writing or deleting it needs a typed confirmation.
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

// DefaultWatchMinutes is how often the mac app checks watched secrets.
const DefaultWatchMinutes = 5

// nonNil keeps lists as [] in json, so the ui never sees null.
func nonNil(r []SecretRef) []SecretRef {
	if r == nil {
		return []SecretRef{}
	}
	return r
}
