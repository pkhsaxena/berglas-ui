package secrets

// A faster read for Cloud Storage secrets, split in two halves:
//
//   - fetch downloads the encrypted object and its metadata (two calls, run
//     together). The core starts this in the background as soon as the ui
//     lists a secret's versions, so it is usually done before reveal.
//   - decrypt asks Cloud KMS to unwrap the data key and opens the value
//     locally, which is all a reveal then waits for.
//
// The berglas library does both halves inside one Read and keeps its clients
// private, so this mirrors its storage format (see berglas' read.go and
// envelopeDecrypt): the object holds "base64(wrapped key):base64(nonce|aes-gcm
// ciphertext)", the key is wrapped by KMS with the object name as additional
// authenticated data, and the value is AES-256-GCM. If this path fails for
// any reason, Read falls back to the berglas library.
//
// Prefetched objects stay encrypted and only in this process, for prefetchTTL
// at most; nothing here ever holds a plaintext or a data key past one call.

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	kms "cloud.google.com/go/kms/apiv1"
	"cloud.google.com/go/kms/apiv1/kmspb"
	"cloud.google.com/go/storage"
	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"
	"github.com/googleapis/gax-go/v2"
)

const (
	prefetchTTL     = 60 * time.Second
	prefetchMax     = 64
	prefetchTimeout = 30 * time.Second
)

// sealed is one encrypted storage object, ready to decrypt.
type sealed struct {
	bucket, object string
	attrs          *storage.ObjectAttrs
	wrappedKey     []byte // the data key, encrypted by kms
	payload        []byte // nonce | aes-gcm ciphertext
}

// kmsDecrypter is the part of the kms client decrypt needs; tests fake it.
type kmsDecrypter interface {
	Decrypt(ctx context.Context, req *kmspb.DecryptRequest, opts ...gax.CallOption) (*kmspb.DecryptResponse, error)
}

// parseSealed splits a berglas storage object into its two parts.
func parseSealed(bucket string, attrs *storage.ObjectAttrs, data []byte) (*sealed, error) {
	if attrs.Metadata[berglas.MetadataKMSKey] == "" {
		return nil, errors.New("missing kms key in secret metadata")
	}
	parts := strings.SplitN(string(data), ":", 2)
	if len(parts) < 2 {
		return nil, errors.New("invalid ciphertext: not enough parts")
	}
	key, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("invalid ciphertext: failed to parse dek")
	}
	payload, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("invalid ciphertext: failed to parse ciphertext")
	}
	return &sealed{bucket: bucket, object: attrs.Name, attrs: attrs, wrappedKey: key, payload: payload}, nil
}

// open decrypts a sealed object: kms unwraps the data key, then aes-gcm.
func open(ctx context.Context, k kmsDecrypter, s *sealed) (Secret, error) {
	resp, err := k.Decrypt(ctx, &kmspb.DecryptRequest{
		Name:                        s.attrs.Metadata[berglas.MetadataKMSKey],
		Ciphertext:                  s.wrappedKey,
		AdditionalAuthenticatedData: []byte(s.object),
	})
	if err != nil {
		return Secret{}, fmt.Errorf("failed to decrypt dek: %w", err)
	}
	block, err := aes.NewCipher(resp.Plaintext)
	if err != nil {
		return Secret{}, fmt.Errorf("failed to create cipher from dek: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Secret{}, fmt.Errorf("failed to create gcm from dek: %w", err)
	}
	if len(s.payload) < gcm.NonceSize() {
		return Secret{}, errors.New("malformed ciphertext")
	}
	nonce, ct := s.payload[:gcm.NonceSize()], s.payload[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return Secret{}, fmt.Errorf("failed to decrypt ciphertext with dek: %w", err)
	}
	a := s.attrs
	return Secret{
		Backend:        Storage,
		Parent:         s.bucket,
		Name:           a.Name,
		Generation:     a.Generation,
		Metageneration: a.Metageneration,
		KMSKey:         a.Metadata[berglas.MetadataKMSKey],
		UpdatedAt:      a.Updated,
		Plaintext:      plaintext,
	}, nil
}

// fastReader holds its own storage and kms clients plus the prefetched
// objects. fetch is a field so tests can replace the network.
type fastReader struct {
	kms   kmsDecrypter
	fetch func(ctx context.Context, bucket, object string, gen int64) (*sealed, error)

	mu      sync.Mutex
	pending map[string]*prefetch
}

type prefetch struct {
	done chan struct{}
	s    *sealed
	err  error
	at   time.Time
}

func storageFetch(sc *storage.Client) func(ctx context.Context, bucket, object string, gen int64) (*sealed, error) {
	return func(ctx context.Context, bucket, object string, gen int64) (*sealed, error) {
		obj := sc.Bucket(bucket).Object(object).Generation(gen)
		var attrs *storage.ObjectAttrs
		var data []byte
		var attrsErr, dataErr error
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			attrs, attrsErr = obj.Attrs(ctx)
		}()
		go func() {
			defer wg.Done()
			r, err := obj.NewReader(ctx)
			if err != nil {
				dataErr = err
				return
			}
			defer r.Close()
			data, dataErr = io.ReadAll(r)
		}()
		wg.Wait()
		if err := errors.Join(attrsErr, dataErr); err != nil {
			return nil, err
		}
		return parseSealed(bucket, attrs, data)
	}
}

func pkey(bucket, object string, gen int64) string {
	return fmt.Sprintf("%s/%s#%d", bucket, object, gen)
}

// sweep drops expired entries and keeps at most prefetchMax; f.mu is held.
func (f *fastReader) sweep(now time.Time) {
	var oldest string
	for k, p := range f.pending {
		if now.Sub(p.at) > prefetchTTL {
			delete(f.pending, k)
		}
	}
	for len(f.pending) > prefetchMax {
		oldest = ""
		for k, p := range f.pending {
			if oldest == "" || p.at.Before(f.pending[oldest].at) {
				oldest = k
			}
		}
		delete(f.pending, oldest)
	}
}

// Prefetch starts downloading one generation in the background, unless it
// is already there or on its way.
func (f *fastReader) Prefetch(bucket, object string, gen int64) {
	if gen == 0 {
		return
	}
	k := pkey(bucket, object, gen)
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	f.sweep(now)
	if p, ok := f.pending[k]; ok {
		select {
		case <-p.done:
			if p.err == nil {
				return // already here
			}
		default:
			return // on its way
		}
	}
	p := &prefetch{done: make(chan struct{}), at: now}
	f.pending[k] = p
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), prefetchTimeout)
		defer cancel()
		p.s, p.err = f.fetch(ctx, bucket, object, gen)
		close(p.done)
	}()
}

// Read decrypts one generation, using a prefetched copy when there is one
// (waiting for it if it is still downloading) and fetching it otherwise.
func (f *fastReader) Read(ctx context.Context, bucket, object string, gen int64) (Secret, error) {
	f.mu.Lock()
	p := f.pending[pkey(bucket, object, gen)]
	f.mu.Unlock()
	var s *sealed
	if p != nil {
		select {
		case <-p.done:
		case <-ctx.Done():
			return Secret{}, ctx.Err()
		}
		s = p.s
	}
	if s == nil { // none, or the prefetch failed: fetch now
		var err error
		if s, err = f.fetch(ctx, bucket, object, gen); err != nil {
			return Secret{}, err
		}
	}
	return open(ctx, f.kms, s)
}

// fastFor returns the fast reader, creating its clients on first use.
func (s *Service) fastFor(ctx context.Context) (*fastReader, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fast != nil {
		return s.fast, nil
	}
	opts, err := s.Auth.ClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	sc, err := storage.NewClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("create storage client: %w", err)
	}
	kc, err := kms.NewKeyManagementClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("create kms client: %w", err)
	}
	s.fast = &fastReader{kms: kc, fetch: storageFetch(sc), pending: map[string]*prefetch{}}
	return s.fast, nil
}
