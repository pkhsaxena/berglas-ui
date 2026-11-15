package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"unicode"

	"berglas-ui/core/internal/config"
)

// Deep links: berglas-ui://open?backend=storage&parent=<bucket>&name=<secret>
// opens the app at that secret. A link only navigates: it never reveals,
// writes or changes settings (a source the config lacks is offered to the
// user, who confirms adding it).

const linkScheme = "berglas-ui"

// parseLink checks a deep link and returns the secret it names.
func parseLink(raw string) (config.SecretRef, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return config.SecretRef{}, fmt.Errorf("not a link: %w", err)
	}
	if u.Scheme != linkScheme || u.Host != "open" {
		return config.SecretRef{}, fmt.Errorf("not a berglas-ui open link: %q", raw)
	}
	q := u.Query()
	r := config.SecretRef{Backend: q.Get("backend"), Parent: q.Get("parent"), Name: q.Get("name")}
	if r.Backend != "storage" && r.Backend != "sm" {
		return config.SecretRef{}, fmt.Errorf("backend must be storage or sm")
	}
	for field, v := range map[string]string{"parent": r.Parent, "name": r.Name} {
		if v == "" || len(v) > 1024 || strings.IndexFunc(v, func(c rune) bool { return unicode.IsControl(c) }) >= 0 {
			return config.SecretRef{}, fmt.Errorf("bad %s in link", field)
		}
	}
	if strings.ContainsAny(r.Parent, " /") {
		return config.SecretRef{}, fmt.Errorf("bad parent in link")
	}
	return r, nil
}

// linkJS is the script that hands a checked link to the page. The ref is
// JSON-encoded, which is also a safe JavaScript literal.
func linkJS(r config.SecretRef) string {
	b, _ := json.Marshal(r)
	return "window.berglasUI && window.berglasUI.openLink(" + string(b) + ")"
}
