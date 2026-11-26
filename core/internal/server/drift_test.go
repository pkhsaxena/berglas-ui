package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

type driftResp struct {
	Secrets []driftSecret `json:"secrets"`
}

func drift(t *testing.T, body string) driftResp {
	t.Helper()
	rec := post(demoServer(t, ""), "/api/secrets/drift", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var out driftResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func keysOf(d driftSecret) map[string]driftKeyInfo {
	m := map[string]driftKeyInfo{}
	for _, k := range d.Keys {
		m[k.Key] = k
	}
	return m
}

func TestDriftComparesKeysWithoutValues(t *testing.T) {
	rec := post(demoServer(t, ""), "/api/secrets/drift", `{"backend":"storage","parent":"demo-bucket","names":["orders-dev-env","orders-staging-env","orders-prod-env"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	// no value from the demo data may appear in the response
	for _, v := range []string{"orders.dev.internal", "orders.internal", "sqs://", "dbg_demo_1", "sentry.example", "https:"} {
		if strings.Contains(rec.Body.String(), v) {
			t.Fatalf("response leaks %q: %s", v, rec.Body)
		}
	}
	var out driftResp
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Secrets) != 3 {
		t.Fatalf("got %d secrets", len(out.Secrets))
	}
	dev, stg, prod := keysOf(out.Secrets[0]), keysOf(out.Secrets[1]), keysOf(out.Secrets[2])
	for i, s := range out.Secrets {
		if !s.Env || s.Version == "" || s.Error != "" {
			t.Fatalf("secret %d: %+v", i, s)
		}
	}
	if _, ok := prod["FEATURE_SPLIT"]; ok {
		t.Fatal("FEATURE_SPLIT should be missing in prod")
	}
	if _, ok := stg["DEBUG_TOKEN"]; ok {
		t.Fatal("DEBUG_TOKEN should be dev only")
	}
	if stg["QUEUE_URL"].FP != prod["QUEUE_URL"].FP || dev["QUEUE_URL"].FP == prod["QUEUE_URL"].FP {
		t.Fatal("QUEUE_URL: staging should equal prod, dev should differ")
	}
	if dev["TIMEOUT_MS"].FP != stg["TIMEOUT_MS"].FP || dev["TIMEOUT_MS"].Exact == stg["TIMEOUT_MS"].Exact {
		t.Fatal("TIMEOUT_MS: dev and staging should differ by quotes only")
	}
	if !dev["SENTRY_DSN"].Empty || stg["SENTRY_DSN"].Empty {
		t.Fatal("SENTRY_DSN: empty in dev only")
	}
}

func TestDriftNonEnvAndMissing(t *testing.T) {
	out := drift(t, `{"backend":"storage","parent":"demo-bucket","names":["tls-cert","no-such-secret"]}`)
	if out.Secrets[0].Env || out.Secrets[0].Value == "" || len(out.Secrets[0].Keys) != 0 {
		t.Fatalf("tls-cert should be one whole-value fingerprint: %+v", out.Secrets[0])
	}
	if out.Secrets[1].Error == "" {
		t.Fatalf("a missing secret should carry an error: %+v", out.Secrets[1])
	}
}

func TestDriftBounds(t *testing.T) {
	h := demoServer(t, "")
	if rec := post(h, "/api/secrets/drift", `{"backend":"storage","parent":"demo-bucket","names":[]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty names: %d", rec.Code)
	}
	names := strings.Repeat(`"a",`, 13)
	if rec := post(h, "/api/secrets/drift", `{"backend":"storage","parent":"demo-bucket","names":[`+names[:len(names)-1]+`]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("13 names: %d", rec.Code)
	}
}

func TestEnvKeysLastWinsAndThreshold(t *testing.T) {
	keys, ok := envKeys("# c\nA=1\nexport B='x'\nA=2\r\n")
	if !ok || len(keys) != 2 || keys[0].Key != "A" || keys[0].FP != fingerprint("2") || keys[1].FP != fingerprint("x") {
		t.Fatalf("got %+v ok=%v", keys, ok)
	}
	if _, ok := envKeys("not an env file\nreally not\nA=1\n"); ok {
		t.Fatal("one pair in three lines is not an env file")
	}
}

func TestEnvKeysMultiLineValues(t *testing.T) {
	pem := "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nAB==\n-----END PRIVATE KEY-----"
	keys, ok := envKeys("A=1\r\nKEY=\"" + strings.ReplaceAll(pem, "\n", "\r\n") + "\"\r\nB=2\r\n")
	if !ok || len(keys) != 3 || keys[1].Key != "KEY" || keys[1].FP != fingerprint(pem) || keys[2].Key != "B" {
		t.Fatalf("got %+v ok=%v", keys, ok)
	}
	// an unclosed quote doesn't swallow the keys after it
	keys, ok = envKeys("A=\"open\nB=\"x\"\nC=3\n")
	if !ok || len(keys) != 3 || keys[1].Key != "B" || keys[2].Key != "C" {
		t.Fatalf("unclosed: got %+v ok=%v", keys, ok)
	}
}
