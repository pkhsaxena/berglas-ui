// Command berglas-ui runs the core: a localhost JSON API over the berglas
// library that also serves the embedded UI.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"berglas-ui/core/internal/secrets"
	"berglas-ui/core/internal/server"
	"berglas-ui/core/webui"
)

var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	listen := flag.String("listen", envOr("BERGLAS_UI_LISTEN", "127.0.0.1:0"), "address to listen on (port 0 picks a free port)")
	allowNonLoopback := flag.Bool("allow-non-loopback", os.Getenv("BERGLAS_UI_ALLOW_NON_LOOPBACK") == "1",
		"allow listening on a non-loopback address (only for containers with a 127.0.0.1-bound port mapping)")
	open := flag.Bool("open", false, "open the ui in the default browser")
	apiOnly := flag.Bool("api-only", false, "serve the api without the embedded ui")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	host, _, err := net.SplitHostPort(*listen)
	if err != nil {
		return fmt.Errorf("bad -listen %q: %w", *listen, err)
	}
	if ip := net.ParseIP(host); (ip == nil || !ip.IsLoopback()) && host != "localhost" {
		if !*allowNonLoopback {
			return fmt.Errorf("refusing to listen on %s: not a loopback address (pass -allow-non-loopback inside a container)", *listen)
		}
		log.Warn("listening on a non-loopback address; publish the port as 127.0.0.1:<port> only", "listen", *listen)
	}

	token := os.Getenv("BERGLAS_UI_TOKEN")
	if token == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return fmt.Errorf("generate token: %w", err)
		}
		token = hex.EncodeToString(b)
	}

	ui := webui.FS()
	if *apiOnly {
		ui = nil
	} else if ui == nil {
		log.Warn("ui not built; serving the api only")
	}

	srv := &http.Server{
		Addr:              *listen,
		Handler:           server.New(token, &secrets.Service{}, ui, version, log).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		return err
	}
	port := strconv.Itoa(ln.Addr().(*net.TCPAddr).Port)

	// In a container the listen host is 0.0.0.0; the browser still uses localhost.
	linkHost := host
	if ip := net.ParseIP(host); ip != nil && ip.IsUnspecified() {
		linkHost = "127.0.0.1"
	}
	link := fmt.Sprintf("http://%s/auth?token=%s", net.JoinHostPort(linkHost, port), token)
	fmt.Fprintf(os.Stderr, "berglas-ui %s\n# open this link; it carries this session's access token:\n%s\n", version, link)
	if *open {
		openBrowser(link, log)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func openBrowser(url string, log *slog.Logger) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Warn("could not open browser", "err", err)
	}
}
