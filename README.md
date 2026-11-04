# berglas-ui

A local UI for [berglas](https://github.com/GoogleCloudPlatform/berglas) secrets, on both
backends: Cloud Storage + KMS (`berglas://`) and Secret Manager (`sm://`).

```
core/   Go: a localhost JSON api over the berglas library; embeds the built ui
ui/     React + Vite + TypeScript; talks only to the core's api (see ui/src/api.ts)
```

The ui has a terminal-pane look.

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

The core prints a link with a per-launch token. Opening it pairs the browser via an HttpOnly
cookie. Flags: `-listen` (default `127.0.0.1:8740`), `-open`, `-api-only`,
`-allow-non-loopback` (containers only).

### ui development

```bash
cd core && go run ./cmd/berglas-ui -api-only    # terminal 1
npm --prefix ui run dev                          # terminal 2, proxies /api to the core
```

Open the printed link with the port changed to vite's (5173) so the cookie is set for that origin.

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
