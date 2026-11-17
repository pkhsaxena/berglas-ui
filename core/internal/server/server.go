// Package server exposes the secrets service as a JSON API on localhost and
// optionally serves the static UI.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"
	"google.golang.org/api/googleapi"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/gcpauth"
	"berglas-ui/core/internal/secrets"
)

// maxBody caps request bodies. Secret Manager values are at most 64 KiB;
// Cloud Storage values can be larger, so this leaves headroom.
const maxBody = 8 << 20

// Server is the HTTP API. UI may be nil to run the API alone.
type Server struct {
	token   string
	svc     secrets.Store
	cfg     *config.File
	ui      fs.FS
	version string
	log     *slog.Logger

	// Demo marks an in-memory store: /api/status skips the credential check
	// and says that nothing reaches Google Cloud.
	Demo bool
	// ThrowawayConfig marks the config as a temporary demo file.
	ThrowawayConfig bool
	// Auth is the identity /api/status checks; it should match the store's.
	// Set it before serving; afterwards POST /api/credentials changes it.
	Auth   gcpauth.Auth
	authMu sync.RWMutex

	watcher   *watcher
	watchOnce sync.Once

	audit auditor
}

func (s *Server) auth() gcpauth.Auth {
	s.authMu.RLock()
	defer s.authMu.RUnlock()
	return s.Auth
}

// authSwitcher is a store whose identity can change while running (Service).
type authSwitcher interface{ SetAuth(gcpauth.Auth) }

// handleCredentials switches the identity the core acts as: saves it to the
// config, then gives the store and /api/status the new one. Only the
// service account to impersonate and the quota project can change; the ADC
// login itself is gcloud's.
func (s *Server) handleCredentials(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ImpersonateServiceAccount string `json:"impersonateServiceAccount"`
		QuotaProject              string `json:"quotaProject"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := s.cfg.SetIdentity(in.ImpersonateServiceAccount, in.QuotaProject); err != nil {
		writeError(w, http.StatusBadRequest, "invalid", err.Error())
		return
	}
	a := gcpauth.Auth{Impersonate: in.ImpersonateServiceAccount, QuotaProject: in.QuotaProject}
	if sw, ok := s.svc.(authSwitcher); ok {
		sw.SetAuth(a)
	}
	s.authMu.Lock()
	s.Auth = a
	s.authMu.Unlock()
	s.audit.mu.Lock()
	s.audit.actor = "" // the audit log names the new identity from now on
	s.audit.mu.Unlock()
	s.log.Info("identity switched", "impersonate", a.Impersonate, "quotaProject", a.QuotaProject)
	s.handleGetConfig(w, r)
}

// New builds a server. token must be a random per-launch secret.
func New(token string, svc secrets.Store, cfg *config.File, ui fs.FS, version string, log *slog.Logger) *Server {
	return &Server{token: token, svc: svc, cfg: cfg, ui: ui, version: version, log: log}
}

// Handler returns the full handler with security middleware applied.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", sameOrigin(s.requireToken(s.apiMux())))
	mux.HandleFunc("GET /auth", s.handleAuth)
	mux.Handle("/", s.uiHandler())
	return loopbackHost(securityHeaders(mux))
}

// apiMux routes /api/ without any access checks; callers wrap it.
func (s *Server) apiMux() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/status", s.handleStatus)
	api.HandleFunc("GET /api/config", s.handleGetConfig)
	api.HandleFunc("POST /api/config", s.handleSetConfig)
	api.HandleFunc("POST /api/credentials", s.handleCredentials)
	api.HandleFunc("GET /api/watch", s.handleWatchList)
	api.HandleFunc("POST /api/watch/ack", s.handleWatchAck)
	api.HandleFunc("POST /api/watch/check", s.handleWatchCheck)
	api.HandleFunc("GET /api/secrets", s.handleList)
	api.HandleFunc("GET /api/secrets/versions", s.handleVersions)
	api.HandleFunc("POST /api/secrets/read", s.handleRead)
	api.HandleFunc("POST /api/secrets/drift", s.handleDrift)
	api.HandleFunc("POST /api/secrets/create", s.handleCreate)
	api.HandleFunc("POST /api/secrets/update", s.handleUpdate)
	api.HandleFunc("POST /api/secrets/delete", s.handleDelete)
	api.HandleFunc("POST /api/secrets/grant", s.handleGrant)
	api.HandleFunc("POST /api/secrets/revoke", s.handleRevoke)
	api.HandleFunc("POST /api/bootstrap", s.handleBootstrap)
	api.HandleFunc("POST /api/resolve", s.handleResolve)
	api.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "no such endpoint")
	})
	return api
}

func (s *Server) uiHandler() http.Handler {
	if s.ui == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "# ui not built — run: npm --prefix ui run build, then rebuild the core", http.StatusNotFound)
		})
	}
	files := http.FileServerFS(s.ui)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Unknown paths fall back to index.html so client-side routes load.
		if p := strings.TrimPrefix(r.URL.Path, "/"); p != "" {
			if _, err := fs.Stat(s.ui, p); err != nil {
				r = r.Clone(r.Context())
				r.URL.Path = "/"
			}
		}
		files.ServeHTTP(w, r)
	})
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, kind, msg string) {
	writeJSON(w, code, map[string]apiError{"error": {Code: kind, Message: msg}})
}

// fail maps library and Google API errors to HTTP statuses. Error text from
// berglas and Google never contains secret values, so it is passed through.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	code, kind := classify(err)
	s.log.Warn("request failed", "method", r.Method, "path", r.URL.Path, "status", code, "err", err)
	writeError(w, code, kind, err.Error())
}

// classify maps an error to an HTTP status and an error kind.
func classify(err error) (int, string) {
	code, kind := http.StatusBadGateway, "upstream"
	var gerr *googleapi.Error
	switch {
	case errors.Is(err, secrets.ErrInvalid):
		code, kind = http.StatusBadRequest, "invalid"
	case errors.Is(err, secrets.ErrModified):
		code, kind = http.StatusConflict, "modified"
	case berglas.IsSecretDoesNotExistErr(err), errors.Is(err, secrets.ErrNotFound):
		code, kind = http.StatusNotFound, "not_found"
	case berglas.IsSecretAlreadyExistsErr(err), errors.Is(err, secrets.ErrExists):
		code, kind = http.StatusConflict, "exists"
	case errors.As(err, &gerr):
		code, kind = gerr.Code, "google"
	case status.Code(err) == codes.PermissionDenied:
		code, kind = http.StatusForbidden, "permission_denied"
	case status.Code(err) == codes.NotFound:
		code, kind = http.StatusNotFound, "not_found"
	case strings.Contains(err.Error(), "could not find default credentials"):
		code, kind = http.StatusServiceUnavailable, "no_credentials"
	}
	if code == http.StatusForbidden {
		kind = "permission_denied"
	}
	return code, kind
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid", "bad json body: "+err.Error())
		return false
	}
	return true
}

func timeout(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 60*time.Second)
}

type statusResp struct {
	Version     string `json:"version"`
	Credentials bool   `json:"credentials"`
	Account     string `json:"account,omitempty"`
	Project     string `json:"project,omitempty"`
	Error       string `json:"error,omitempty"`
	Hint        string `json:"hint,omitempty"`
	Demo        bool   `json:"demo,omitempty"`
	// Impersonating is the service account the core acts as, if any.
	Impersonating string `json:"impersonating,omitempty"`
	QuotaProject  string `json:"quotaProject,omitempty"`
}

// handleStatus reports whether the configured identity can get a token and,
// when Google's tokeninfo endpoint says so, which account it is.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	auth := s.auth()
	out := statusResp{Version: s.version, Impersonating: auth.Impersonate, QuotaProject: auth.QuotaProject}
	if s.Demo {
		out.Credentials, out.Account, out.Demo = true, "demo mode", true
		writeJSON(w, http.StatusOK, out)
		return
	}
	hint := "run: gcloud auth application-default login"
	if auth.Impersonate != "" {
		hint += " — and check you have roles/iam.serviceAccountTokenCreator on " + auth.Impersonate
	}

	ts, project, err := auth.TokenSource(ctx)
	if err != nil {
		out.Error, out.Hint = err.Error(), hint
		writeJSON(w, http.StatusOK, out)
		return
	}
	out.Project = project
	tok, err := ts.Token()
	if err != nil {
		out.Error, out.Hint = "credentials found but getting a token failed: "+err.Error(), hint
		writeJSON(w, http.StatusOK, out)
		return
	}
	out.Credentials = true
	out.Account = tokenEmail(ctx, tok.AccessToken)
	writeJSON(w, http.StatusOK, out)
}

// tokenEmail asks Google which account an access token belongs to. It returns
// "" when the token lacks the email scope or the call fails; that is cosmetic.
func tokenEmail(ctx context.Context, accessToken string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/tokeninfo",
		strings.NewReader("access_token="+accessToken))
	if err != nil {
		return ""
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var info struct {
		Email string `json:"email"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&info) != nil {
		return ""
	}
	return info.Email
}

type configResp struct {
	config.Settings
	Path string `json:"path"`
	// Throwaway is set when the config is a temporary demo file, so the ui
	// says so instead of showing a temp path
	Throwaway bool `json:"throwaway,omitempty"`
	// AuditError is set when a safety setting changed but the change could
	// not be written to the audit log
	AuditError string `json:"auditError,omitempty"`
}

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, configResp{Settings: s.cfg.Get().Settings(), Path: s.cfg.Path(), Throwaway: s.ThrowawayConfig})
}

// ConfirmHeader carries the secret's name on a write to a protected name:
// the client's word that the user confirmed this very secret (the ui has
// them type "confirm" to save, also to a file, and the name itself to delete).
const ConfirmHeader = "X-Berglas-Confirm"

// guard refuses writes the config forbids. The ui hides or gates those
// actions too, but the core is the one that enforces them. name is "" for
// writes that are not about one secret (bootstrap).
func (s *Server) guard(w http.ResponseWriter, r *http.Request, backend secrets.Backend, parent, name string) bool {
	c := s.cfg.Get()
	if c.ReadOnlyFor(string(backend), parent) {
		writeError(w, http.StatusForbidden, "read_only", "read-only by config — writes to this source are turned off")
		return false
	}
	if name != "" && c.ProtectedFor(string(backend), parent, name) && r.Header.Get(ConfirmHeader) != name {
		writeError(w, http.StatusPreconditionRequired, "confirm_required", name+" is protected by config — confirm the write (send its name in "+ConfirmHeader+")")
		return false
	}
	return true
}

// handleSetConfig saves the settings that are present, all in one write of
// the file, and answers with the config as it now is. A change to a safety
// setting (see safetyChanges) goes into the audit log.
func (s *Server) handleSetConfig(w http.ResponseWriter, r *http.Request) {
	var in config.Patch
	if !decode(w, r, &in) {
		return
	}
	before := s.cfg.Get()
	if err := s.cfg.Apply(in); err != nil {
		var invalid *config.InvalidError
		if errors.As(err, &invalid) {
			writeError(w, http.StatusBadRequest, "invalid", err.Error())
		} else {
			writeError(w, http.StatusInternalServerError, "config", err.Error())
		}
		return
	}
	after := s.cfg.Get()
	out := configResp{Settings: after.Settings(), Path: s.cfg.Path(), Throwaway: s.ThrowawayConfig}
	if changes := safetyChanges(before, after); len(changes) > 0 {
		s.log.Info("safety settings changed", "changes", changes)
		// in the log that was in use and, when the change moved it, the new one:
		// turning the audit log off is itself on record
		e := auditEntry{Action: "settings change", Changes: changes}
		paths := []string{config.ExpandHome(before.AuditLog)}
		if p := config.ExpandHome(after.AuditLog); p != paths[0] {
			paths = append(paths, p)
		}
		for _, p := range paths {
			if msg := s.recordTo(r.Context(), p, e, nil); msg != "" && out.AuditError == "" {
				out.AuditError = msg
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// safetyChanges lists, as "name: old → new", the settings that guard secrets
// and differ between two configs: read-only and protection (global and per
// source), the lock, reveal and clipboard timers, screen capture and the
// audit log itself.
func safetyChanges(a, b config.Config) []string {
	var out []string
	add := func(name string, from, to any) {
		if f, t := fmt.Sprint(from), fmt.Sprint(to); f != t {
			out = append(out, name+": "+f+" → "+t)
		}
	}
	as, bs := a.Settings(), b.Settings()
	add("readOnly", as.ReadOnly, bs.ReadOnly)
	add("protect", as.Protect, bs.Protect)
	add("lockAfterMinutes", as.LockAfterMinutes, bs.LockAfterMinutes)
	add("revealSeconds", as.RevealSeconds, bs.RevealSeconds)
	add("clipboardClearSeconds", as.ClipboardClearSeconds, bs.ClipboardClearSeconds)
	add("allowScreenCapture", as.AllowScreenCapture, bs.AllowScreenCapture)
	add("auditLog", orOff(a.AuditLog), orOff(b.AuditLog))
	for _, src := range b.Sources {
		was := a.Source(src.Backend, src.Parent)
		if was == nil {
			was = &config.Source{}
		}
		id := "sources[" + src.Backend + ":" + src.Parent + "]"
		add(id+".readOnly", was.ReadOnly, src.ReadOnly)
		add(id+".protect", was.Protect, src.Protect)
	}
	for _, src := range a.Sources {
		if b.Source(src.Backend, src.Parent) == nil && (src.ReadOnly || len(src.Protect) > 0) {
			out = append(out, "sources["+src.Backend+":"+src.Parent+"]: removed (was readOnly "+fmt.Sprint(src.ReadOnly)+", protect "+fmt.Sprint(src.Protect)+")")
		}
	}
	return out
}

func orOff(path string) string {
	if path == "" {
		return "off"
	}
	return path
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()
	q := r.URL.Query()
	list, err := s.svc.List(ctx, secrets.Backend(q.Get("backend")), q.Get("parent"), q.Get("prefix"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"secrets": list})
}

func (s *Server) handleVersions(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()
	q := r.URL.Query()
	list, err := s.svc.Versions(ctx, secrets.Ref{Backend: secrets.Backend(q.Get("backend")), Parent: q.Get("parent"), Name: q.Get("name")})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": list})
}

// handleRead is a POST so the secret's coordinates and value never appear in
// URLs, logs or browser history.
func (s *Server) handleRead(w http.ResponseWriter, r *http.Request) {
	var in secrets.Ref
	if !decode(w, r, &in) {
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	sec, err := s.svc.Read(ctx, in)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"secret": sec})
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in secrets.CreateInput
	if !decode(w, r, &in) || !s.guard(w, r, in.Backend, in.Parent, in.Name) {
		return
	}
	if in.Backend == secrets.Storage && in.KMSKey == "" {
		in.KMSKey = s.cfg.Get().KMSKeyFor(string(in.Backend), in.Parent)
	}
	ctx, cancel := timeout(r)
	defer cancel()
	sec, err := s.svc.Create(ctx, in)
	audit := s.record(ctx, auditEntry{Action: "create", Backend: string(in.Backend), Parent: in.Parent, Name: in.Name, Version: versionOf(sec)}, err)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.markSeen(string(in.Backend), in.Parent, in.Name, versionOf(sec))
	s.log.Info("secret created", "backend", in.Backend, "parent", in.Parent, "name", in.Name)
	writeOK(w, map[string]any{"secret": sec}, audit)
}

func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	var in secrets.UpdateInput
	if !decode(w, r, &in) || !s.guard(w, r, in.Backend, in.Parent, in.Name) {
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	sec, err := s.svc.Update(ctx, in)
	audit := s.record(ctx, auditEntry{Action: "update", Backend: string(in.Backend), Parent: in.Parent, Name: in.Name, Version: versionOf(sec)}, err)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.markSeen(string(in.Backend), in.Parent, in.Name, versionOf(sec))
	s.log.Info("secret updated", "backend", in.Backend, "parent", in.Parent, "name", in.Name)
	writeOK(w, map[string]any{"secret": sec}, audit)
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	var in secrets.Ref
	if !decode(w, r, &in) || !s.guard(w, r, in.Backend, in.Parent, in.Name) {
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	err := s.svc.Delete(ctx, in)
	audit := s.record(ctx, auditEntry{Action: "delete", Backend: string(in.Backend), Parent: in.Parent, Name: in.Name}, err)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.markSeen(string(in.Backend), in.Parent, in.Name, "-")
	s.log.Info("secret deleted", "backend", in.Backend, "parent", in.Parent, "name", in.Name)
	writeOK(w, map[string]any{"ok": true}, audit)
}

func (s *Server) handleGrant(w http.ResponseWriter, r *http.Request) {
	s.members(w, r, "grant", s.svc.Grant)
}

func (s *Server) handleRevoke(w http.ResponseWriter, r *http.Request) {
	s.members(w, r, "revoke", s.svc.Revoke)
}

func (s *Server) members(w http.ResponseWriter, r *http.Request, action string, fn func(context.Context, secrets.MembersInput) error) {
	var in secrets.MembersInput
	if !decode(w, r, &in) || !s.guard(w, r, in.Backend, in.Parent, in.Name) {
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	err := fn(ctx, in)
	audit := s.record(ctx, auditEntry{Action: action, Backend: string(in.Backend), Parent: in.Parent, Name: in.Name, Members: in.Members}, err)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("access "+action, "backend", in.Backend, "parent", in.Parent, "name", in.Name, "members", in.Members)
	writeOK(w, map[string]any{"ok": true}, audit)
}

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	var in secrets.BootstrapInput
	if !decode(w, r, &in) || !s.guard(w, r, secrets.Storage, in.Bucket, "") {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	defer cancel()
	err := s.svc.Bootstrap(ctx, in)
	audit := s.record(ctx, auditEntry{Action: "bootstrap", Backend: string(secrets.Storage), Parent: in.Bucket}, err)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.log.Info("bootstrapped", "project", in.ProjectID, "bucket", in.Bucket)
	writeOK(w, map[string]any{"ok": true}, audit)
}

// writeOK answers a successful write, adding auditError when the audit log
// could not record it.
func writeOK(w http.ResponseWriter, body map[string]any, auditErr string) {
	if auditErr != "" {
		body["auditError"] = auditErr
	}
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Ref string `json:"ref"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, cancel := timeout(r)
	defer cancel()
	val, err := s.svc.Resolve(ctx, in.Ref)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plaintext": val})
}
