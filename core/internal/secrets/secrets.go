// Package secrets wraps the berglas library behind one backend-neutral API, so
// callers address a secret as (backend, parent, name) for either storage type.
package secrets

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"

	"berglas-ui/core/internal/gcpauth"
)

// Backend selects where a secret lives.
type Backend string

const (
	// Storage is Cloud Storage + Cloud KMS (berglas://bucket/object).
	Storage Backend = "storage"
	// SecretManager is Secret Manager (sm://project/name).
	SecretManager Backend = "sm"
)

// Secret is the JSON shape the API returns. Plaintext is only set by Read and
// is base64-encoded by encoding/json.
type Secret struct {
	Backend        Backend   `json:"backend"`
	Parent         string    `json:"parent"`
	Name           string    `json:"name"`
	Version        string    `json:"version,omitempty"`
	Generation     int64     `json:"generation,omitempty,string"`
	Metageneration int64     `json:"metageneration,omitempty,string"`
	KMSKey         string    `json:"kmsKey,omitempty"`
	Locations      []string  `json:"locations,omitempty"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Plaintext      []byte    `json:"plaintext,omitempty"`
}

// Ref addresses one secret, optionally at a specific version. For Storage the
// version is a generation number; for Secret Manager it is a version id or
// "latest". Empty means latest.
type Ref struct {
	Backend Backend `json:"backend"`
	Parent  string  `json:"parent"`
	Name    string  `json:"name"`
	Version string  `json:"version,omitempty"`
}

// ErrModified means the secret changed since the caller loaded it.
var ErrModified = errors.New("secret was modified since it was loaded")

// ErrInvalid wraps request validation failures.
var ErrInvalid = errors.New("invalid request")

// ErrNotFound and ErrExists are returned by stores other than Service; the
// berglas library has its own equivalents, which callers check as well.
var (
	ErrNotFound = errors.New("secret does not exist")
	ErrExists   = errors.New("secret already exists")
)

// Store is everything the api needs from a secrets backend. Service talks to
// Google Cloud through berglas; Memory is an in-process stand-in for demos and
// tests.
type Store interface {
	List(ctx context.Context, backend Backend, parent, prefix string) ([]Secret, error)
	Versions(ctx context.Context, r Ref) ([]Secret, error)
	Read(ctx context.Context, r Ref) (Secret, error)
	Create(ctx context.Context, in CreateInput) (Secret, error)
	Update(ctx context.Context, in UpdateInput) (Secret, error)
	Delete(ctx context.Context, r Ref) error
	Grant(ctx context.Context, in MembersInput) error
	Revoke(ctx context.Context, in MembersInput) error
	Bootstrap(ctx context.Context, in BootstrapInput) error
	Resolve(ctx context.Context, ref string) ([]byte, error)
}

var _ Store = (*Service)(nil)

// Service holds a lazily created berglas client. Creation is retried on each
// call until it succeeds, so the UI recovers once the user runs
// `gcloud auth application-default login` without restarting the core.
type Service struct {
	// Auth picks the Google identity; the zero value is plain ADC.
	Auth gcpauth.Auth
	// NoFastRead turns off the prefetching storage read (fastread.go), so
	// every read goes through the berglas library as before.
	NoFastRead bool

	mu     sync.Mutex
	client *berglas.Client
	fast   *fastReader
}

func (s *Service) c(ctx context.Context) (*berglas.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.client != nil {
		return s.client, nil
	}
	opts, err := s.Auth.ClientOptions(ctx)
	if err != nil {
		return nil, err
	}
	c, err := berglas.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("create berglas client: %w", err)
	}
	s.client = c
	return c, nil
}

func validate(backend Backend, parent string) error {
	switch backend {
	case Storage, SecretManager:
	default:
		return fmt.Errorf("%w: backend must be %q or %q", ErrInvalid, Storage, SecretManager)
	}
	if parent == "" {
		return fmt.Errorf("%w: missing parent (bucket or project)", ErrInvalid)
	}
	return nil
}

func validateRef(r Ref) error {
	if err := validate(r.Backend, r.Parent); err != nil {
		return err
	}
	if r.Name == "" {
		return fmt.Errorf("%w: missing secret name", ErrInvalid)
	}
	return nil
}

func generation(v string) (int64, error) {
	if v == "" || v == "latest" {
		return 0, nil
	}
	g, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: storage version must be a generation number", ErrInvalid)
	}
	return g, nil
}

func fromBerglas(b Backend, s *berglas.Secret) Secret {
	return Secret{
		Backend:        b,
		Parent:         s.Parent,
		Name:           s.Name,
		Version:        s.Version,
		Generation:     s.Generation,
		Metageneration: s.Metageneration,
		KMSKey:         s.KMSKey,
		Locations:      s.Locations,
		UpdatedAt:      s.UpdatedAt,
		Plaintext:      s.Plaintext,
	}
}

// List returns the live secrets under parent. Values are never included.
func (s *Service) List(ctx context.Context, backend Backend, parent, prefix string) ([]Secret, error) {
	if err := validate(backend, parent); err != nil {
		return nil, err
	}
	return s.list(ctx, backend, parent, prefix, false)
}

// Versions returns every stored version of one secret, newest first. For
// Storage, older generations only exist when object versioning is on.
func (s *Service) Versions(ctx context.Context, r Ref) ([]Secret, error) {
	if err := validateRef(r); err != nil {
		return nil, err
	}
	all, err := s.list(ctx, r.Backend, r.Parent, r.Name, true)
	if err != nil {
		return nil, err
	}
	out := all[:0]
	for _, v := range all {
		if v.Name == r.Name { // the prefix also matches longer names
			out = append(out, v)
		}
	}
	// berglas does not order versions by age, so sort newest first: storage
	// generations and secret manager version ids both increase over time.
	sort.Slice(out, func(i, j int) bool {
		if r.Backend == Storage {
			return out[i].Generation > out[j].Generation
		}
		vi, _ := strconv.Atoi(out[i].Version)
		vj, _ := strconv.Atoi(out[j].Version)
		return vi > vj
	})
	// someone looking at a secret's versions is likely to reveal the newest:
	// start downloading it (still encrypted) so reveal only waits for kms
	if r.Backend == Storage && len(out) > 0 && !s.NoFastRead {
		if f, err := s.fastFor(ctx); err == nil {
			f.Prefetch(r.Parent, r.Name, out[0].Generation)
		}
	}
	return out, nil
}

func (s *Service) list(ctx context.Context, backend Backend, parent, prefix string, versions bool) ([]Secret, error) {
	c, err := s.c(ctx)
	if err != nil {
		return nil, err
	}
	var resp *berglas.ListResponse
	if backend == Storage {
		resp, err = c.List(ctx, &berglas.StorageListRequest{Bucket: parent, Prefix: prefix, Generations: versions})
	} else {
		resp, err = c.List(ctx, &berglas.SecretManagerListRequest{Project: parent, Prefix: prefix, Versions: versions})
	}
	if err != nil {
		return nil, err
	}
	out := make([]Secret, 0, len(resp.Secrets))
	for _, sec := range resp.Secrets {
		out = append(out, fromBerglas(backend, sec))
	}
	return out, nil
}

// Read returns a secret with its decrypted value.
func (s *Service) Read(ctx context.Context, r Ref) (Secret, error) {
	if err := validateRef(r); err != nil {
		return Secret{}, err
	}
	c, err := s.c(ctx)
	if err != nil {
		return Secret{}, err
	}
	var sec *berglas.Secret
	if r.Backend == Storage {
		g, gerr := generation(r.Version)
		if gerr != nil {
			return Secret{}, gerr
		}
		// an exact generation can use the fast read; "latest" needs berglas
		// to look it up. On any failure, fall back to the berglas library.
		if g != 0 && !s.NoFastRead {
			if f, ferr := s.fastFor(ctx); ferr == nil {
				out, rerr := f.Read(ctx, r.Parent, r.Name, g)
				if rerr == nil {
					return out, nil
				}
				if ctx.Err() != nil {
					return Secret{}, ctx.Err()
				}
			}
		}
		sec, err = c.Read(ctx, &berglas.StorageReadRequest{Bucket: r.Parent, Object: r.Name, Generation: g})
	} else {
		v := r.Version
		if v == "" {
			v = "latest"
		}
		sec, err = c.Read(ctx, &berglas.SecretManagerReadRequest{Project: r.Parent, Name: r.Name, Version: v})
	}
	if err != nil {
		return Secret{}, err
	}
	return fromBerglas(r.Backend, sec), nil
}

// CreateInput creates a secret. KMSKey is required for Storage. Locations is
// optional for Secret Manager (nil means automatic replication).
type CreateInput struct {
	Backend   Backend  `json:"backend"`
	Parent    string   `json:"parent"`
	Name      string   `json:"name"`
	Plaintext []byte   `json:"plaintext"`
	KMSKey    string   `json:"kmsKey,omitempty"`
	Locations []string `json:"locations,omitempty"`
}

// Create creates a new secret and fails if it already exists.
func (s *Service) Create(ctx context.Context, in CreateInput) (Secret, error) {
	if err := validateRef(Ref{Backend: in.Backend, Parent: in.Parent, Name: in.Name}); err != nil {
		return Secret{}, err
	}
	c, err := s.c(ctx)
	if err != nil {
		return Secret{}, err
	}
	var sec *berglas.Secret
	if in.Backend == Storage {
		if in.KMSKey == "" {
			return Secret{}, fmt.Errorf("%w: kms key is required for storage secrets", ErrInvalid)
		}
		sec, err = c.Create(ctx, &berglas.StorageCreateRequest{Bucket: in.Parent, Object: in.Name, Key: in.KMSKey, Plaintext: in.Plaintext})
	} else {
		sec, err = c.Create(ctx, &berglas.SecretManagerCreateRequest{Project: in.Parent, Name: in.Name, Plaintext: in.Plaintext, Locations: in.Locations})
	}
	if err != nil {
		return Secret{}, err
	}
	return fromBerglas(in.Backend, sec), nil
}

// UpdateInput writes a new value. The expected* fields carry what the caller
// loaded, so a concurrent write is rejected rather than overwritten:
//   - Storage: ExpectedGeneration/ExpectedMetageneration are passed to berglas,
//     which makes the write a compare-and-swap.
//   - Secret Manager: berglas has no precondition, so the latest version is
//     compared to ExpectedVersion just before writing. This narrows the race
//     window but is not atomic.
type UpdateInput struct {
	Backend                Backend `json:"backend"`
	Parent                 string  `json:"parent"`
	Name                   string  `json:"name"`
	Plaintext              []byte  `json:"plaintext"`
	KMSKey                 string  `json:"kmsKey,omitempty"`
	ExpectedGeneration     int64   `json:"expectedGeneration,omitempty,string"`
	ExpectedMetageneration int64   `json:"expectedMetageneration,omitempty,string"`
	ExpectedVersion        string  `json:"expectedVersion,omitempty"`
	CreateIfMissing        bool    `json:"createIfMissing,omitempty"`
}

// Update writes a new version of a secret.
func (s *Service) Update(ctx context.Context, in UpdateInput) (Secret, error) {
	if err := validateRef(Ref{Backend: in.Backend, Parent: in.Parent, Name: in.Name}); err != nil {
		return Secret{}, err
	}
	if in.Plaintext == nil {
		return Secret{}, fmt.Errorf("%w: missing value", ErrInvalid)
	}
	c, err := s.c(ctx)
	if err != nil {
		return Secret{}, err
	}
	var sec *berglas.Secret
	if in.Backend == Storage {
		sec, err = c.Update(ctx, &berglas.StorageUpdateRequest{
			Bucket: in.Parent, Object: in.Name, Key: in.KMSKey, Plaintext: in.Plaintext,
			Generation: in.ExpectedGeneration, Metageneration: in.ExpectedMetageneration,
			CreateIfMissing: in.CreateIfMissing,
		})
	} else {
		if in.ExpectedVersion != "" {
			cur, rerr := c.Read(ctx, &berglas.SecretManagerReadRequest{Project: in.Parent, Name: in.Name, Version: "latest"})
			if rerr != nil {
				return Secret{}, rerr
			}
			if cur.Version != in.ExpectedVersion {
				return Secret{}, fmt.Errorf("%w: latest version is %s, you loaded %s", ErrModified, cur.Version, in.ExpectedVersion)
			}
		}
		sec, err = c.Update(ctx, &berglas.SecretManagerUpdateRequest{
			Project: in.Parent, Name: in.Name, Plaintext: in.Plaintext, CreateIfMissing: in.CreateIfMissing,
		})
	}
	if err != nil {
		if berglas.IsSecretModifiedErr(err) {
			return Secret{}, fmt.Errorf("%w: %v", ErrModified, err)
		}
		return Secret{}, err
	}
	return fromBerglas(in.Backend, sec), nil
}

// Delete removes a secret.
func (s *Service) Delete(ctx context.Context, r Ref) error {
	if err := validateRef(r); err != nil {
		return err
	}
	c, err := s.c(ctx)
	if err != nil {
		return err
	}
	if r.Backend == Storage {
		// berglas collects generations by listing the name as a prefix, then
		// deletes this name at each one. If another secret starts with this
		// name, that hits a generation this name never had and fails midway,
		// after some history is already gone. Refuse up front instead.
		// Only berglas secrets are listed; other objects with the prefix
		// would still trip it.
		siblings, err := s.List(ctx, Storage, r.Parent, r.Name)
		if err != nil {
			return err
		}
		for _, sib := range siblings {
			if sib.Name != r.Name {
				return fmt.Errorf("%w: %q also starts with %q; berglas deletes by prefix and would fail partway through, so rename or delete %q first",
					ErrInvalid, sib.Name, r.Name, sib.Name)
			}
		}
		return c.Delete(ctx, &berglas.StorageDeleteRequest{Bucket: r.Parent, Object: r.Name})
	}
	return c.Delete(ctx, &berglas.SecretManagerDeleteRequest{Project: r.Parent, Name: r.Name})
}

// MembersInput grants or revokes access for IAM members such as
// "user:a@example.com" or "serviceAccount:x@p.iam.gserviceaccount.com".
type MembersInput struct {
	Backend Backend  `json:"backend"`
	Parent  string   `json:"parent"`
	Name    string   `json:"name"`
	Members []string `json:"members"`
}

func (in MembersInput) check() error {
	if err := validateRef(Ref{Backend: in.Backend, Parent: in.Parent, Name: in.Name}); err != nil {
		return err
	}
	if len(in.Members) == 0 {
		return fmt.Errorf("%w: no members given", ErrInvalid)
	}
	return nil
}

// Grant gives members access to a secret (and, for Storage, its KMS key).
func (s *Service) Grant(ctx context.Context, in MembersInput) error {
	if err := in.check(); err != nil {
		return err
	}
	c, err := s.c(ctx)
	if err != nil {
		return err
	}
	if in.Backend == Storage {
		return c.Grant(ctx, &berglas.StorageGrantRequest{Bucket: in.Parent, Object: in.Name, Members: in.Members})
	}
	return c.Grant(ctx, &berglas.SecretManagerGrantRequest{Project: in.Parent, Name: in.Name, Members: in.Members})
}

// Revoke removes members' access to a secret.
func (s *Service) Revoke(ctx context.Context, in MembersInput) error {
	if err := in.check(); err != nil {
		return err
	}
	c, err := s.c(ctx)
	if err != nil {
		return err
	}
	if in.Backend == Storage {
		return c.Revoke(ctx, &berglas.StorageRevokeRequest{Bucket: in.Parent, Object: in.Name, Members: in.Members})
	}
	return c.Revoke(ctx, &berglas.SecretManagerRevokeRequest{Project: in.Parent, Name: in.Name, Members: in.Members})
}

// BootstrapInput sets up a bucket and KMS key for the Storage backend.
// Empty location/keyring/key fields fall back to berglas defaults.
type BootstrapInput struct {
	ProjectID      string `json:"projectId"`
	Bucket         string `json:"bucket"`
	BucketLocation string `json:"bucketLocation,omitempty"`
	KMSLocation    string `json:"kmsLocation,omitempty"`
	KMSKeyRing     string `json:"kmsKeyRing,omitempty"`
	KMSCryptoKey   string `json:"kmsCryptoKey,omitempty"`
}

// Bootstrap creates the Storage backend's bucket and KMS key.
func (s *Service) Bootstrap(ctx context.Context, in BootstrapInput) error {
	if in.ProjectID == "" || in.Bucket == "" {
		return fmt.Errorf("%w: project id and bucket are required", ErrInvalid)
	}
	c, err := s.c(ctx)
	if err != nil {
		return err
	}
	return c.Bootstrap(ctx, &berglas.StorageBootstrapRequest{
		ProjectID: in.ProjectID, Bucket: in.Bucket, BucketLocation: in.BucketLocation,
		KMSLocation: in.KMSLocation, KMSKeyRing: in.KMSKeyRing, KMSCryptoKey: in.KMSCryptoKey,
	})
}

// Resolve returns the value a berglas:// or sm:// reference points to. A
// reference with a ?destination= file parameter would make berglas write the
// value to disk, so those are rejected.
func (s *Service) Resolve(ctx context.Context, ref string) ([]byte, error) {
	if !berglas.IsReference(ref) {
		return nil, fmt.Errorf("%w: not a berglas:// or sm:// reference", ErrInvalid)
	}
	parsed, err := berglas.ParseReference(ref)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if parsed.Filepath() != "" {
		return nil, fmt.Errorf("%w: references with a destination file are not supported here", ErrInvalid)
	}
	c, err := s.c(ctx)
	if err != nil {
		return nil, err
	}
	return c.Resolve(ctx, ref)
}
