package secrets

import (
	"bytes"
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"

	"berglas-ui/core/internal/config"
	"berglas-ui/core/internal/gcpauth"
)

// TestFastReadMatchesBerglas reads real secrets both ways (the berglas library
// and fastread.go) and compares value and metadata in memory. It only runs
// with BERGLAS_UI_REAL_TEST=1, against the default storage source in your
// config, and calls kms twice per secret. It reports counts only: no names,
// no values. BERGLAS_UI_REAL_TEST_MAX caps the secrets checked (default 25).
func TestFastReadMatchesBerglas(t *testing.T) {
	if os.Getenv("BERGLAS_UI_REAL_TEST") != "1" {
		t.Skip("set BERGLAS_UI_REAL_TEST=1 to compare against your real bucket")
	}
	max := 25
	if v, err := strconv.Atoi(os.Getenv("BERGLAS_UI_REAL_TEST_MAX")); err == nil && v > 0 {
		max = v
	}
	path, _ := config.DefaultPath()
	f, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	c := f.Get()
	bucket := ""
	for _, s := range c.Sources {
		if s.Backend == "storage" && (bucket == "" || s.Default) {
			bucket = s.Parent
		}
	}
	if bucket == "" {
		t.Skip("no storage source in the config")
	}
	svc := &Service{Auth: gcpauth.Auth{Impersonate: c.Credentials.ImpersonateServiceAccount, QuotaProject: c.Credentials.QuotaProject}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	list, err := svc.List(ctx, Storage, bucket, "")
	if err != nil {
		t.Fatal(err)
	}
	bc, err := svc.c(ctx)
	if err != nil {
		t.Fatal(err)
	}
	checked, matched := 0, 0
	for i, sec := range list {
		if checked == max {
			break
		}
		versions, err := svc.Versions(ctx, Ref{Backend: Storage, Parent: bucket, Name: sec.Name}) // starts the prefetch
		if err != nil || len(versions) == 0 {
			t.Errorf("secret #%d: versions failed", i)
			continue
		}
		gen := versions[0].Generation
		want, err := bc.Read(ctx, &berglas.StorageReadRequest{Bucket: bucket, Object: sec.Name, Generation: gen})
		if err != nil {
			t.Errorf("secret #%d: berglas read failed", i)
			continue
		}
		fr, err := svc.fastFor(ctx)
		if err != nil {
			t.Fatal(err)
		}
		got, err := fr.Read(ctx, bucket, sec.Name, gen)
		checked++
		switch {
		case err != nil:
			t.Errorf("secret #%d: fast read failed: %v", i, err)
		case !bytes.Equal(got.Plaintext, want.Plaintext):
			t.Errorf("secret #%d: values differ", i)
		case got.Generation != want.Generation || got.Metageneration != want.Metageneration ||
			got.KMSKey != want.KMSKey || !got.UpdatedAt.Equal(want.UpdatedAt) || got.Name != want.Name || got.Parent != want.Parent:
			t.Errorf("secret #%d: metadata differs", i)
		default:
			matched++
		}
	}
	t.Logf("%d of %d secrets read identically both ways", matched, checked)
	if checked == 0 {
		t.Fatal("no secrets checked")
	}
}
