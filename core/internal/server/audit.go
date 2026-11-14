package server

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"berglas-ui/core/internal/secrets"
)

// auditEntry is one line of the audit log. It never holds secret values.
type auditEntry struct {
	Time    time.Time `json:"time"`
	Actor   string    `json:"actor,omitempty"`
	Action  string    `json:"action"`
	Backend string    `json:"backend"`
	Parent  string    `json:"parent"`
	Name    string    `json:"name,omitempty"`
	Version string    `json:"version,omitempty"` // the version a write created
	Members []string  `json:"members,omitempty"` // grant / revoke
	Path    string    `json:"path,omitempty"`    // export: the file written
	Result  string    `json:"result"`            // ok | error
	Error   string    `json:"error,omitempty"`
}

type auditor struct {
	mu    sync.Mutex
	actor string // cached account email; "" until known
}

// actorFor returns the acting account's email, asking Google once.
func (s *Server) actorFor(ctx context.Context) string {
	if s.Demo {
		return "demo"
	}
	s.audit.mu.Lock()
	defer s.audit.mu.Unlock()
	if s.audit.actor == "" {
		if ts, _, err := s.auth().TokenSource(ctx); err == nil {
			if tok, err := ts.Token(); err == nil {
				s.audit.actor = tokenEmail(ctx, tok.AccessToken)
			}
		}
	}
	return s.audit.actor
}

// record appends e to the configured audit log, if any. It returns "" or a
// message saying the write could not be logged; callers pass that on to the
// ui, since the secret write itself already happened.
func (s *Server) record(ctx context.Context, e auditEntry, opErr error) string {
	path := s.cfg.Get().Settings().AuditLog
	if path == "" {
		return ""
	}
	e.Time = time.Now().UTC()
	e.Actor = s.actorFor(ctx)
	e.Result = "ok"
	if opErr != nil {
		e.Result, e.Error = "error", opErr.Error()
	}
	line, err := json.Marshal(e)
	if err == nil {
		err = appendLine(path, line)
	}
	if err != nil {
		s.log.Error("audit log write failed", "path", path, "err", err)
		return fmt.Sprintf("the %s was not written to the audit log (%s): %v", e.Action, path, err)
	}
	return ""
}

func appendLine(path string, line []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(line, '\n')); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func versionOf(s secrets.Secret) string {
	if s.Backend == secrets.Storage && s.Generation != 0 {
		return fmt.Sprint(s.Generation)
	}
	return s.Version
}
