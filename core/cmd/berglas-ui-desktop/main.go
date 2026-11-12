// Command berglas-ui-desktop runs the core and the ui in a native window
// (Wails v2): the web view hands requests to Go in-process, so there is no
// browser, no port and no launch token.
package main

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/gcpauth"
	"berglas-ui/core/internal/secrets"
	"berglas-ui/core/internal/server"
	"berglas-ui/core/webui"
)

var version = "dev"

//go:embed selftest.js
var selftestJS string

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	demo := os.Getenv("BERGLAS_UI_DEMO") == "1"
	selftest := os.Getenv("BERGLAS_UI_SELFTEST") == "1"

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
	handler := api.DesktopHandler()

	var appCtx context.Context
	exit := 0
	if selftest {
		handler = withSelftest(handler, func(report []byte, ok bool) {
			fmt.Printf("SELFTEST %s\n", report)
			if !ok {
				exit = 1
			}
			wruntime.Quit(appCtx)
		})
	}

	err = wails.Run(&options.App{
		Title:       "berglas-ui",
		Width:       1440,
		Height:      900,
		MinWidth:    900,
		MinHeight:   600,
		AssetServer: &assetserver.Options{Handler: handler},
		OnStartup:   func(ctx context.Context) { appCtx = ctx },
		OnDomReady: func(ctx context.Context) {
			if selftest {
				wruntime.WindowExecJS(ctx, selftestJS)
				go func() {
					time.Sleep(60 * time.Second)
					fmt.Println("SELFTEST timeout: no report from the web view")
					exit = 1
					wruntime.Quit(ctx)
				}()
			}
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

// withSelftest adds POST /__selftest, where selftest.js reports its results.
func withSelftest(next http.Handler, done func(report []byte, ok bool)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/__selftest" {
			next.ServeHTTP(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusNoContent)
		done(body, r.URL.Query().Get("ok") == "1")
	})
}
