package secrets

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

func TestMemoryStorageUpdateChecksGeneration(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	created, err := m.Create(ctx, CreateInput{Backend: Storage, Parent: "b", Name: "s", Plaintext: []byte("v1"), KMSKey: "k"})
	if err != nil {
		t.Fatal(err)
	}
	// Two editors load generation 1; the first save wins.
	first, err := m.Update(ctx, UpdateInput{Backend: Storage, Parent: "b", Name: "s", Plaintext: []byte("v2"),
		ExpectedGeneration: created.Generation, ExpectedMetageneration: created.Metageneration})
	if err != nil {
		t.Fatal(err)
	}
	_, err = m.Update(ctx, UpdateInput{Backend: Storage, Parent: "b", Name: "s", Plaintext: []byte("v2-other"),
		ExpectedGeneration: created.Generation, ExpectedMetageneration: created.Metageneration})
	if !errors.Is(err, ErrModified) {
		t.Fatalf("stale write: err = %v, want ErrModified", err)
	}
	got, err := m.Read(ctx, Ref{Backend: Storage, Parent: "b", Name: "s"})
	if err != nil || string(got.Plaintext) != "v2" || got.Generation != first.Generation {
		t.Fatalf("latest = %q gen %d (err %v), want v2 gen %d", got.Plaintext, got.Generation, err, first.Generation)
	}
	old, err := m.Read(ctx, Ref{Backend: Storage, Parent: "b", Name: "s", Version: strconv.FormatInt(created.Generation, 10)})
	if err != nil || string(old.Plaintext) != "v1" {
		t.Fatalf("old generation = %q (err %v), want v1", old.Plaintext, err)
	}
	vs, _ := m.Versions(ctx, Ref{Backend: Storage, Parent: "b", Name: "s"})
	if len(vs) != 2 || vs[0].Generation != first.Generation || vs[0].Plaintext != nil {
		t.Fatalf("versions = %+v, want 2, newest first, no values", vs)
	}
}

func TestMemorySecretManagerUpdateChecksVersion(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	if _, err := m.Create(ctx, CreateInput{Backend: SecretManager, Parent: "p", Name: "s", Plaintext: []byte("a")}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Update(ctx, UpdateInput{Backend: SecretManager, Parent: "p", Name: "s", Plaintext: []byte("b"), ExpectedVersion: "1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Update(ctx, UpdateInput{Backend: SecretManager, Parent: "p", Name: "s", Plaintext: []byte("c"), ExpectedVersion: "1"}); !errors.Is(err, ErrModified) {
		t.Fatalf("err = %v, want ErrModified", err)
	}
}

func TestMemoryNotFoundAndExists(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	if _, err := m.Read(ctx, Ref{Backend: SecretManager, Parent: "p", Name: "x"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("read missing: %v", err)
	}
	in := CreateInput{Backend: SecretManager, Parent: "p", Name: "x", Plaintext: []byte("1")}
	if _, err := m.Create(ctx, in); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Create(ctx, in); !errors.Is(err, ErrExists) {
		t.Fatalf("create twice: %v", err)
	}
}

func TestDemoSeedsHistory(t *testing.T) {
	m := NewDemo()
	vs, err := m.Versions(context.Background(), Ref{Backend: Storage, Parent: "demo-bucket", Name: "payments-dev-env"})
	if err != nil || len(vs) != 3 {
		t.Fatalf("versions = %d (err %v), want 3", len(vs), err)
	}
	if !vs[0].UpdatedAt.After(vs[1].UpdatedAt) {
		t.Fatal("seeded versions should get later timestamps")
	}
}
