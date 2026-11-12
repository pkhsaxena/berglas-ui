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

// Credentials changes which Google identity the core acts as. Both fields
// are optional; by default it uses Application Default Credentials as is.
type Credentials struct {
	// ImpersonateServiceAccount makes every call as this service account,
	// using the ADC identity's roles/iam.serviceAccountTokenCreator on it.
	ImpersonateServiceAccount string `yaml:"impersonateServiceAccount,omitempty" json:"impersonateServiceAccount,omitempty"`
	// QuotaProject bills api quota to this project.
	QuotaProject string `yaml:"quotaProject,omitempty" json:"quotaProject,omitempty"`
}

// Config is the file's shape. Every field is optional.
type Config struct {
	// Listen is the address to listen on; -listen and BERGLAS_UI_LISTEN win.
	Listen string `yaml:"listen,omitempty" json:"-"`
	// OpenBrowser opens the ui in the default browser on startup.
	OpenBrowser bool `yaml:"openBrowser,omitempty" json:"-"`
	// Skin is the ui design to load ("terminal" when unset or unknown). Each
	// skin has its own themes, so theme names may only mean something to one.
	Skin string `yaml:"skin,omitempty" json:"skin"`
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
	// whose writes and deletes need the secret's name typed to confirm.
	Protect []string `yaml:"protect,omitempty" json:"protect"`
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
	// Credentials picks the Google identity; read at startup only.
	Credentials Credentials `yaml:"credentials,omitempty" json:"credentials"`
	// Sources are listed in the ui in this order.
	Sources []Source `yaml:"sources,omitempty" json:"sources"`
}

const template = `# berglas-ui config. Edit by hand or from the ui; comments are kept.
# listen: 127.0.0.1:0          # address for the core; port 0 picks a free one
# openBrowser: true            # open the ui when the core starts
# skin: terminal               # the ui design; the ui lists the skins it has
# theme: Dracula
# timeZone: local              # show times in the system zone, or utc
# envOrder: sorted             # .env views sorted by section and key, or file
# readOnly: false              # refuse every write
# protect: ["*-prod-*"]        # writes/deletes to matching names need the name typed
# revealSeconds: 60            # hide revealed values after this long; 0 = never
# clipboardClearSeconds: 30    # clear copied values after this long; 0 = never
# cacheSeconds: 600            # keep secret/version lists (never values) this long; 0 = off
# cacheEntries: 500            # at most this many cached lists
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
	if c.RevealSeconds != nil && *c.RevealSeconds < 0 {
		return fmt.Errorf("revealSeconds must be 0 or more")
	}
	if c.ClipboardClearSeconds != nil && *c.ClipboardClearSeconds < 0 {
		return fmt.Errorf("clipboardClearSeconds must be 0 or more")
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

// SetTheme sets the theme name and saves the file.
func (f *File) SetTheme(name string) error {
	return f.set("theme", name, func(c *Config) { c.Theme = name })
}

func (f *File) set(key string, value any, apply func(*Config)) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	var v yaml.Node
	if err := v.Encode(value); err != nil {
		return err
	}
	root := f.mapping()
	replaced := false
	for i := 0; i+1 < len(root.Content); i += 2 {
		if root.Content[i].Value == key {
			old := root.Content[i+1]
			v.LineComment, v.FootComment = old.LineComment, old.FootComment
			root.Content[i+1] = &v
			replaced = true
			break
		}
	}
	if !replaced {
		root.Content = append(root.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}, &v)
	}
	if err := f.write(); err != nil {
		return err
	}
	apply(&f.cfg)
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
