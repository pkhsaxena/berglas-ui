package server

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/secrets"
)

// The watcher checks the config's watched secrets for new versions every
// watchMinutes, from the core, so it keeps working while the window is in
// the background. A change it finds is kept until the ui acknowledges it
// (opening the secret), and handed to notify, which the mac app turns into
// a system notification. Writes made through this core are marked seen, so
// your own saves never notify you. Only versions and times are read, never
// values.

// Change is a watched secret that moved on since it was last seen.
type Change struct {
	Backend string    `json:"backend"`
	Parent  string    `json:"parent"`
	Name    string    `json:"name"`
	Version string    `json:"version,omitempty"`
	Deleted bool      `json:"deleted,omitempty"`
	At      time.Time `json:"at"`
}

type watcher struct {
	mu      sync.Mutex
	seen    map[string]string // ref key -> latest version id ("-" when deleted)
	changes map[string]Change
	notify  func(Change)
	checked time.Time
}

func refKey(backend, parent, name string) string { return backend + ":" + parent + "/" + name }

func (s *Server) watch() *watcher {
	s.watchOnce.Do(func() { s.watcher = &watcher{seen: map[string]string{}, changes: map[string]Change{}} })
	return s.watcher
}

// StartWatcher checks the watched secrets now and then every watchMinutes
// until ctx ends. notify may be nil (the browser core shows changes in the
// ui only).
func (s *Server) StartWatcher(ctx context.Context, notify func(Change)) {
	w := s.watch()
	w.mu.Lock()
	w.notify = notify
	w.mu.Unlock()
	go func() {
		for {
			s.CheckWatched(ctx)
			mins := s.cfg.Get().Settings().WatchMinutes
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(mins) * time.Minute):
			}
		}
	}()
}

// CheckWatched compares each watched secret's newest version with the one
// last seen. The first look at a secret only records it.
func (s *Server) CheckWatched(ctx context.Context) []Change {
	w := s.watch()
	var found []Change
	for _, r := range s.cfg.Get().Watch {
		ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		versions, err := s.svc.Versions(ctx, secrets.Ref{Backend: secrets.Backend(r.Backend), Parent: r.Parent, Name: r.Name})
		cancel()
		latest := ""
		switch {
		case err == nil && len(versions) > 0:
			latest = versionOf(versions[0])
		case err == nil, errors.Is(err, secrets.ErrNotFound) || isNotFound(err):
			latest = "-"
		default:
			s.log.Warn("watch: could not check", "name", r.Name, "err", err)
			continue
		}
		key := refKey(r.Backend, r.Parent, r.Name)
		w.mu.Lock()
		before, known := w.seen[key]
		w.seen[key] = latest
		if known && before != latest {
			c := Change{Backend: r.Backend, Parent: r.Parent, Name: r.Name, At: time.Now()}
			if latest == "-" {
				c.Deleted = true
			} else {
				c.Version = latest
			}
			w.changes[key] = c
			found = append(found, c)
		}
		notify := w.notify
		w.mu.Unlock()
		if known && before != latest && notify != nil {
			notify(w.changes[key])
		}
	}
	w.mu.Lock()
	w.checked = time.Now()
	w.mu.Unlock()
	return found
}

// isNotFound reports the berglas library's own not-found errors, which do
// not wrap secrets.ErrNotFound.
func isNotFound(err error) bool {
	code, _ := classify(err)
	return code == http.StatusNotFound
}

// markSeen records a version written through this core, so the watcher
// doesn't report your own save.
func (s *Server) markSeen(backend, parent, name, version string) {
	w := s.watch()
	w.mu.Lock()
	defer w.mu.Unlock()
	key := refKey(backend, parent, name)
	if _, watched := w.seen[key]; watched || s.isWatched(backend, parent, name) {
		w.seen[key] = version
	}
}

func (s *Server) isWatched(backend, parent, name string) bool {
	for _, r := range s.cfg.Get().Watch {
		if r == (config.SecretRef{Backend: backend, Parent: parent, Name: name}) {
			return true
		}
	}
	return false
}

func (s *Server) handleWatchList(w http.ResponseWriter, r *http.Request) {
	wt := s.watch()
	wt.mu.Lock()
	out := make([]Change, 0, len(wt.changes))
	for _, c := range wt.changes {
		out = append(out, c)
	}
	checked := wt.checked
	wt.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"changes": out, "checkedAt": checked})
}

// handleWatchAck forgets a reported change (the user opened the secret).
func (s *Server) handleWatchAck(w http.ResponseWriter, r *http.Request) {
	var in config.SecretRef
	if !decode(w, r, &in) {
		return
	}
	wt := s.watch()
	wt.mu.Lock()
	delete(wt.changes, refKey(in.Backend, in.Parent, in.Name))
	wt.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleWatchCheck checks the watched secrets now.
func (s *Server) handleWatchCheck(w http.ResponseWriter, r *http.Request) {
	found := s.CheckWatched(r.Context())
	if found == nil {
		found = []Change{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": found})
}
