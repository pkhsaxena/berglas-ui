# berglas-ui

A local UI for [berglas](https://github.com/GoogleCloudPlatform/berglas) secrets, on both
backends: Cloud Storage + KMS (`berglas://`) and Secret Manager (`sm://`).

```
core/   Go: a localhost JSON api over the berglas library; embeds the built ui
ui/     React + Vite + TypeScript; talks only to the core's api (see ui/src/api.ts)
```

## changing the ui

The ui is split so the look can be replaced without touching behaviour:

```
ui/src/core/            no markup, no css: api client, .env parsing, diffing, time formatting
ui/src/core/hooks/      everything a screen needs: useApp (session, config, sources),
                        useSecretList, useSecret (versions, reveal, copy), and the edit/diff hooks
ui/src/skins/terminal/  the current look: components, css and theme presets
ui/src/main.tsx         picks the skin: import { App } from './skins/terminal'
```

To build a new look, add `ui/src/skins/<name>/` that exports an `App` built on the hooks,
and change the one import in `main.tsx`. Skins must not call `fetch` or parse values
themselves; anything a second skin would also need belongs in `core/`. The `theme` config key
is an opaque name, so each skin decides which names it understands.

## credentials

The core uses Google Application Default Credentials, so you act as yourself and Cloud IAM
decides what you can see. Once per machine:

```bash
gcloud auth application-default login
```

## run

```bash
npm --prefix ui install && npm --prefix ui run build   # builds into core/webui/dist
cd core && go run ./cmd/berglas-ui -open
```

The core picks a free port on 127.0.0.1 and prints a link with a per-launch token. Opening it
pairs the browser via an HttpOnly cookie. Flags: `-listen` (default `127.0.0.1:0`, a random
port), `-open`, `-api-only`, `-allow-non-loopback` (containers only).

### demo mode

```bash
cd core && go run ./cmd/berglas-ui -demo -open
```

This serves made-up secrets from memory (`demo-bucket`, `demo-project`) with version history,
and needs no Google credentials. Nothing reaches Google Cloud, edits vanish on exit, and a
throwaway config is used unless `-config` is given. It's for trying the ui and developing skins.

### config file

Sources and the theme are saved to a YAML file, so they survive restarts. Because the port is
random, the page's origin changes on every launch, so browser storage can't hold them. The file
is created on first save, and hand edits and comments are kept when the ui writes to it.

- default location: `<user config dir>/berglas-ui/config.yaml`, which is
  `~/Library/Application Support/berglas-ui/config.yaml` on macOS and
  `%AppData%\berglas-ui\config.yaml` on Windows
- override: `-config <path>` or `BERGLAS_UI_CONFIG`

```yaml
listen: 127.0.0.1:0        # optional; -listen / BERGLAS_UI_LISTEN win
theme: Dracula
sources:
  - backend: storage       # cloud storage + kms (berglas://bucket/...)
    parent: my-bucket
  - backend: sm            # secret manager (sm://project/...)
    parent: my-project
```

### ui development

```bash
cd core && go run ./cmd/berglas-ui -api-only -listen 127.0.0.1:8740   # terminal 1
npm --prefix ui run dev        # terminal 2; proxies /api to $BERGLAS_UI_CORE or 127.0.0.1:8740
```

Open the printed link with the port changed to vite's (5173) so the cookie is set for that origin.

## editing

- **edit** opens the latest value. `.env` secrets get a key/value editor, where changing a value
  rewrites only that line and keeps comments, `export` prefixes and line endings. Any secret can be
  edited as raw text.
- **review changes** shows the diff from the loaded value to your draft. Nothing is written until
  you press **save** there.
- **conflicts:** the save carries the generation (storage) or version (secret manager) you
  loaded. If someone saved in between, the save is refused instead of overwriting their change.
  For `.env` secrets, **reapply my changes to latest** replays only the keys you changed onto the
  new version and shows the review again. Keys you both changed are flagged.
  - storage: the check is atomic (a Cloud Storage precondition).
  - secret manager: berglas has no precondition, so the core re-reads the latest version just
    before writing. The race window is small but not zero.
- **restore this version…** (on an old version) opens the editor with that version's value as a
  draft against the latest, and saves it as a new version.
- **diff:** in the versions table, pick `a` and `b`, then **diff a → b**.

## security model

The core serves secret values over plain HTTP on a local port, so:

- it binds to loopback only, and refuses other addresses unless `-allow-non-loopback` is passed
- requests with a non-localhost `Host` are rejected (DNS rebinding)
- every api call needs the per-launch token (cookie or `Authorization: Bearer`)
- cross-site requests are rejected via `Origin` and `Sec-Fetch-Site`
- responses are `Cache-Control: no-store`; values are never logged
- `?destination=` references are refused by `/api/resolve`, because berglas would write the
  secret to that file path

## api

| method | path | body / query |
|---|---|---|
| GET | `/api/status` | — |
| GET | `/api/secrets` | `backend, parent, prefix` |
| GET | `/api/secrets/versions` | `backend, parent, name` |
| POST | `/api/secrets/read` | `{backend, parent, name, version?}` |
| POST | `/api/secrets/create` | `{backend, parent, name, plaintext, kmsKey?, locations?}` |
| POST | `/api/secrets/update` | `{backend, parent, name, plaintext, expectedGeneration?, expectedMetageneration?, expectedVersion?, createIfMissing?}` |
| POST | `/api/secrets/delete` | `{backend, parent, name}` |
| POST | `/api/secrets/grant`, `/revoke` | `{backend, parent, name, members}` |
| POST | `/api/bootstrap` | `{projectId, bucket, ...}` |
| POST | `/api/resolve` | `{ref}` |

`backend` is `storage` or `sm`. `plaintext` is base64. Generations are JSON strings.
