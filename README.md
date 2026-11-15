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
ui/src/skins/terminal/  the terminal-pane look: components, css and theme presets
ui/src/skins/native/    a Mac-style window: sidebar, segmented controls, System / Light / Dark
                        themes, environments color-coded with a banner over production
ui/src/skins/registry.ts  the skins this build has; main.tsx loads the one the config names
ui/src/skins/FEATURES.md  every ui feature a skin must offer, where it lives in core, how it is verified
```

To build a new look, add `ui/src/skins/<name>/` whose `index` exports an `App` built on the
hooks, and add it to `SKINS` in `registry.ts`. Work through
[`ui/src/skins/FEATURES.md`](ui/src/skins/FEATURES.md): a skin is done when it has every row. Skins must not call `fetch` or parse values
themselves; anything a second skin would also need belongs in `core/`.

- `skin:` in the config picks the look; unset or unknown names load `terminal`. With more than
  one skin registered, the header shows a **skin** picker (`useApp().setSkin`), which saves the
  choice and reloads the page.
- each skin is its own chunk, so only the chosen skin's code and css load. Every build carries
  every registered skin, the web ui and the desktop app alike.
- `theme:` is an opaque name, so each skin decides which names it understands; switching skin
  may fall back to that skin's default theme. terminal: Dracula, GitHub light, … ; native:
  System (follows the OS), Light, Dark. Both skins also have the four Catppuccin flavours
  (`Catppuccin Latte`, `Catppuccin Frappé`, `Catppuccin Macchiato`, `Catppuccin Mocha`), with
  Latte's accents darkened so every text colour reaches 4.5:1.
- **skins available:** `terminal` (the default) and `native`. Both have every feature: sources,
  grouped list, reveal with filter, copy, pin and compare, edit with review and protect, create,
  delete, versions and diffs, overview and matrix, zoom and find.
- **environment colors** (`core/envtone.ts`): a secret's environment comes from the `{env}`
  placeholder of the source's `group` pattern, or else a word in its name (`prod`, `production`
  → prod; `nonprod`, `staging`, `uat`, `qa` → staging; `dev`, `local`, `sandbox` → dev). The native
  skin colors list dots, badges and matrix columns by it, and shows a red **Production** banner
  over a prod secret (saying whether it is protected or read-only) and a thin colored strip
  over the others.
- **dropdowns** are the app's own, not the system's: each opens with a search box that keeps the
  options containing what you type (any case); ↑↓ and Enter pick, Esc closes.
- **command palette** (`core/palette.ts`): ⌘K (Ctrl+K; in the mac app also Go → Go To…) jumps
  to any secret of the open source, or of another source seen this session, switches source, or
  runs an action (new, refresh, views, compare keys, find, zoom, theme, skin, time zone).
- **drop a file** onto the window to use it as a value: replace the open secret's value (the
  editor opens with the file as the draft) or start a new secret named after the file. Nothing is
  written until the usual review and Save.
- **save to file:** after a reveal, **save to file…** writes that version as plain text, after a
  confirmation (and the typed name for protected secrets). In the mac app the core asks where with
  a Save dialog, writes the file with mode 600 and logs an `export` line (path, no value) to the
  audit log; in a browser it is a download.
- **favourites and recents:** ☆ on a secret stars it; favourites and the last five secrets you
  opened, from any source, sit above the list and lead ⌘K. Saved in the config (names only).
- **watch:** **watch** on a secret, and the core checks it for new versions every `watchMinutes`
  (default 5). Changes you didn't make show under **changed** above the list until you open them,
  and the mac app posts a notification (macOS asks permission the first time).
- **links:** **copy link** on a secret gives `berglas-ui://open?backend=…&parent=…&name=…`, which
  opens the mac app at that secret. Safe to paste anywhere: it holds no value and only navigates.
- **key drift** (`core/drift.ts`, core `drift.go`): the **drift** tab, or **compare keys** on a
  matrix row, compares that service's keys across its environments: which keys are missing where,
  which values match (a letter per distinct value), empty values, quote-only differences, and a
  check when prod has the same value as a non-prod environment while the others differ. The core
  decrypts the secrets and returns only fingerprints (an HMAC under a key made fresh each run), so
  no value reaches the ui. It decrypts every environment of the service, so it runs only when
  you ask (**compare keys**).

## credentials

The core uses Google Application Default Credentials, so you act as yourself and Cloud IAM
decides what you can see. Once per machine:

```bash
gcloud auth application-default login
```

To work as a service account instead (impersonation; you need
`roles/iam.serviceAccountTokenCreator` on it), list the identities you switch between in the
config. An **act as** picker then appears on the account line (and in ⌘K), and the choice is saved:

```yaml
credentials:
  choices:
    - label: deployer
      impersonateServiceAccount: deployer@my-project.iam.gserviceaccount.com
    - label: reader, billed to ops
      impersonateServiceAccount: reader@my-project.iam.gserviceaccount.com
      quotaProject: ops-project
```

"you (your gcloud login)" is always offered. Switching drops cached lists and closes the open
secret. It can't switch to another Google user: ADC holds one login, so that takes
`gcloud auth application-default login` again.

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

Settings and sources live in a YAML file, so they survive restarts. Because the port is random,
the page's origin changes on every launch, so browser storage can't hold them. The file is
created on first save. Hand edits and top-level comments are kept when the ui writes to it, but
comments inside a `sources` entry are lost when you add or remove a source from the ui. Unknown
keys are an error, so a typo like `readonly` fails at startup instead of being silently ignored.

- default location: `~/.berglas-ui/config.yaml` (on Windows `%USERPROFILE%\.berglas-ui\config.yaml`)
- override: `-config <path>` or `BERGLAS_UI_CONFIG`

```yaml
listen: 127.0.0.1:0          # -listen / BERGLAS_UI_LISTEN win; port 0 = a free port
openBrowser: true            # open the ui on startup (same as -open)
skin: terminal
theme: Dracula
zoom: 100                    # scale the whole ui, 50-200 percent (also the header's zoom menu)
timeZone: local             # times in the system zone, or utc (also a switch in the header)
envOrder: sorted            # .env views sorted by section and key, or file (also a switch by env/raw)
readOnly: false              # refuse every write, everywhere
protect: ["*-prod-*"]        # writes/deletes to matching names need the name typed
revealSeconds: 60            # hide revealed values and diffs after this; 0 = never
clipboardClearSeconds: 30    # clear copied values after this; 0 = never
cacheSeconds: 600            # keep secret/version lists (never values) for revisits; 0 = off
cacheEntries: 500            # at most this many cached lists, least recently used out first
auditLog: ~/.berglas-ui/audit.log   # one json line per write; empty = off
credentials:                 # read at startup
  impersonateServiceAccount: reader@my-project.iam.gserviceaccount.com
  quotaProject: my-project
sources:
  - backend: storage         # cloud storage + kms (berglas://bucket/...)
    parent: my-bucket
    label: team secrets      # shown instead of the bucket name
    kmsKey: projects/my-project/locations/global/keyRings/berglas/cryptoKeys/berglas-key
    group: "{service}-{env}-env"   # group the list by {service}, label rows by {env}
    protect: ["root-*"]      # added to the global patterns, for this source only
    default: true            # open this source on startup
  - backend: sm              # secret manager (sm://project/...)
    parent: my-project
    readOnly: true
```

| key | what it does | enforced by |
|---|---|---|
| `readOnly` (global or per source) | create, update, delete, grant, revoke and bootstrap answer `403 read_only`; the ui hides them | core |
| `protect` (global + per source) | `path.Match` globs; a matching name can only be written or deleted with its name in the `X-Berglas-Confirm` header (`428 confirm_required` otherwise). The ui asks you to type it | core |
| `kmsKey` (per storage source) | default key for new secrets; the ui prefills it and the core fills it in when a create omits it | core |
| `revealSeconds`, `clipboardClearSeconds` | auto-hide for values and diffs; clipboard clearing only happens if the clipboard still holds the copied value, and the browser has to allow the page to read it, otherwise you are told it was not cleared | ui |
| `zoom` | scales the whole ui. Zooming out gives the layout more room, the way browser zoom does: at 67% a 1440px window gets the wide layout (panes side by side). The header's **zoom** menu and the mac app's View menu set it | ui |
| `cacheSeconds`, `cacheEntries` | lists of secrets and versions (names and times, never values) seen before show at once on a revisit while a fresh copy loads. Each expires `cacheSeconds` after it was fetched and is freed by a sweep even if never used again; at most `cacheEntries` are kept. Either at 0 turns the cache off | ui |
| `auditLog` | appends `{time, actor, action, backend, parent, name, version, result, error}` per write attempt (never values), file mode 0600. If a line cannot be written, the write has still happened and the ui shows an error | core |
| `credentials.impersonateServiceAccount` | every call is made as that service account; your ADC identity needs `roles/iam.serviceAccountTokenCreator` on it | core |
| `credentials.quotaProject` | api quota is billed to this project | core |
| `label`, `group`, `default` | display only; `group` also adds the service × env matrix (click an env header to sort rows: newest first, oldest first, default) | ui |
| `timeZone` | `local` (default) or `utc`; the header's time switch saves it | ui |
| `envOrder` | `sorted` (default) or `file`; how `.env` secrets are listed. The stored file is never reordered | ui |
| `openBrowser`, `listen` | startup only | core |

### mac app

```bash
scripts/build-mac.sh            # → dist/berglas-ui.app; UNIVERSAL=1 for Apple silicon + Intel
open dist/berglas-ui.app
```

The same ui and core in a native window (Wails v2, the system's WKWebView), so no browser and
no port: the web view hands requests to Go in-process. It reads the same
`~/.berglas-ui/config.yaml` and uses the same gcloud application-default credentials, and it
finds them when started from Finder. Needs Xcode's command line tools, Go and Node to build.

- **clipboard and links:** a web view only lets a page touch the clipboard inside a click, so
  copies and the clipboard auto-clear go through the core (`/api/desktop/clipboard`); there is
  no route that reads the clipboard back. `mailto:` and `http(s)` links open in your mail app
  or browser; other schemes are refused.
- **menus:** the standard app and Edit (⌘C ⌘V ⌘X ⌘A, undo) menus; Find (find ⌘F, next ⌘G,
  previous ⇧⌘G); Go (Go To… ⌘K, the command palette; Lock ⇧⌘L); View (zoom in ⌘=, zoom out ⌘-, actual size ⌘0, reload ⌘R, full screen); Window.
- **lock:** Go → Lock (⇧⌘L), **Lock now** in ⌘K, or `lockAfterMinutes: 15` in the config to lock
  after 15 minutes without input. Unlocking asks for Touch ID (or the login password). An open
  editor keeps its draft under the lock.
- **hidden from screen capture:** the window is left out of screenshots, screen recording and
  screen sharing. Set `allowScreenCapture: true` in the config to allow them (read at startup).
- **signing:** the build is signed ad hoc, which runs on the mac that built it. Handing it to
  others without Gatekeeper warnings needs a Developer ID signature and notarization.
- **self-test (development):** `BERGLAS_UI_DEMO=1 BERGLAS_UI_SELFTEST=full` drives the api,
  the copy button, the clipboard auto-clear and a mailto link inside the real window, prints
  `SELFTEST [...]` and quits. It writes secrets, so it only runs with the demo store, and it
  overwrites the clipboard. `BERGLAS_UI_SELFTEST=status` only checks that credentials are found;
  `layout` reports whether the page itself can scroll in the window.
- **demo mode never touches your config:** with `BERGLAS_UI_DEMO=1` and no `BERGLAS_UI_CONFIG`,
  the app uses a throwaway config (the demo sources, grouped by `{service}-{env}-env`), deleted
  when it quits; the full self-test's copy also protects `*-prod-env` and clears the clipboard
  after 3 s. `BERGLAS_UI_SKIN=native` (or `terminal`) picks the skin for that run.

### ui development

```bash
cd core && go run ./cmd/berglas-ui -api-only -listen 127.0.0.1:8740   # terminal 1
npm --prefix ui run dev        # terminal 2; proxies /api to $BERGLAS_UI_CORE or 127.0.0.1:8740
```

Open the printed link with the port changed to vite's (5173) so the cookie is set for that origin.

## editing

### sorted .env views

`.env` secrets are shown sorted (switch with **sorted · file order** next to env/raw):

- the file is read as blocks separated by blank lines; comment lines at the top of a block are
  that block's section header (`# Server` over `PORT`, `READ_TIMEOUT`, …)
- sections are listed A→Z by header, keys A→Z inside each (case-insensitive, `K2` before `K10`)
- keys in blocks without a header are listed first as "no section"; comment-only blocks (a file
  banner) are shown at the top; a comment between two keys stays with the key below it
- only the view is sorted: editing a value rewrites that key's own line, so the saved file keeps
  its order, comments and formatting. The raw tab always shows the file as stored
- **add key** can go into a section (inserted after that section's last key) or at the end of the
  file; keys added from a pin are appended at the end


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
- **view tabs** (normal width): `<secret> · versions · overview · matrix · drift` sit in the title border of
  the right column's top pane. **versions** (whenever a secret is open) shows just the versions pane. On
  **reveal** the value fills the right column and versions step aside until you pick that tab.
  Zoomed out, secret and versions stay side by side.
- **zoom:** the header's **zoom** menu (or ⌘= ⌘- ⌘0 in the mac app) scales the whole ui and saves
  it as `zoom:`. Zoomed out far enough, the layout switches to panes side by side. The layout
  bands follow the ui's own width (`#root[data-width]`, set by `useLayoutWidth`), because css zoom
  never moves media queries and WebKit reads container queries at the unzoomed width.
- **filter a revealed value:** the box above a revealed or pinned `.env` value shows only keys or
  values containing what you type, under their section headings, with a count. Esc clears it.
- **find in page** (mac app, ⌘F): highlights every visible match, ⌘G / enter and ⇧⌘G / ⇧enter step
  through them, and it follows the page as it changes. Masked values are not text, so they are
  never found. A match has to sit inside one piece of text. In a browser, ⌘F stays the browser's.
- **diff:** in the versions table, pick `a` and `b`, then **diff a → b**.
- **pin:** after **reveal**, **pin** keeps that value in its own pane while you open other secrets.
  It stays until **unpin** (it does not hide on the reveal timer). With a pin:
  - the open secret's pane does the comparing: **compare with pinned …** diffs the pinned value
    against its latest version and shows the result there. It reports "identical", or "same keys
    and values" when only comments, order or formatting differ.
  - revealing the open secret marks each key against the pin (`=`, `≈ quotes`, `≠ differs`,
    `+ only here`), with a one-line summary and the keys only the pinned secret has.
  - the editor marks every key `=` (same as pinned), `≠` (differs, with **use pinned** to copy
    the pinned value) or `+ only here`, lists keys only the pinned secret has (with **add** or
    **add all**), and says when the draft matches the pinned secret exactly.
  - zoomed out, while a pin and a different secret are both open, the matrix/overview column
    steps aside so pinned, secret and versions share the width. **overview** and **matrix** move to
    tabs in the versions pane's title (`versions · overview · matrix`); unpin to get the column back.
- **quotes:** values that differ only by one surrounding pair of quotes (`KEY="x"` vs `KEY=x`,
  which dotenv loaders read the same) are marked `≈ quotes only` in diffs and comparisons and
  `≈ quotes` in the editor beside a pin, instead of as changed. When quoting is the only difference
  you get "same keys and values — only quoting differs". One-sided quotes or spaces outside the
  quotes still count as real changes.
- **new** (list pane) creates a secret after a review step. **delete…** needs the name typed
  and removes every version, history included.
  - storage: berglas finds generations by listing the name as a prefix, then deletes this name at
    each one. If another secret's name starts with this one (`api` and `api-key`), that fails
    partway, after some history is already gone. The core refuses such deletes up front. It only
    sees berglas secrets, so a non-secret object with the same prefix can still trip it.

## security model

The core serves secret values over plain HTTP on a local port, so:

- it binds to loopback only, and refuses other addresses unless `-allow-non-loopback` is passed
- requests with a non-localhost `Host` are rejected (DNS rebinding)
- every api call needs the per-launch token (cookie or `Authorization: Bearer`)
- cross-site requests are rejected via `Origin` and `Sec-Fetch-Site`
- responses are `Cache-Control: no-store`; values are never logged
- `?destination=` references are refused by `/api/resolve`, because berglas would write the
  secret to that file path

The mac app has no port, so it drops the loopback, token and origin checks (nothing outside
the app can send it requests) and keeps everything else, including read-only and protect.

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
