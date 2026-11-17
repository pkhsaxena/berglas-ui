// Command berglas-ui-desktop runs the core and the ui in a native window
// (Wails v2): the web view hands requests to Go in-process, so there is no
// browser, no port and no launch token. Build the .app with
// scripts/build-mac.sh.
package main

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/gcpauth"
	"berglas-ui/core/internal/secrets"
	"berglas-ui/core/internal/server"
	"berglas-ui/core/webui"
)

var version = "dev"

// Self-tests, for development only (BERGLAS_UI_SELFTEST):
//   - "full" drives the api through the web view; it writes and deletes
//     secrets, so it refuses to run without BERGLAS_UI_DEMO=1.
//   - "status" only asks the core whether google credentials work, as a
//     check that the app finds them when started from Finder.
//   - "layout" reports whether the page itself scrolls in the window.
//
//go:embed selftest.js
var selftestJS string

//go:embed selftest-status.js
var selftestStatusJS string

//go:embed selftest-layout.js
var selftestLayoutJS string

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// shell is the app's side of server.Desktop; ctx is set once Wails starts.
type shell struct {
	ctx context.Context
	// opened records links instead of opening them, during a self-test
	opened *[]string
	// saveDir, during a self-test, takes saved files instead of a Save dialog
	saveDir string
	saved   string
	// authed counts self-test unlocks
	authed int

	mu sync.Mutex
	// ready is set once the page has loaded; links that arrive before wait in pending
	ready   bool
	pending []config.SecretRef
	// notified records watch notifications during a self-test (none are shown)
	notified []string
	// notify is the system notification state: 0 unknown, 1 allowed, -1 not available or refused
	notify int
}

// openLink takes a berglas-ui:// link from macOS and opens the secret it
// names, now or once the page has loaded.
func (s *shell) openLink(log *slog.Logger, raw string) {
	r, err := parseLink(raw)
	if err != nil {
		log.Warn("ignored link", "err", err)
		return
	}
	s.mu.Lock()
	if !s.ready {
		log.Info("link queued until the page loads", "name", r.Name)
		s.pending = append(s.pending, r)
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	log.Info("link opened", "backend", r.Backend, "parent", r.Parent, "name", r.Name)
	wruntime.WindowUnminimise(s.ctx)
	wruntime.WindowShow(s.ctx)
	wruntime.WindowExecJS(s.ctx, linkJS(r))
}

// pageReady flushes links that arrived while the page was loading.
func (s *shell) pageReady() {
	s.mu.Lock()
	s.ready = true
	links := s.pending
	s.pending = nil
	s.mu.Unlock()
	for _, r := range links {
		wruntime.WindowExecJS(s.ctx, linkJS(r))
	}
}

// watchChanged tells the page (it refreshes its watch marks) and shows a
// system notification. Permission is asked the first time one is needed.
func (s *shell) watchChanged(log *slog.Logger, c server.Change) {
	title := c.Name + " has a new version"
	body := "#" + c.Version + " in " + c.Parent
	if c.Deleted {
		title, body = c.Name+" was deleted", "in "+c.Parent
	}
	wruntime.WindowExecJS(s.ctx, "window.berglasUI && window.berglasUI.run('watchChanged')")
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saveDir != "" { // self-test: record instead of showing
		s.notified = append(s.notified, title)
		return
	}
	if s.notify == 0 {
		s.notify = -1
		if err := wruntime.InitializeNotifications(s.ctx); err != nil {
			log.Warn("notifications unavailable", "err", err)
		} else if ok, err := wruntime.RequestNotificationAuthorization(s.ctx); err != nil || !ok {
			log.Warn("notifications not allowed", "err", err)
		} else {
			s.notify = 1
		}
	}
	if s.notify != 1 {
		return
	}
	if err := wruntime.SendNotification(s.ctx, wruntime.NotificationOptions{ID: "watch-" + c.Backend + "-" + c.Parent + "-" + c.Name, Title: title, Body: body}); err != nil {
		log.Warn("notification failed", "err", err)
	}
}

func (s *shell) SetClipboard(text string) error {
	return wruntime.ClipboardSetText(s.ctx, text)
}

func (s *shell) ClipboardText() (string, error) { return wruntime.ClipboardGetText(s.ctx) }

func (s *shell) OpenURL(u string) error {
	if s.opened != nil {
		*s.opened = append(*s.opened, u)
		return nil
	}
	wruntime.BrowserOpenURL(s.ctx, u)
	return nil
}

func (s *shell) CanAuthenticate() bool { return s.saveDir != "" || canAuthenticate() }

// Authenticate asks for Touch ID or the login password. During a self-test
// nobody is there to answer, so it passes and is recorded instead.
func (s *shell) Authenticate(reason string) (bool, error) {
	if s.saveDir != "" {
		s.authed++
		return true, nil
	}
	return authenticate(reason)
}

func (s *shell) SaveFile(name string) (string, error) {
	if s.saveDir != "" {
		s.saved = filepath.Join(s.saveDir, name)
		return s.saved, nil
	}
	return wruntime.SaveFileDialog(s.ctx, wruntime.SaveDialogOptions{
		Title:                "Save the secret's value as plain text",
		DefaultFilename:      name,
		CanCreateDirectories: true,
		ShowHiddenFiles:      true,
	})
}

func run() error {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	demo := os.Getenv("BERGLAS_UI_DEMO") == "1"
	selftest := os.Getenv("BERGLAS_UI_SELFTEST")
	var testJS string
	switch selftest {
	case "":
	case "full", "1":
		if !demo {
			return fmt.Errorf("BERGLAS_UI_SELFTEST=full writes secrets; it only runs with BERGLAS_UI_DEMO=1")
		}
		testJS = selftestJS
	case "status":
		testJS = selftestStatusJS
	case "layout":
		testJS = selftestLayoutJS
	default:
		return fmt.Errorf("BERGLAS_UI_SELFTEST must be full, status or layout")
	}

	configPath := os.Getenv("BERGLAS_UI_CONFIG")
	switch {
	case configPath != "":
	case demo:
		// Demo mode never reads or writes your real config: zoom, theme and
		// source changes (the self-test makes them) go to a throwaway file.
		dir, err := os.MkdirTemp("", "berglas-ui-demo-")
		if err != nil {
			return fmt.Errorf("make a demo config: %w", err)
		}
		defer os.RemoveAll(dir)
		configPath = filepath.Join(dir, "config.yaml")
		if err := os.WriteFile(configPath, []byte(demoConfig(testJS == selftestJS, os.Getenv("BERGLAS_UI_SKIN"))), 0o600); err != nil {
			return fmt.Errorf("write the demo config: %w", err)
		}
	default:
		p, err := config.DefaultPath()
		if err != nil {
			return fmt.Errorf("find config dir: %w", err)
		}
		configPath = p
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}
	creds := cfg.Get().Credentials
	auth := gcpauth.Auth{Impersonate: creds.ImpersonateServiceAccount, QuotaProject: creds.QuotaProject}
	// BERGLAS_UI_FAST_READ=0 makes every read go through the berglas library
	var store secrets.Store = &secrets.Service{Auth: auth, NoFastRead: os.Getenv("BERGLAS_UI_FAST_READ") == "0"}
	if demo {
		store = secrets.NewDemo()
	}
	ui := webui.FS()
	if ui == nil {
		return fmt.Errorf("ui not built — run: npm --prefix ui run build, then rebuild")
	}

	// The token is unused here: DesktopHandler does no token check.
	api := server.New("", store, cfg, ui, version, log)
	api.Demo = demo
	api.ThrowawayConfig = demo && os.Getenv("BERGLAS_UI_CONFIG") == ""
	api.Auth = auth
	sh := &shell{}
	if testJS != "" {
		sh.opened = &[]string{}
		dir, err := os.MkdirTemp("", "berglas-ui-selftest-save-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(dir)
		sh.saveDir = dir
	}
	handler := api.DesktopHandler(sh)

	exit := 0
	if testJS != "" {
		handler = withSelftest(handler, sh, store, func(report []byte, ok bool) {
			fmt.Printf("SELFTEST %s\n", report)
			if !ok {
				exit = 1
			}
			// let the web view finish the request before the app goes away
			go func() { time.Sleep(200 * time.Millisecond); wruntime.Quit(sh.ctx) }()
		})
	}

	// self-tests run in a fixed 1440x900 window, so the layout they check
	// doesn't depend on which screen is attached; the app opens maximized
	startState := options.Maximised
	if testJS != "" {
		startState = options.Normal
	}
	err = wails.Run(&options.App{
		Title:     "berglas-ui",
		Width:     1440,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		// open filling the screen; Width and Height are the size it restores to
		WindowStartState: startState,
		Menu:             appMenu(sh),
		AssetServer:      &assetserver.Options{Handler: handler},
		Mac: &mac.Options{
			// keep the window out of screenshots, recordings and screen shares
			// (NSWindowSharingNone) unless the config allows it
			ContentProtection: !cfg.Get().AllowScreenCapture,
			// berglas-ui:// links (Info.plist registers the scheme)
			OnUrlOpen: func(u string) { sh.openLink(log, u) },
			About: &mac.AboutInfo{
				Title:   "berglas-ui " + version,
				Message: "A desktop ui for berglas secrets.\nUses your gcloud application-default credentials.",
			},
		},
		OnStartup: func(ctx context.Context) {
			sh.ctx = ctx
			api.StartWatcher(ctx, func(c server.Change) { sh.watchChanged(log, c) })
		},
		OnDomReady: func(ctx context.Context) {
			sh.pageReady()
			if testJS == "" {
				return
			}
			wruntime.WindowExecJS(ctx, testJS)
			go func() {
				time.Sleep(300 * time.Second)
				fmt.Println("SELFTEST timeout: no report from the web view")
				exit = 1
				wruntime.Quit(ctx)
			}()
		},
	})
	if err != nil {
		return err
	}
	if exit != 0 {
		// returned, not os.Exit, so the deferred cleanup (the demo config) runs
		return fmt.Errorf("self-test failed")
	}
	return nil
}

// demoConfig is the throwaway config demo mode uses: the demo sources, with
// the bucket grouped by service and environment. The full self-test also
// needs prod names protected (its 428 check) and a 3 s clipboard clear (its
// auto-clear check). skin, when set (BERGLAS_UI_SKIN), picks the skin.
func demoConfig(selftest bool, skin string) string {
	body := "# demo config; deleted when the app quits\n" +
		"sources:\n" +
		"  - backend: storage\n    parent: demo-bucket\n    group: \"{service}-{env}-env\"\n" +
		"  - backend: sm\n    parent: demo-project\n" +
		"credentials:\n  choices:\n    - label: deployer (demo)\n      impersonateServiceAccount: deployer@demo-project.iam.gserviceaccount.com\n"
	if selftest {
		body += "protect: [\"*-prod-env\"]\nclipboardClearSeconds: 3\n"
	}
	if skin != "" {
		body += "skin: " + strconv.Quote(skin) + "\n"
	}
	return body
}

// appMenu is the standard mac menu bar. The Edit menu matters: without it,
// ⌘C, ⌘V, ⌘X, ⌘A and undo do nothing in the app's text fields.
func appMenu(sh *shell) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.AppMenu())
	m.Append(menu.EditMenu())
	// zoom and find run in the page (core/commands.ts), which owns their state
	run := func(cmd string) func(*menu.CallbackData) {
		return func(*menu.CallbackData) {
			wruntime.WindowExecJS(sh.ctx, "window.berglasUI && window.berglasUI.run('"+cmd+"')")
		}
	}
	// Wails' Edit menu is a fixed system menu, so find gets its own
	find := m.AddSubmenu("Find")
	find.AddText("Find…", keys.CmdOrCtrl("f"), run("find"))
	find.AddText("Find Next", keys.CmdOrCtrl("g"), run("findNext"))
	find.AddText("Find Previous", keys.Combo("g", keys.CmdOrCtrlKey, keys.ShiftKey), run("findPrev"))
	// ⌘K opens the command palette (core/palette.ts): secrets, sources, actions
	goMenu := m.AddSubmenu("Go")
	goMenu.AddText("Go To…", keys.CmdOrCtrl("k"), run("palette"))
	// Wails' app menu is a fixed system menu too, so Settings… (⌘,) sits here
	goMenu.AddText("Settings…", keys.CmdOrCtrl(","), run("settings"))
	goMenu.AddSeparator()
	goMenu.AddText("Lock", keys.Combo("l", keys.CmdOrCtrlKey, keys.ShiftKey), run("lock"))
	view := m.AddSubmenu("View")
	view.AddText("Zoom In", keys.CmdOrCtrl("="), run("zoomIn"))
	view.AddText("Zoom Out", keys.CmdOrCtrl("-"), run("zoomOut"))
	view.AddText("Actual Size", keys.CmdOrCtrl("0"), run("zoomReset"))
	view.AddSeparator()
	view.AddText("Reload", keys.CmdOrCtrl("r"), func(*menu.CallbackData) { wruntime.WindowReloadApp(sh.ctx) })
	view.AddText("Toggle Full Screen", keys.Combo("f", keys.CmdOrCtrlKey, keys.ControlKey), func(*menu.CallbackData) {
		if wruntime.WindowIsFullscreen(sh.ctx) {
			wruntime.WindowUnfullscreen(sh.ctx)
		} else {
			wruntime.WindowFullscreen(sh.ctx)
		}
	})
	m.Append(menu.WindowMenu())
	return m
}

// withSelftest adds the self-test's routes: POST /__selftest takes the
// report; GET /__selftest/clipboard and /__selftest/opened let the script
// check what the app did with a copy or a link.
func withSelftest(next http.Handler, sh *shell, store secrets.Store, done func(report []byte, ok bool)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/__selftest/clipboard":
			t, _ := sh.ClipboardText()
			_, _ = io.WriteString(w, t)
			return
		case "/__selftest/opened":
			_, _ = fmt.Fprint(w, strings.Join(*sh.opened, "\n"))
			return
		case "/__selftest/link":
			// as if macOS handed the app this link
			sh.openLink(slog.Default(), r.URL.Query().Get("u"))
			return
		case "/__selftest/notified":
			sh.mu.Lock()
			_, _ = fmt.Fprint(w, strings.Join(sh.notified, "\n"))
			sh.mu.Unlock()
			return
		case "/__selftest/external-write":
			// a write that doesn't go through the core, as another person's would
			if err := externalWrite(store, r.URL.Query().Get("name")); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		case "/__selftest/resize":
			// resize the window, as dragging it or tiling it to a side would
			q := r.URL.Query()
			wd, _ := strconv.Atoi(q.Get("w"))
			ht, _ := strconv.Atoi(q.Get("h"))
			if wd > 0 && ht > 0 {
				wruntime.WindowSetSize(sh.ctx, wd, ht)
			}
			return
		case "/__selftest/progress":
			fmt.Printf("SELFTEST step: %s\n", r.URL.Query().Get("step"))
			return
		case "/__selftest/authed":
			_, _ = fmt.Fprint(w, sh.authed)
			return
		case "/__selftest/saved":
			// the last saved file's name, mode and size; never its content
			st, err := os.Stat(sh.saved)
			if err != nil {
				_, _ = fmt.Fprintf(w, `{"error":%q}`, err.Error())
				return
			}
			_, _ = fmt.Fprintf(w, `{"name":%q,"mode":"%o","size":%d}`, filepath.Base(sh.saved), st.Mode().Perm(), st.Size())
			return
		case "/__selftest":
		default:
			next.ServeHTTP(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusNoContent)
		done(body, r.URL.Query().Get("ok") == "1")
	})
}

// externalWrite adds a version to a demo secret without going through the
// core, as another person's write would. It refuses anything but the
// in-memory demo store, so a self-test can never write to Google Cloud.
func externalWrite(store secrets.Store, name string) error {
	m, ok := store.(*secrets.Memory)
	if !ok {
		return fmt.Errorf("external writes are for the demo store only")
	}
	_, err := m.Update(context.Background(), secrets.UpdateInput{Backend: secrets.Storage, Parent: "demo-bucket", Name: name, Plaintext: []byte("CHANGED_BY=someone-else\n")})
	return err
}
