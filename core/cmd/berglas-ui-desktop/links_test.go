package main

import (
	"strings"
	"testing"
)

func TestParseLink(t *testing.T) {
	r, err := parseLink("berglas-ui://open?backend=storage&parent=demo-bucket&name=orders%2Fprod-env")
	if err != nil || r.Backend != "storage" || r.Parent != "demo-bucket" || r.Name != "orders/prod-env" {
		t.Fatalf("got %+v %v", r, err)
	}
	for _, bad := range []string{
		"https://open?backend=storage&parent=b&name=n",
		"berglas-ui://reveal?backend=storage&parent=b&name=n",
		"berglas-ui://open?backend=s3&parent=b&name=n",
		"berglas-ui://open?backend=sm&parent=&name=n",
		"berglas-ui://open?backend=sm&parent=a%2Fb&name=n",
		"berglas-ui://open?backend=sm&parent=p&name=a%0Ab",
	} {
		if _, err := parseLink(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestLinkJSEscapes(t *testing.T) {
	r, _ := parseLink(`berglas-ui://open?backend=sm&parent=p&name=x%27%29%3Balert%281%29%2F%2F`)
	js := linkJS(r)
	if !strings.HasPrefix(js, `window.berglasUI && window.berglasUI.openLink({"backend":"sm"`) || !strings.Contains(js, `"name":"x')`) {
		t.Fatalf("js %s", js)
	}
}
