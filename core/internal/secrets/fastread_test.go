package secrets

import (
	"berglas-ui/core/internal/gcpauth"
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"cloud.google.com/go/kms/apiv1/kmspb"
	"cloud.google.com/go/storage"
	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"
	"github.com/googleapis/gax-go/v2"
)

// fakeKMS "wraps" a data key by prefixing it; it checks the key name and the
// object name the way kms checks additional authenticated data.
type fakeKMS struct{ calls atomic.Int32 }

const testKey = "projects/p/locations/global/keyRings/r/cryptoKeys/k"

func (f *fakeKMS) Decrypt(_ context.Context, req *kmspb.DecryptRequest, _ ...gax.CallOption) (*kmspb.DecryptResponse, error) {
	f.calls.Add(1)
	if req.Name != testKey {
		return nil, errors.New("wrong key")
	}
	prefix := "wrapped:" + string(req.AdditionalAuthenticatedData) + ":"
	if !bytes.HasPrefix(req.Ciphertext, []byte(prefix)) {
		return nil, errors.New("aad mismatch")
	}
	return &kmspb.DecryptResponse{Plaintext: req.Ciphertext[len(prefix):]}, nil
}

// seal builds a storage object the way berglas writes one.
func seal(t *testing.T, object string, plaintext []byte) []byte {
	t.Helper()
	dek := make([]byte, 32)
	_, _ = rand.Read(dek)
	block, _ := aes.NewCipher(dek)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	_, _ = rand.Read(nonce)
	payload := append(nonce, gcm.Seal(nil, nonce, plaintext, nil)...)
	wrapped := append([]byte("wrapped:"+object+":"), dek...)
	return []byte(base64.StdEncoding.EncodeToString(wrapped) + ":" + base64.StdEncoding.EncodeToString(payload))
}

func attrsFor(object string, gen int64) *storage.ObjectAttrs {
	return &storage.ObjectAttrs{Name: object, Generation: gen, Metageneration: 1, Updated: time.Unix(1700000000, 0),
		Metadata: map[string]string{berglas.MetadataKMSKey: testKey}}
}

func TestOpenDecryptsWhatBerglasWrites(t *testing.T) {
	data := seal(t, "app-env", []byte("A=1\nB=2\n"))
	s, err := parseSealed("b", attrsFor("app-env", 7), data)
	if err != nil {
		t.Fatal(err)
	}
	got, err := open(context.Background(), &fakeKMS{}, s)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Plaintext) != "A=1\nB=2\n" || got.Generation != 7 || got.KMSKey != testKey || got.Parent != "b" || got.Backend != Storage {
		t.Fatalf("got %+v", got)
	}
}

func TestOpenRefusesTamperedOrMisnamedObjects(t *testing.T) {
	data := seal(t, "app-env", []byte("secret"))
	// the same bytes under another object name: kms refuses (aad mismatch)
	s, _ := parseSealed("b", attrsFor("other-env", 1), data)
	if _, err := open(context.Background(), &fakeKMS{}, s); err == nil {
		t.Error("an object copied to another name must not decrypt")
	}
	// flip one byte of the payload: gcm refuses
	parts := strings.SplitN(string(data), ":", 2)
	p, _ := base64.StdEncoding.DecodeString(parts[1])
	p[len(p)-1] ^= 1
	tampered := parts[0] + ":" + base64.StdEncoding.EncodeToString(p)
	s, _ = parseSealed("b", attrsFor("app-env", 1), []byte(tampered))
	if _, err := open(context.Background(), &fakeKMS{}, s); err == nil {
		t.Error("a tampered payload must not decrypt")
	}
}

func TestParseSealedRejectsMalformedObjects(t *testing.T) {
	for name, data := range map[string]string{
		"no separator": "abc",
		"bad key b64":  "!!!:QUJD",
		"bad data b64": "QUJD:!!!",
	} {
		if _, err := parseSealed("b", attrsFor("x", 1), []byte(data)); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
	noKey := attrsFor("x", 1)
	noKey.Metadata = nil
	if _, err := parseSealed("b", noKey, seal(t, "x", []byte("v"))); err == nil {
		t.Error("missing kms key metadata: want an error")
	}
}

// fakeNet serves sealed objects with a delay and counts downloads.
type fakeNet struct {
	t         *testing.T
	delay     time.Duration
	downloads atomic.Int32
	fail      atomic.Bool
}

func (n *fakeNet) fetch(ctx context.Context, bucket, object string, gen int64) (*sealed, error) {
	n.downloads.Add(1)
	select {
	case <-time.After(n.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if n.fail.Load() {
		return nil, errors.New("network down")
	}
	return parseSealed(bucket, attrsFor(object, gen), seal(n.t, object, []byte("value of "+object)))
}

func newTestReader(n *fakeNet) *fastReader {
	return &fastReader{kms: &fakeKMS{}, fetch: n.fetch, pending: map[string]*prefetch{}}
}

func TestReadUsesThePrefetchedObject(t *testing.T) {
	n := &fakeNet{t: t, delay: 50 * time.Millisecond}
	f := newTestReader(n)
	f.Prefetch("b", "s", 3)
	f.Prefetch("b", "s", 3) // a second prefetch while the first is on its way does nothing
	time.Sleep(80 * time.Millisecond)
	start := time.Now()
	got, err := f.Read(context.Background(), "b", "s", 3)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Plaintext) != "value of s" {
		t.Fatalf("got %q", got.Plaintext)
	}
	if n.downloads.Load() != 1 {
		t.Errorf("downloads = %d, want 1", n.downloads.Load())
	}
	if d := time.Since(start); d > 30*time.Millisecond {
		t.Errorf("read after prefetch took %v; it should not download again", d)
	}
}

func TestReadWaitsForAPrefetchStillDownloading(t *testing.T) {
	n := &fakeNet{t: t, delay: 60 * time.Millisecond}
	f := newTestReader(n)
	f.Prefetch("b", "s", 3)
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := f.Read(context.Background(), "b", "s", 3); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if n.downloads.Load() != 1 {
		t.Errorf("downloads = %d, want 1 (reads share the prefetch)", n.downloads.Load())
	}
}

func TestReadFetchesWhenPrefetchFailedOrMissing(t *testing.T) {
	n := &fakeNet{t: t}
	n.fail.Store(true)
	f := newTestReader(n)
	f.Prefetch("b", "s", 3)
	time.Sleep(10 * time.Millisecond)
	n.fail.Store(false)
	if _, err := f.Read(context.Background(), "b", "s", 3); err != nil {
		t.Fatalf("read after a failed prefetch: %v", err)
	}
	if _, err := f.Read(context.Background(), "b", "other", 9); err != nil {
		t.Fatalf("read without a prefetch: %v", err)
	}
}

func TestPrefetchesExpireAndAreCapped(t *testing.T) {
	n := &fakeNet{t: t}
	f := newTestReader(n)
	for i := range prefetchMax + 10 {
		f.Prefetch("b", "s", int64(i+1))
	}
	time.Sleep(20 * time.Millisecond)
	f.mu.Lock()
	f.sweep(time.Now())
	if len(f.pending) > prefetchMax {
		t.Errorf("holding %d prefetches, cap is %d", len(f.pending), prefetchMax)
	}
	f.sweep(time.Now().Add(prefetchTTL + time.Second))
	if len(f.pending) != 0 {
		t.Errorf("holding %d prefetches after the ttl", len(f.pending))
	}
	f.mu.Unlock()
}

func TestPrefetchIgnoresLatest(t *testing.T) {
	n := &fakeNet{t: t}
	f := newTestReader(n)
	f.Prefetch("b", "s", 0)
	time.Sleep(5 * time.Millisecond)
	if n.downloads.Load() != 0 {
		t.Error("generation 0 (latest) must not be prefetched: it could change before the read")
	}
}

func TestSetAuthDropsClients(t *testing.T) {
	s := &Service{fast: &fastReader{}}
	s.SetAuth(gcpauth.Auth{Impersonate: "x@p.iam.gserviceaccount.com"})
	if s.fast != nil || s.client != nil || s.Auth.Impersonate != "x@p.iam.gserviceaccount.com" {
		t.Fatalf("after SetAuth: %+v", s)
	}
}
