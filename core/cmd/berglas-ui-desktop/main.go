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
	"strings"
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
	if configPath == "" {
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
	var store secrets.Store = &secrets.Service{Auth: auth}
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
	api.Auth = auth
	sh := &shell{}
	if testJS != "" {
		sh.opened = &[]string{}
	}
	handler := api.DesktopHandler(sh)

	exit := 0
	if testJS != "" {
		handler = withSelftest(handler, sh, func(report []byte, ok bool) {
			fmt.Printf("SELFTEST %s\n", report)
			if !ok {
				exit = 1
			}
			// let the web view finish the request before the app goes away
			go func() { time.Sleep(200 * time.Millisecond); wruntime.Quit(sh.ctx) }()
		})
	}

	err = wails.Run(&options.App{
		Title:       "berglas-ui",
		Width:       1440,
		Height:      900,
		MinWidth:    900,
		MinHeight:   600,
		Menu:        appMenu(sh),
		AssetServer: &assetserver.Options{Handler: handler},
		Mac: &mac.Options{
			About: &mac.AboutInfo{
				Title:   "berglas-ui " + version,
				Message: "A desktop ui for berglas secrets.\nUses your gcloud application-default credentials.",
			},
		},
		OnStartup: func(ctx context.Context) { sh.ctx = ctx },
		OnDomReady: func(ctx context.Context) {
			if testJS == "" {
				return
			}
			wruntime.WindowExecJS(ctx, testJS)
			go func() {
				time.Sleep(90 * time.Second)
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
		os.Exit(exit)
	}
	return nil
}

// appMenu is the standard mac menu bar. The Edit menu matters: without it,
// ⌘C, ⌘V, ⌘X, ⌘A and undo do nothing in the app's text fields.
func appMenu(sh *shell) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.AppMenu())
	m.Append(menu.EditMenu())
	view := m.AddSubmenu("View")
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
func withSelftest(next http.Handler, sh *shell, done func(report []byte, ok bool)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/__selftest/clipboard":
			t, _ := sh.ClipboardText()
			_, _ = io.WriteString(w, t)
			return
		case "/__selftest/opened":
			_, _ = fmt.Fprint(w, strings.Join(*sh.opened, "\n"))
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
