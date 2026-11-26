// Package config loads and saves the user's berglas-ui config file. The file
// is meant to be edited by hand too, so writes go through a yaml.Node tree and
// keep the user's comments and key order.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"go.yaml.in/yaml/v3"
)

// Source is a place to scan for secrets: a bucket (storage) or a project
// (sm), plus settings that apply only to it.
type Source struct {
	Backend string `yaml:"backend" json:"backend"`
	Parent  string `yaml:"parent" json:"parent"`
	// Label is shown instead of the bucket or project name.
	Label string `yaml:"label,omitempty" json:"label,omitempty"`
	// KMSKey is the default key for new secrets in a storage bucket.
	KMSKey string `yaml:"kmsKey,omitempty" json:"kmsKey,omitempty"`
	// ReadOnly refuses every write to this source.
	ReadOnly bool `yaml:"readOnly,omitempty" json:"readOnly,omitempty"`
	// Protect adds name patterns to the global list for this source.
	Protect []string `yaml:"protect,omitempty" json:"protect,omitempty"`
	// Group is a name pattern like "{service}-{env}-env" used to group the
	// list by its first placeholder.
	Group string `yaml:"group,omitempty" json:"group,omitempty"`
	// Default opens this source on startup.
	Default bool `yaml:"default,omitempty" json:"default,omitempty"`
}

// Credentials changes which Google identity the core acts as. Every field
// is optional; by default it uses Application Default Credentials as is.
type Credentials struct {
	// ImpersonateServiceAccount makes every call as this service account,
	// using the ADC identity's roles/iam.serviceAccountTokenCreator on it.
	ImpersonateServiceAccount string `yaml:"impersonateServiceAccount,omitempty" json:"impersonateServiceAccount,omitempty"`
	// QuotaProject bills api quota to this project.
	QuotaProject string `yaml:"quotaProject,omitempty" json:"quotaProject,omitempty"`
	// Choices are identities the ui offers to switch to ("act as"); the
	// two fields above say which one is in use.
	Choices []Identity `yaml:"choices,omitempty" json:"choices,omitempty"`
}

// Identity is one "act as" choice: a service account to impersonate (empty
// for your own ADC identity) and an optional quota project.
type Identity struct {
	Label                     string `yaml:"label,omitempty" json:"label,omitempty"`
	ImpersonateServiceAccount string `yaml:"impersonateServiceAccount,omitempty" json:"impersonateServiceAccount,omitempty"`
	QuotaProject              string `yaml:"quotaProject,omitempty" json:"quotaProject,omitempty"`
}

// Config is the file's shape. Every field is optional.
type Config struct {
	// Listen is the address to listen on; -listen and BERGLAS_UI_LISTEN win.
	Listen string `yaml:"listen,omitempty" json:"-"`
	// OpenBrowser opens the ui in the default browser on startup.
	OpenBrowser bool `yaml:"openBrowser,omitempty" json:"-"`
	// Skin is the ui design to load ("native" when unset or unknown). Each
	// skin has its own themes, so theme names may only mean something to one.
	Skin string `yaml:"skin,omitempty" json:"skin"`
	// Zoom scales the whole ui, in percent (50 to 200; unset means 100).
	// Zooming out gives the layout more room, like browser zoom.
	Zoom *int `yaml:"zoom,omitempty" json:"-"`
	// Theme is the ui theme preset name.
	Theme string `yaml:"theme,omitempty" json:"theme"`
	// TimeZone shows times in the system's zone ("local", the default) or "utc".
	TimeZone string `yaml:"timeZone,omitempty" json:"timeZone"`
	// EnvOrder shows .env secrets "sorted" (the default: sections by header,
	// keys inside) or in "file" order. The stored file is never reordered.
	EnvOrder string `yaml:"envOrder,omitempty" json:"envOrder"`
	// ReadOnly refuses every write, in every source.
	ReadOnly bool `yaml:"readOnly,omitempty" json:"readOnly"`
	// Protect lists secret name patterns (path.Match globs, e.g. "*-prod-*")
	// whose writes and deletes need a typed confirmation in the ui (the word
	// "confirm" to save; every delete asks for it too).
	Protect []string `yaml:"protect,omitempty" json:"protect"`
	// LockAfterMinutes locks the ui after this long without input; 0 (the
	// default) never locks by itself. In the mac app, unlocking asks for
	// Touch ID or the login password.
	LockAfterMinutes int `yaml:"lockAfterMinutes,omitempty" json:"-"`
	// RevealSeconds hides a revealed value after this long; 0 never hides.
	// Unset means 60.
	RevealSeconds *int `yaml:"revealSeconds,omitempty" json:"-"`
	// ClipboardClearSeconds clears a copied value from the clipboard after
	// this long, if it is still there; 0 never clears. Unset means 30.
	ClipboardClearSeconds *int `yaml:"clipboardClearSeconds,omitempty" json:"-"`
	// CacheSeconds is how long the ui keeps secret and version lists
	// (metadata, never values) to show at once on a revisit; 0 turns the
	// cache off. Unset means 600.
	CacheSeconds *int `yaml:"cacheSeconds,omitempty" json:"-"`
	// CacheEntries caps how many lists the ui keeps (one per source or
	// secret); the least recently used go first. Unset means 500.
	CacheEntries *int `yaml:"cacheEntries,omitempty" json:"-"`
	// AuditLog is a file that gets one JSON line per write (never values).
	// Empty turns it off.
	AuditLog string `yaml:"auditLog,omitempty" json:"auditLog"`
	// AllowScreenCapture lets screenshots, screen recording and screen sharing
	// see the mac app's window. Off by default: the window shows secrets.
	// Read at startup.
	AllowScreenCapture bool `yaml:"allowScreenCapture,omitempty" json:"allowScreenCapture"`
	// AllowUniversalClipboard lets the mac app's copies reach your other
	// Apple devices through Universal Clipboard. Off by default: a copy
	// stays on this Mac. Read on every copy.
	AllowUniversalClipboard bool `yaml:"allowUniversalClipboard,omitempty" json:"allowUniversalClipboard"`
	// Credentials picks the Google identity; the ui can switch between its
	// choices while running (SetIdentity).
	Credentials Credentials `yaml:"credentials,omitempty" json:"credentials"`
	// Sources are listed in the ui in this order.
	Sources []Source `yaml:"sources,omitempty" json:"sources"`
	// Favorites are secrets starred in the ui; Recent the last ones opened,
	// newest first. Both hold names only, never values.
	Favorites []SecretRef `yaml:"favorites,omitempty" json:"favorites"`
	Recent    []SecretRef `yaml:"recent,omitempty" json:"recent"`
	// RecentCollapsed folds the ui's recent list to its heading.
	RecentCollapsed bool `yaml:"recentCollapsed,omitempty" json:"recentCollapsed"`
	// SidebarCollapsed hides the ui's side bar (sources and the secret list).
	SidebarCollapsed bool `yaml:"sidebarCollapsed,omitempty" json:"sidebarCollapsed"`
	// Watch lists secrets the mac app checks for new versions every
	// WatchMinutes (default 5), with a notification when one appears.
	Watch        []SecretRef `yaml:"watch,omitempty" json:"watch"`
	WatchMinutes int         `yaml:"watchMinutes,omitempty" json:"-"`
}

// SecretRef names one secret: a source and a name.
type SecretRef struct {
	Backend string `yaml:"backend" json:"backend"`
	Parent  string `yaml:"parent" json:"parent"`
	Name    string `yaml:"name" json:"name"`
}

// Limits on the lists the ui keeps in the config.
const (
	MaxFavorites = 50
	MaxRecent    = 10
	MaxWatch     = 50
)

func validRefs(field string, refs []SecretRef, max int) error {
	if len(refs) > max {
		return fmt.Errorf("%s: at most %d", field, max)
	}
	for i, r := range refs {
		if r.Backend != "storage" && r.Backend != "sm" {
			return fmt.Errorf("%s[%d]: backend must be storage or sm, got %q", field, i, r.Backend)
		}
		if r.Parent == "" || r.Name == "" {
			return fmt.Errorf("%s[%d]: parent and name are required", field, i)
		}
	}
	return nil
}

// SetFavorites replaces the starred secrets and saves the file.
func (f *File) SetFavorites(refs []SecretRef) error {
	if err := validRefs("favorites", refs, MaxFavorites); err != nil {
		return err
	}
	return f.set("favorites", refs, func(c *Config) { c.Favorites = refs })
}

// SetRecent replaces the recently opened secrets and saves the file.
func (f *File) SetRecent(refs []SecretRef) error {
	if err := validRefs("recent", refs, MaxRecent); err != nil {
		return err
	}
	return f.set("recent", refs, func(c *Config) { c.Recent = refs })
}

// SetRecentCollapsed saves whether the recent list is folded.
func (f *File) SetRecentCollapsed(collapsed bool) error {
	return f.set("recentCollapsed", collapsed, func(c *Config) { c.RecentCollapsed = collapsed })
}

// SetWatch replaces the watched secrets and saves the file.
func (f *File) SetWatch(refs []SecretRef) error {
	if err := validRefs("watch", refs, MaxWatch); err != nil {
		return err
	}
	return f.set("watch", refs, func(c *Config) { c.Watch = refs })
}

const template = `# berglas-ui config. Edit by hand or from the ui; comments are kept.
# listen: 127.0.0.1:0          # address for the core; port 0 picks a free one
# openBrowser: true            # open the ui when the core starts
# skin: native                 # the ui design; the ui lists the skins it has
# theme: Dracula
# zoom: 100                    # scale the whole ui, 50-200 percent
# timeZone: local              # show times in the system zone, or utc
# envOrder: sorted             # .env views sorted by section and key, or file
# readOnly: false              # refuse every write
# protect: ["*-prod-*"]        # writes/deletes to matching names need a typed confirmation
# revealSeconds: 60            # hide revealed values after this long; 0 = never
# clipboardClearSeconds: 30    # clear copied values after this long; 0 = never
# cacheSeconds: 600            # keep secret/version lists (never values) this long; 0 = off
# cacheEntries: 500            # at most this many cached lists
# lockAfterMinutes: 10         # lock the ui after this long without input; 0 = never
# allowScreenCapture: false    # let screenshots and screen sharing see the mac app's window
# allowUniversalClipboard: false  # let the mac app's copies reach your other Apple devices
# watchMinutes: 5              # how often the mac app checks watched secrets
# auditLog: ~/.berglas-ui/audit.log   # one json line per write, never values
# credentials:
#   impersonateServiceAccount: reader@my-project.iam.gserviceaccount.com
#   quotaProject: my-project
# sources:
#   - backend: storage         # cloud storage + kms (berglas://bucket/...)
#     parent: my-bucket
#     label: team secrets
#     kmsKey: projects/my-project/locations/global/keyRings/berglas/cryptoKeys/berglas-key
#     group: "{service}-{env}-env"   # group the list by service
#     default: true            # open this source on startup
#   - backend: sm              # secret manager (sm://project/...)
#     parent: my-project
#     readOnly: true
`

// DefaultPath is ~/.berglas-ui/config.yaml on every platform (on Windows,
// %USERPROFILE%\.berglas-ui\config.yaml), next to where git keeps its config.
func DefaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".berglas-ui", "config.yaml"), nil
}

// File is a loaded config file. It is safe for concurrent use.
type File struct {
	path string
	mu   sync.Mutex
	doc  yaml.Node
	cfg  Config
}

// Load reads path. A missing file is not an error: it yields an empty config
// and is created on the first save.
func Load(path string) (*File, error) {
	f := &File{path: path}
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		b = []byte(template)
	} else if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	if err := yaml.Unmarshal(b, &f.doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	// Decode again with KnownFields so a typo like "readonly" is an error
	// instead of a silently ignored safety setting.
	dec := yaml.NewDecoder(bytes.NewReader(b))
	dec.KnownFields(true)
	if err := dec.Decode(&f.cfg); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if err := Validate(f.cfg); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return f, nil
}

// Validate checks a config for values the core cannot use.
func Validate(c Config) error {
	if err := validPatterns("protect", c.Protect); err != nil {
		return err
	}
	if c.EnvOrder != "" && c.EnvOrder != "sorted" && c.EnvOrder != "file" {
		return fmt.Errorf("envOrder must be sorted or file, got %q", c.EnvOrder)
	}
	if c.TimeZone != "" && c.TimeZone != "local" && c.TimeZone != "utc" {
		return fmt.Errorf("timeZone must be local or utc, got %q", c.TimeZone)
	}
	if c.WatchMinutes < 0 {
		return fmt.Errorf("watchMinutes must be 0 or more")
	}
	if c.Listen != "" {
		if _, _, err := net.SplitHostPort(c.Listen); err != nil {
			return fmt.Errorf("listen must be host:port (like 127.0.0.1:0), got %q", c.Listen)
		}
	}
	for _, l := range []struct {
		name string
		refs []SecretRef
		max  int
	}{{"favorites", c.Favorites, MaxFavorites}, {"recent", c.Recent, MaxRecent}, {"watch", c.Watch, MaxWatch}} {
		if err := validRefs(l.name, l.refs, l.max); err != nil {
			return err
		}
	}
	if c.LockAfterMinutes < 0 {
		return fmt.Errorf("lockAfterMinutes must be 0 or more")
	}
	if c.RevealSeconds != nil && *c.RevealSeconds < 0 {
		return fmt.Errorf("revealSeconds must be 0 or more")
	}
	if c.ClipboardClearSeconds != nil && *c.ClipboardClearSeconds < 0 {
		return fmt.Errorf("clipboardClearSeconds must be 0 or more")
	}
	if c.Zoom != nil && (*c.Zoom < MinZoom || *c.Zoom > MaxZoom) {
		return fmt.Errorf("zoom must be %d to %d (percent), got %d", MinZoom, MaxZoom, *c.Zoom)
	}
	if c.CacheSeconds != nil && *c.CacheSeconds < 0 {
		return fmt.Errorf("cacheSeconds must be 0 or more")
	}
	if c.CacheEntries != nil && *c.CacheEntries < 0 {
		return fmt.Errorf("cacheEntries must be 0 or more")
	}
	if sa := c.Credentials.ImpersonateServiceAccount; sa != "" && !strings.Contains(sa, "@") {
		return fmt.Errorf("credentials.impersonateServiceAccount must be a service account email, got %q", sa)
	}
	for i, ch := range c.Credentials.Choices {
		if sa := ch.ImpersonateServiceAccount; sa != "" && !strings.Contains(sa, "@") {
			return fmt.Errorf("credentials.choices[%d].impersonateServiceAccount must be a service account email, got %q", i, sa)
		}
	}
	seen := map[string]bool{}
	defaults := 0
	for i, s := range c.Sources {
		if s.Backend != "storage" && s.Backend != "sm" {
			return fmt.Errorf("sources[%d]: backend must be storage or sm, got %q", i, s.Backend)
		}
		if s.Parent == "" {
			return fmt.Errorf("sources[%d]: parent (bucket or project) is empty", i)
		}
		id := s.Backend + ":" + s.Parent
		if seen[id] {
			return fmt.Errorf("sources[%d]: %s is listed twice", i, id)
		}
		seen[id] = true
		if s.KMSKey != "" && s.Backend != "storage" {
			return fmt.Errorf("sources[%d]: kmsKey only applies to storage sources", i)
		}
		if err := validPatterns(fmt.Sprintf("sources[%d].protect", i), s.Protect); err != nil {
			return err
		}
		if s.Group != "" && !groupPlaceholder.MatchString(s.Group) {
			return fmt.Errorf("sources[%d].group needs at least one {placeholder}, got %q", i, s.Group)
		}
		if s.Default {
			defaults++
		}
	}
	if defaults > 1 {
		return fmt.Errorf("only one source can be default: true")
	}
	return nil
}

var groupPlaceholder = regexp.MustCompile(`\{[A-Za-z_][A-Za-z0-9_]*\}`)

func validPatterns(field string, pats []string) error {
	for _, p := range pats {
		if _, err := path.Match(p, ""); err != nil {
			return fmt.Errorf("%s: bad pattern %q: %w", field, p, err)
		}
	}
	return nil
}

// Path is the file's location.
func (f *File) Path() string { return f.path }

// Get returns a copy of the current config.
func (f *File) Get() Config {
	f.mu.Lock()
	defer f.mu.Unlock()
	c := f.cfg
	c.Sources = append([]Source(nil), f.cfg.Sources...)
	return c
}

// SetSources replaces the sources list and saves the file.
func (f *File) SetSources(s []Source) error {
	if s == nil {
		s = []Source{}
	}
	if err := Validate(Config{Sources: s}); err != nil {
		return err
	}
	return f.set("sources", s, func(c *Config) { c.Sources = s })
}

// SetEnvOrder sets how .env views are ordered ("sorted" or "file") and saves the file.
func (f *File) SetEnvOrder(order string) error {
	if err := Validate(Config{EnvOrder: order}); err != nil {
		return err
	}
	return f.set("envOrder", order, func(c *Config) { c.EnvOrder = order })
}

// SetTimeZone sets the time zone ("local" or "utc") and saves the file.
func (f *File) SetTimeZone(tz string) error {
	if err := Validate(Config{TimeZone: tz}); err != nil {
		return err
	}
	return f.set("timeZone", tz, func(c *Config) { c.TimeZone = tz })
}

// SetSkin sets the ui skin name and saves the file. The name is the ui's
// business: an unknown one loads the default skin.
func (f *File) SetSkin(name string) error {
	return f.set("skin", name, func(c *Config) { c.Skin = name })
}

// SetZoom sets the ui zoom in percent and saves the file.
func (f *File) SetZoom(percent int) error {
	if err := Validate(Config{Zoom: &percent}); err != nil {
		return err
	}
	return f.set("zoom", percent, func(c *Config) { c.Zoom = &percent })
}

// SetIdentity sets the service account to impersonate ("" for your own ADC
// identity) and the quota project, keeping the choices, and saves the file.
func (f *File) SetIdentity(serviceAccount, quotaProject string) error {
	cur := f.Get().Credentials
	cur.ImpersonateServiceAccount, cur.QuotaProject = serviceAccount, quotaProject
	if err := Validate(Config{Credentials: cur}); err != nil {
		return err
	}
	return f.set("credentials", cur, func(c *Config) { c.Credentials = cur })
}

// SetTheme sets the theme name and saves the file.
func (f *File) SetTheme(name string) error {
	return f.set("theme", name, func(c *Config) { c.Theme = name })
}

// Patch names the settings to change; a nil field is left as it is. Its json
// form is what POST /api/config takes. Credentials are not here: switching
// identity also swaps the core's auth, so it has its own route (SetIdentity).
type Patch struct {
	Listen                  *string      `json:"listen"`
	OpenBrowser             *bool        `json:"openBrowser"`
	Skin                    *string      `json:"skin"`
	Zoom                    *int         `json:"zoom"`
	Theme                   *string      `json:"theme"`
	TimeZone                *string      `json:"timeZone"`
	EnvOrder                *string      `json:"envOrder"`
	ReadOnly                *bool        `json:"readOnly"`
	Protect                 *[]string    `json:"protect"`
	LockAfterMinutes        *int         `json:"lockAfterMinutes"`
	RevealSeconds           *int         `json:"revealSeconds"`
	ClipboardClearSeconds   *int         `json:"clipboardClearSeconds"`
	CacheSeconds            *int         `json:"cacheSeconds"`
	CacheEntries            *int         `json:"cacheEntries"`
	AuditLog                *string      `json:"auditLog"`
	AllowScreenCapture      *bool        `json:"allowScreenCapture"`
	AllowUniversalClipboard *bool        `json:"allowUniversalClipboard"`
	Sources                 *[]Source    `json:"sources"`
	Favorites               *[]SecretRef `json:"favorites"`
	Recent                  *[]SecretRef `json:"recent"`
	RecentCollapsed         *bool        `json:"recentCollapsed"`
	SidebarCollapsed        *bool        `json:"sidebarCollapsed"`
	Watch                   *[]SecretRef `json:"watch"`
	WatchMinutes            *int         `json:"watchMinutes"`
}

// InvalidError is a patch the config cannot take (a bad value), as opposed
// to a file that could not be written.
type InvalidError struct{ Err error }

func (e *InvalidError) Error() string { return e.Err.Error() }
func (e *InvalidError) Unwrap() error { return e.Err }

// change is one key of a patch: its yaml value and how it lands in a Config.
type change struct {
	key   string
	value any
	apply func(*Config)
}

func (p Patch) changes() []change {
	var out []change
	add := func(key string, value any, apply func(*Config)) { out = append(out, change{key, value, apply}) }
	if v := p.Listen; v != nil {
		add("listen", *v, func(c *Config) { c.Listen = *v })
	}
	if v := p.OpenBrowser; v != nil {
		add("openBrowser", *v, func(c *Config) { c.OpenBrowser = *v })
	}
	if v := p.Skin; v != nil {
		add("skin", *v, func(c *Config) { c.Skin = *v })
	}
	if v := p.Zoom; v != nil {
		add("zoom", *v, func(c *Config) { c.Zoom = v })
	}
	if v := p.Theme; v != nil {
		add("theme", *v, func(c *Config) { c.Theme = *v })
	}
	if v := p.TimeZone; v != nil {
		add("timeZone", *v, func(c *Config) { c.TimeZone = *v })
	}
	if v := p.EnvOrder; v != nil {
		add("envOrder", *v, func(c *Config) { c.EnvOrder = *v })
	}
	if v := p.ReadOnly; v != nil {
		add("readOnly", *v, func(c *Config) { c.ReadOnly = *v })
	}
	if v := p.Protect; v != nil {
		list := append([]string{}, *v...)
		add("protect", list, func(c *Config) { c.Protect = list })
	}
	if v := p.LockAfterMinutes; v != nil {
		add("lockAfterMinutes", *v, func(c *Config) { c.LockAfterMinutes = *v })
	}
	if v := p.RevealSeconds; v != nil {
		add("revealSeconds", *v, func(c *Config) { c.RevealSeconds = v })
	}
	if v := p.ClipboardClearSeconds; v != nil {
		add("clipboardClearSeconds", *v, func(c *Config) { c.ClipboardClearSeconds = v })
	}
	if v := p.CacheSeconds; v != nil {
		add("cacheSeconds", *v, func(c *Config) { c.CacheSeconds = v })
	}
	if v := p.CacheEntries; v != nil {
		add("cacheEntries", *v, func(c *Config) { c.CacheEntries = v })
	}
	if v := p.AuditLog; v != nil {
		add("auditLog", *v, func(c *Config) { c.AuditLog = *v })
	}
	if v := p.AllowScreenCapture; v != nil {
		add("allowScreenCapture", *v, func(c *Config) { c.AllowScreenCapture = *v })
	}
	if v := p.AllowUniversalClipboard; v != nil {
		add("allowUniversalClipboard", *v, func(c *Config) { c.AllowUniversalClipboard = *v })
	}
	if v := p.Sources; v != nil {
		list := append([]Source{}, *v...)
		add("sources", list, func(c *Config) { c.Sources = list })
	}
	for _, l := range []struct {
		key  string
		refs *[]SecretRef
		set  func(*Config, []SecretRef)
	}{
		{"favorites", p.Favorites, func(c *Config, r []SecretRef) { c.Favorites = r }},
		{"recent", p.Recent, func(c *Config, r []SecretRef) { c.Recent = r }},
		{"watch", p.Watch, func(c *Config, r []SecretRef) { c.Watch = r }},
	} {
		if l.refs == nil {
			continue
		}
		list, set := append([]SecretRef{}, *l.refs...), l.set
		add(l.key, list, func(c *Config) { set(c, list) })
	}
	if v := p.RecentCollapsed; v != nil {
		add("recentCollapsed", *v, func(c *Config) { c.RecentCollapsed = *v })
	}
	if v := p.SidebarCollapsed; v != nil {
		add("sidebarCollapsed", *v, func(c *Config) { c.SidebarCollapsed = *v })
	}
	if v := p.WatchMinutes; v != nil {
		add("watchMinutes", *v, func(c *Config) { c.WatchMinutes = *v })
	}
	return out
}

// Apply changes every setting the patch names and saves the file once: all
// of them are written, or (a bad value, a file that cannot be written) none.
// A bad value is an *InvalidError.
func (f *File) Apply(p Patch) error {
	return f.apply(p.changes())
}

func (f *File) set(key string, value any, apply func(*Config)) error {
	return f.apply([]change{{key, value, apply}})
}

func (f *File) apply(changes []change) error {
	if len(changes) == 0 {
		return nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()

	// the whole config as it would be: one setting can make another invalid
	next := f.cfg
	for _, c := range changes {
		c.apply(&next)
	}
	if err := Validate(next); err != nil {
		return &InvalidError{err}
	}

	root := f.mapping()
	before := append([]*yaml.Node(nil), root.Content...)
	for _, c := range changes {
		v := new(yaml.Node)
		if err := v.Encode(c.value); err != nil {
			root.Content = before
			return err
		}
		replaced := false
		for i := 0; i+1 < len(root.Content); i += 2 {
			if root.Content[i].Value == c.key {
				old := root.Content[i+1]
				v.LineComment, v.FootComment = old.LineComment, old.FootComment
				root.Content[i+1] = v
				replaced = true
				break
			}
		}
		if !replaced {
			root.Content = append(root.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: c.key}, v)
		}
	}
	if err := f.write(); err != nil {
		// keep the tree in step with the file on disk
		root.Content = before
		return err
	}
	f.cfg = next
	return nil
}

// mapping returns the document's top-level mapping, creating it if the file
// was empty or only comments.
func (f *File) mapping() *yaml.Node {
	if f.doc.Kind != yaml.DocumentNode {
		f.doc = yaml.Node{Kind: yaml.DocumentNode, HeadComment: f.doc.HeadComment}
	}
	if len(f.doc.Content) == 0 || f.doc.Content[0].Kind != yaml.MappingNode {
		// A new, empty or comment-only file: the parser drops comments that
		// have no node to attach to, so start the file with the template.
		m := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map", HeadComment: strings.TrimSpace(template)}
		f.doc.Content = []*yaml.Node{m}
	}
	return f.doc.Content[0]
}

// write saves atomically (temp file + rename) with owner-only permissions.
func (f *File) write() error {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&f.doc); err != nil {
		return err
	}
	if err := enc.Close(); err != nil {
		return err
	}
	b := buf.Bytes()
	if err := os.MkdirAll(filepath.Dir(f.path), 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(f.path), ".config-*.yaml")
	if err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return fmt.Errorf("write config: %w", err)
	}
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return fmt.Errorf("write config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	if err := os.Rename(tmp.Name(), f.path); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}
