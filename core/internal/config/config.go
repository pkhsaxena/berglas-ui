// Package config loads and saves the user's berglas-ui config file. The file
// is meant to be edited by hand too, so writes go through a yaml.Node tree and
// keep the user's comments and key order.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"go.yaml.in/yaml/v3"
)

// Source is a place to scan for secrets: a bucket (storage) or a project (sm).
type Source struct {
	Backend string `yaml:"backend" json:"backend"`
	Parent  string `yaml:"parent" json:"parent"`
}

// Config is the file's shape. Every field is optional.
type Config struct {
	// Listen is the address to listen on; -listen and BERGLAS_UI_LISTEN win.
	Listen string `yaml:"listen,omitempty" json:"-"`
	// Theme is the ui theme preset name.
	Theme string `yaml:"theme,omitempty" json:"theme"`
	// Sources are listed in the ui in this order.
	Sources []Source `yaml:"sources,omitempty" json:"sources"`
}

const template = `# berglas-ui config. Edit by hand or from the ui; comments are kept.
# listen: 127.0.0.1:0      # address for the core; port 0 picks a free one
# theme: Dracula
# sources:
#   - backend: storage     # cloud storage + kms (berglas://bucket/...)
#     parent: my-bucket
#   - backend: sm          # secret manager (sm://project/...)
#     parent: my-project
`

// DefaultPath is <user config dir>/berglas-ui/config.yaml, e.g.
// ~/Library/Application Support/berglas-ui/config.yaml on macOS and
// %AppData%\berglas-ui\config.yaml on Windows.
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "berglas-ui", "config.yaml"), nil
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
	if err := f.doc.Decode(&f.cfg); err != nil && f.doc.Kind != 0 {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if err := Validate(f.cfg); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return f, nil
}

// Validate checks a config for values the core cannot use.
func Validate(c Config) error {
	seen := map[Source]bool{}
	for i, s := range c.Sources {
		if s.Backend != "storage" && s.Backend != "sm" {
			return fmt.Errorf("sources[%d]: backend must be storage or sm, got %q", i, s.Backend)
		}
		if s.Parent == "" {
			return fmt.Errorf("sources[%d]: parent (bucket or project) is empty", i)
		}
		if seen[s] {
			return fmt.Errorf("sources[%d]: %s:%s is listed twice", i, s.Backend, s.Parent)
		}
		seen[s] = true
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
