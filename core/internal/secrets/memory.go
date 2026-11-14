package secrets

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/GoogleCloudPlatform/berglas/v2/pkg/berglas"
)

// Memory is an in-process Store with the same rules as the real backends:
// versions accumulate, storage writes check generation/metageneration, and
// secret manager writes check the expected version. Nothing leaves the
// process, so it backs -demo mode and tests.
type Memory struct {
	mu      sync.Mutex
	items   map[memKey]*memEntry
	nextGen int64
	now     func() time.Time
}

type memKey struct {
	backend      Backend
	parent, name string
}

type memEntry struct {
	versions []Secret // oldest first; Plaintext set
}

var _ Store = (*Memory)(nil)

// NewMemory returns an empty store.
func NewMemory() *Memory {
	return &Memory{items: map[memKey]*memEntry{}, nextGen: 1_700_000_000_000_000, now: time.Now}
}

func (m *Memory) entry(backend Backend, parent, name string) *memEntry {
	return m.items[memKey{backend, parent, name}]
}

func (m *Memory) newVersion(backend Backend, parent, name string, plaintext []byte, prev *Secret, kmsKey string, locations []string) Secret {
	s := Secret{Backend: backend, Parent: parent, Name: name, UpdatedAt: m.now().UTC(), Plaintext: append([]byte(nil), plaintext...)}
	if backend == Storage {
		m.nextGen += 1_000_003
		s.Generation, s.Metageneration, s.KMSKey = m.nextGen, 1, kmsKey
	} else {
		n := 1
		if prev != nil {
			n, _ = strconv.Atoi(prev.Version)
			n++
		}
		s.Version, s.Locations = strconv.Itoa(n), locations
	}
	return s
}

func withoutValue(s Secret) Secret {
	s.Plaintext = nil
	return s
}

// List returns the latest version of each secret under parent, by name.
func (m *Memory) List(_ context.Context, backend Backend, parent, prefix string) ([]Secret, error) {
	if err := validate(backend, parent); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Secret{}
	for k, e := range m.items {
		if k.backend == backend && k.parent == parent && strings.HasPrefix(k.name, prefix) {
			out = append(out, withoutValue(e.versions[len(e.versions)-1]))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Versions returns every version, newest first, without values.
func (m *Memory) Versions(_ context.Context, r Ref) ([]Secret, error) {
	if err := validateRef(r); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.entry(r.Backend, r.Parent, r.Name)
	if e == nil {
		return []Secret{}, nil
	}
	out := make([]Secret, 0, len(e.versions))
	for i := len(e.versions) - 1; i >= 0; i-- {
		out = append(out, withoutValue(e.versions[i]))
	}
	return out, nil
}

// Read returns one version with its value.
func (m *Memory) Read(_ context.Context, r Ref) (Secret, error) {
	if err := validateRef(r); err != nil {
		return Secret{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.entry(r.Backend, r.Parent, r.Name)
	if e == nil {
		return Secret{}, ErrNotFound
	}
	if r.Version == "" || r.Version == "latest" {
		s := e.versions[len(e.versions)-1]
		s.Plaintext = append([]byte(nil), s.Plaintext...)
		return s, nil
	}
	for _, v := range e.versions {
		if (r.Backend == Storage && strconv.FormatInt(v.Generation, 10) == r.Version) || (r.Backend == SecretManager && v.Version == r.Version) {
			v.Plaintext = append([]byte(nil), v.Plaintext...)
			return v, nil
		}
	}
	return Secret{}, fmt.Errorf("%w: no version %s", ErrNotFound, r.Version)
}

// Create adds a secret and fails if it exists.
func (m *Memory) Create(_ context.Context, in CreateInput) (Secret, error) {
	if err := validateRef(Ref{Backend: in.Backend, Parent: in.Parent, Name: in.Name}); err != nil {
		return Secret{}, err
	}
	if in.Backend == Storage && in.KMSKey == "" {
		return Secret{}, fmt.Errorf("%w: kms key is required for storage secrets", ErrInvalid)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.entry(in.Backend, in.Parent, in.Name) != nil {
		return Secret{}, ErrExists
	}
	s := m.newVersion(in.Backend, in.Parent, in.Name, in.Plaintext, nil, in.KMSKey, in.Locations)
	m.items[memKey{in.Backend, in.Parent, in.Name}] = &memEntry{versions: []Secret{s}}
	return withoutValue(s), nil
}

// Update appends a version after the same precondition checks as Service.
func (m *Memory) Update(_ context.Context, in UpdateInput) (Secret, error) {
	if err := validateRef(Ref{Backend: in.Backend, Parent: in.Parent, Name: in.Name}); err != nil {
		return Secret{}, err
	}
	if in.Plaintext == nil {
		return Secret{}, fmt.Errorf("%w: missing value", ErrInvalid)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.entry(in.Backend, in.Parent, in.Name)
	if e == nil {
		if !in.CreateIfMissing {
			return Secret{}, ErrNotFound
		}
		if in.Backend == Storage && in.KMSKey == "" {
			return Secret{}, fmt.Errorf("%w: kms key is required to create a storage secret", ErrInvalid)
		}
		s := m.newVersion(in.Backend, in.Parent, in.Name, in.Plaintext, nil, in.KMSKey, nil)
		m.items[memKey{in.Backend, in.Parent, in.Name}] = &memEntry{versions: []Secret{s}}
		return withoutValue(s), nil
	}
	cur := e.versions[len(e.versions)-1]
	if in.Backend == Storage {
		if (in.ExpectedGeneration != 0 && in.ExpectedGeneration != cur.Generation) ||
			(in.ExpectedMetageneration != 0 && in.ExpectedMetageneration != cur.Metageneration) {
			return Secret{}, fmt.Errorf("%w: latest generation is %d, you loaded %d", ErrModified, cur.Generation, in.ExpectedGeneration)
		}
	} else if in.ExpectedVersion != "" && in.ExpectedVersion != cur.Version {
		return Secret{}, fmt.Errorf("%w: latest version is %s, you loaded %s", ErrModified, cur.Version, in.ExpectedVersion)
	}
	key := in.KMSKey
	if key == "" {
		key = cur.KMSKey
	}
	s := m.newVersion(in.Backend, in.Parent, in.Name, in.Plaintext, &cur, key, cur.Locations)
	e.versions = append(e.versions, s)
	return withoutValue(s), nil
}

// Delete removes a secret and all its versions.
func (m *Memory) Delete(_ context.Context, r Ref) error {
	if err := validateRef(r); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	k := memKey{r.Backend, r.Parent, r.Name}
	if m.items[k] == nil {
		return ErrNotFound
	}
	if r.Backend == Storage { // same refusal as Service; see its Delete
		for o := range m.items {
			if o.backend == Storage && o.parent == r.Parent && o.name != r.Name && strings.HasPrefix(o.name, r.Name) {
				return fmt.Errorf("%w: %q also starts with %q; berglas deletes by prefix and would fail partway through, so rename or delete %q first",
					ErrInvalid, o.name, r.Name, o.name)
			}
		}
	}
	delete(m.items, k)
	return nil
}

// Grant only validates; the demo has no iam.
func (m *Memory) Grant(_ context.Context, in MembersInput) error { return in.check() }

// Revoke only validates; the demo has no iam.
func (m *Memory) Revoke(_ context.Context, in MembersInput) error { return in.check() }

// Bootstrap only validates; the demo has no buckets or keys to create.
func (m *Memory) Bootstrap(_ context.Context, in BootstrapInput) error {
	if in.ProjectID == "" || in.Bucket == "" {
		return fmt.Errorf("%w: project id and bucket are required", ErrInvalid)
	}
	return nil
}

// Resolve reads the secret a berglas:// or sm:// reference points to.
func (m *Memory) Resolve(ctx context.Context, ref string) ([]byte, error) {
	if !berglas.IsReference(ref) {
		return nil, fmt.Errorf("%w: not a berglas:// or sm:// reference", ErrInvalid)
	}
	p, err := berglas.ParseReference(ref)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if p.Filepath() != "" {
		return nil, fmt.Errorf("%w: references with a destination file are not supported here", ErrInvalid)
	}
	r := Ref{Backend: SecretManager, Parent: p.Project(), Name: p.Name(), Version: p.Version()}
	if p.Type() == berglas.ReferenceTypeStorage {
		r = Ref{Backend: Storage, Parent: p.Bucket(), Name: p.Object()}
		if g := p.Generation(); g != 0 {
			r.Version = strconv.FormatInt(g, 10)
		}
	}
	s, err := m.Read(ctx, r)
	if err != nil {
		return nil, err
	}
	return s.Plaintext, nil
}

// DemoKMSKey is the made-up key the demo data claims to use.
const DemoKMSKey = "projects/demo-project/locations/global/keyRings/berglas/cryptoKeys/berglas-key"

// NewDemo returns a Memory seeded with made-up secrets in the demo-bucket
// bucket and demo-project project, with some history to diff.
func NewDemo() *Memory {
	m := NewMemory()
	ctx := context.Background()
	t := time.Now().Add(-90 * 24 * time.Hour)
	m.now = func() time.Time { t = t.Add(9*24*time.Hour + 37*time.Minute); return t }

	put := func(b Backend, parent, name string, values ...string) {
		for i, v := range values {
			var err error
			if i == 0 {
				_, err = m.Create(ctx, CreateInput{Backend: b, Parent: parent, Name: name, Plaintext: []byte(v), KMSKey: DemoKMSKey})
			} else {
				_, err = m.Update(ctx, UpdateInput{Backend: b, Parent: parent, Name: name, Plaintext: []byte(v)})
			}
			if err != nil {
				panic(err) // seed data is static; a failure is a bug
			}
		}
	}

	put(Storage, "demo-bucket", "payments-dev-env",
		"# payments service, dev\nDATABASE_URL=postgres://payments:dev-pass-1@db.dev.internal:5432/payments\nSTRIPE_KEY=sk_test_demo_000111\nLOG_LEVEL=debug\n",
		"# payments service, dev\nDATABASE_URL=postgres://payments:dev-pass-2@db.dev.internal:5432/payments\nSTRIPE_KEY=sk_test_demo_000111\nLOG_LEVEL=debug\nFEATURE_REFUNDS=true\n",
		"# payments service, dev\nDATABASE_URL=postgres://payments:dev-pass-2@db.dev.internal:5432/payments\nSTRIPE_KEY=sk_test_demo_222333\nLOG_LEVEL=info\nFEATURE_REFUNDS=true\nexport WEBHOOK_SECRET=whsec_demo_abc\n",
	)
	put(Storage, "demo-bucket", "payments-prod-env",
		"DATABASE_URL=postgres://payments:prod-pass@db.prod.internal:5432/payments\nSTRIPE_KEY=sk_live_demo_999\nLOG_LEVEL=warn\n",
	)
	// orders drifts on purpose, for the key drift view: a key missing in
	// prod, one only in dev, a quote-only difference, an empty value, and a
	// prod value that is the same as staging's
	put(Storage, "demo-bucket", "orders-dev-env",
		"API_URL=https://orders.dev.internal\nQUEUE_URL=sqs://orders-dev\nTIMEOUT_MS=5000\nFEATURE_SPLIT=true\nDEBUG_TOKEN=dbg_demo_1\nSENTRY_DSN=\n",
	)
	put(Storage, "demo-bucket", "orders-staging-env",
		"API_URL=https://orders.staging.internal\nQUEUE_URL=sqs://orders-shared\nTIMEOUT_MS=\"5000\"\nFEATURE_SPLIT=true\nSENTRY_DSN=https://demo@sentry.example/2\n",
	)
	put(Storage, "demo-bucket", "orders-prod-env",
		"API_URL=https://orders.internal\nQUEUE_URL=sqs://orders-shared\nTIMEOUT_MS=3000\nSENTRY_DSN=https://demo@sentry.example/3\n",
	)
	put(Storage, "demo-bucket", "search-api-key", "demo-search-key-7f3a9c")
	put(Storage, "demo-bucket", "tls-cert",
		"-----BEGIN CERTIFICATE-----\nMIIBdemoONLYnotArealCERTIFICATE0123456789abcdef\n-----END CERTIFICATE-----\n",
		"-----BEGIN CERTIFICATE-----\nMIIBdemoONLYrotatedCERTIFICATEfedcba9876543210\n-----END CERTIFICATE-----\n",
	)
	put(SecretManager, "demo-project", "db-password", "hunter2-demo", "correct-horse-demo")
	put(SecretManager, "demo-project", "worker-env", "QUEUE=jobs\nCONCURRENCY=4\n", "QUEUE=jobs\nCONCURRENCY=8\nRETRY_LIMIT=5\n")

	m.now = time.Now
	return m
}
