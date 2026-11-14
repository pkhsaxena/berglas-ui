package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"berglas-ui/core/internal/secrets"
)

// The drift route compares the keys of several .env secrets (say one
// service's dev, staging and prod) without sending any value to the ui: each
// value becomes a fingerprint, an HMAC under a key that exists only in this
// process. Equal values get equal fingerprints within one run, so the ui can
// show "same as dev" or "missing", but a fingerprint can't be checked against
// a guessed value outside the core, and it changes every run.

// maxDriftSecrets bounds one request: a service rarely has more environments.
const maxDriftSecrets = 12

// driftKey is the process's fingerprint key, made on first use.
var driftKey = sync.OnceValue(func() []byte {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		panic("drift: no randomness: " + err.Error())
	}
	return k
})

func fingerprint(v string) string {
	m := hmac.New(sha256.New, driftKey())
	m.Write([]byte(v))
	return hex.EncodeToString(m.Sum(nil))[:16]
}

// envPair matches ui/src/core/envfile.ts PAIR: optional export, KEY, =, value.
var envPair = regexp.MustCompile(`^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s?(.*)$`)

// unquote drops one matching pair of surrounding quotes, like ui/src/core/diff.ts.
func unquote(v string) string {
	if len(v) >= 2 && (v[0] == '"' || v[0] == '\'') && v[len(v)-1] == v[0] {
		return v[1 : len(v)-1]
	}
	return v
}

type driftKeyInfo struct {
	Key string `json:"key"`
	// FP fingerprints the value without surrounding quotes, so "x" and x
	// match; Exact fingerprints it as written, to tell quote-only changes.
	FP    string `json:"fp"`
	Exact string `json:"exact"`
	Empty bool   `json:"empty,omitempty"`
}

type driftSecret struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
	// Env is false when the value isn't a .env file; Value then fingerprints the whole value
	Env   bool           `json:"env"`
	Keys  []driftKeyInfo `json:"keys,omitempty"`
	Value string         `json:"value,omitempty"`
	Error string         `json:"error,omitempty"`
}

// envKeys parses a .env text the way the ui does: the last line for a key
// wins, keys in first-seen order. ok is false unless at least 80% of the
// non-blank, non-comment lines are KEY=value (envfile.ts looksLikeEnv).
func envKeys(text string) (keys []driftKeyInfo, ok bool) {
	idx := map[string]int{}
	lines, pairs := 0, 0
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSuffix(line, "\r")
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		lines++
		m := envPair.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		pairs++
		k := driftKeyInfo{Key: m[1], FP: fingerprint(unquote(m[2])), Exact: fingerprint(m[2]), Empty: unquote(m[2]) == ""}
		if i, seen := idx[m[1]]; seen {
			keys[i] = k
		} else {
			idx[m[1]] = len(keys)
			keys = append(keys, k)
		}
	}
	return keys, lines > 0 && pairs*5 >= lines*4
}

func (s *Server) handleDrift(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Backend secrets.Backend `json:"backend"`
		Parent  string          `json:"parent"`
		Names   []string        `json:"names"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Names) == 0 || len(in.Names) > maxDriftSecrets {
		writeError(w, http.StatusBadRequest, "invalid", "compare 1 to 12 secrets at a time")
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	out := make([]driftSecret, len(in.Names))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i, name := range in.Names {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			out[i] = s.driftOne(ctx, secrets.Ref{Backend: in.Backend, Parent: in.Parent, Name: name})
		}()
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"secrets": out})
}

func (s *Server) driftOne(ctx context.Context, ref secrets.Ref) driftSecret {
	d := driftSecret{Name: ref.Name}
	sec, err := s.svc.Read(ctx, ref)
	if err != nil {
		// the message names the secret and the cause, never a value
		d.Error = err.Error()
		return d
	}
	d.Version = versionOf(sec)
	text := string(sec.Plaintext)
	if utf8.ValidString(text) {
		d.Keys, d.Env = envKeys(text)
	}
	if !d.Env {
		d.Keys = nil
		d.Value = fingerprint(text)
	}
	return d
}
