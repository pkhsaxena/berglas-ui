# berglas-ui

An unofficial desktop and web UI for [berglas](https://github.com/GoogleCloudPlatform/berglas)
secrets, on both of its backends: Cloud Storage + KMS (`berglas://`) and Secret Manager (`sm://`).

> Not an official Google project, and not affiliated with or endorsed by Google.

<p>
  <img src="docs/screenshots/native-prod.png" alt="The native skin on demo data: a production secret under a red banner, with the service by environment matrix and the overview beside it" width="49%">
  <img src="docs/screenshots/terminal-drift.png" alt="The terminal skin on demo data: one service's keys compared across dev, staging and prod, with missing keys and a prod equals staging check" width="49%">
</p>

Both skins on demo data (`BERGLAS_UI_DEMO=1`): **native** on a production secret, **terminal**
comparing one service's keys across its environments. Also: a
[revealed `.env` secret](docs/screenshots/terminal-secret.png) and
[the ⌘K palette in Catppuccin Mocha](docs/screenshots/native-palette-mocha.png).

## why it's safe

- **values don't travel:** key drift compares fingerprints. The core decrypts and returns one
  HMAC per key, under a key made fresh each run, so no value reaches the ui. Reveal is a click,
  hides itself after a minute, and copies clear from the clipboard.
- **typed confirmation:** writes and deletes to protected names (`protect:` globs, e.g.
  `*-prod-*`) need a typed confirmation (the word `confirm` to save, also to a file; the name itself to delete); the core refuses them otherwise (`428`). Prod secrets sit
  under a red banner.
- **review before save:** every edit, create and restore shows the diff, with warnings for
  duplicate keys and empty values, and writes nothing until you save. If someone saved in
  between, your save is refused instead of overwriting theirs.
- **exports:** **save to file** asks first; the mac app writes the file mode 600.
- **audit log** (turn on with `auditLog:`): one JSON line per write or export (who, what, which
  version), never a value.
- **local only:** the core listens on 127.0.0.1 behind a per-launch token, Host and Origin
  checks. The mac app has no port at all.
- **mac app:** the window is left out of screenshots, recordings and screen sharing; it locks
  on demand or after idle (`lockAfterMinutes`), with Touch ID to unlock.

## features

- one window for buckets (Storage + KMS) and projects (Secret Manager), grouped by service and
  environment, with dev / staging / prod colors
- reveal, filter and copy `.env` keys; versions, diffs and restore
- edit key by key with a review step; create, delete, conflicts handled
- key drift across environments, a service × environment matrix and an overview
- pin a secret and compare others against it
- ⌘K command palette, favourites and recents, watch a secret for new versions
- `berglas-ui://` links, drop a file to use as a value, save to file
- two skins (terminal and native) and themes including the four Catppuccin flavours
- mac app: native menus, find in page, Touch ID lock, hidden from screen capture

Every feature, and how it is tested, is listed in
[`ui/src/skins/FEATURES.md`](ui/src/skins/FEATURES.md).

## quick start

Try it on made-up secrets first. Demo mode keeps everything in memory, needs no Google
credentials and never touches your config:

```bash
npm --prefix ui install && npm --prefix ui run build   # builds into core/webui/dist
cd core && go run ./cmd/berglas-ui -demo -open
```

Then on your own secrets:

```bash
gcloud auth application-default login
cd core && go run ./cmd/berglas-ui -open
```

and add a bucket or project under **sources**. Needs Go (see `core/go.mod`) and Node. For the
mac app, see [releases](#releases).

```
core/   Go: a localhost JSON api over the berglas library; embeds the built ui; the mac app (Wails)
ui/     React + Vite + TypeScript; talks only to the core's api (see ui/src/core/api.ts)
```

## releases

There are no published builds yet. Build the mac app yourself:

```bash
scripts/build-mac.sh            # → dist/berglas-ui.app; UNIVERSAL=1 for Apple silicon + Intel
open dist/berglas-ui.app
scripts/build-mac.sh --dmg      # also → dist/berglas-ui-<version>-<arch>.dmg, a drag-to-Applications disk image
```

It needs Xcode's command line tools, Go and Node. The build is **signed ad hoc and not
notarized**: it runs on the Mac that built it, and on any other Mac Gatekeeper warns or blocks
it. Handing it to others needs a Developer ID signature and notarization; until then, someone
opening it from the `.dmg` allows it once in System Settings → Privacy & Security → Open Anyway.
The browser version
is one Go binary with the ui embedded (`cd core && go build ./cmd/berglas-ui`, after building
the ui) and runs wherever Go does;
the desktop app is macOS only for now.

---

## features in detail

- **skins:** `terminal` (the default) and `native`, both with every feature. `skin:` in the
  config picks one; the header's **skin** picker saves the choice and reloads.
- **themes:** each skin has its own names, saved as `theme:`. terminal: Dracula, GitHub light,
  Gruvbox, Monokai, Nord, Solarized dark and light; native: System (follows the OS), Light, Dark.
  Both also have `Catppuccin Latte`, `Frappé`, `Macchiato` and `Mocha`, with Latte's accents
  darkened so every text colour reaches 4.5:1.
- **environment colors** (`core/envtone.ts`): a secret's environment comes from the `{env}`
  placeholder of the source's `group` pattern, or else a word in its name (`prod`, `production`
  → prod; `nonprod`, `staging`, `uat`, `qa` → staging; `dev`, `local`, `sandbox` → dev). List
  rows, badges and matrix columns are colored by it; a prod secret gets a red **production**
  banner (saying whether it is protected or read-only), the others a thin colored strip.
- **key drift** (`core/drift.ts`, core `drift.go`): the **drift** tab, or **compare keys** on a
  matrix row, compares one service's keys across its environments: which keys are missing where,
  which values match (a letter per distinct value), empty values, quote-only differences, and a
  check when prod has the same value as a non-prod environment while the others differ. It
  decrypts every environment of the service, so it runs only when you ask.
- **command palette** (`core/palette.ts`): ⌘K (Ctrl+K; in the mac app also Go → Go To…) jumps
  to any secret of the open source, or of another source seen this session, switches source, or
  runs an action (new, refresh, views, compare keys, find, zoom, theme, skin, time zone, act as,
  lock, settings).
- **settings screen** (`core/settingsModel.ts`): ⌘, (Ctrl+,; in the mac app also Go →
  Settings…) opens every setting of the config file in sections, with a search box. Most settings
  are saved the moment you change them. **Safety settings** (read-only, protected names, the lock,
  reveal and clipboard timers, screen capture, the audit log, and each source's read-only and
  protected names) are collected instead: a bar lists what would change, and **save safety
  settings…** then **confirm** writes all of them in one save. Until then the saved values stay in
  force, and closing with unsaved ones asks first. A safety change is also written to the audit
  log (to the old file too when the change moves or turns off the log).
- **favourites and recents:** ☆ on a secret stars it; favourites and the last five secrets you
  opened, from any source, sit above the list and lead ⌘K; the **recent** heading folds the list
  and × takes one off it. Saved in the config (names only).
- **watch:** **watch** on a secret, and the core checks it for new versions every
  `watchMinutes` (default 5). Changes you didn't make show under **changed** above the list
  until you open them, and the mac app posts a notification (macOS asks permission once).
- **links:** **copy link** on a secret gives `berglas-ui://open?backend=…&parent=…&name=…`, which
  opens the mac app at that secret. It holds no value and only navigates; a source you haven't
  added is asked about first.
- **drop a file** onto the window to use it as a value: replace the open secret's value (the
  editor opens with the file as the draft) or start a new secret named after the file. Nothing is
  written until the usual review and save.
- **save to file:** after a reveal, **save to file…** writes that version as plain text after a
  confirmation (and the word `confirm` typed for protected secrets). In the mac app the core asks where
  with a Save dialog, writes mode 600 and logs an `export` line (path, no value); in a browser it
  is a download.
- **dropdowns** are the app's own: each opens with a search box that keeps the options
  containing what you type; ↑↓ and Enter pick, Esc closes.

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

The core picks a free port on 127.0.0.1 and prints a link with a per-launch token. Opening it
pairs the browser via an HttpOnly cookie. Flags: `-listen` (default `127.0.0.1:0`, a random
port), `-open`, `-api-only`, `-allow-non-loopback` (containers only), `-demo`, `-config`.

**demo mode** (`-demo`, or `BERGLAS_UI_DEMO=1` for the mac app) serves made-up secrets from
memory (`demo-bucket`, grouped by `{service}-{env}-env`, and `demo-project`) with version
history. Nothing reaches Google Cloud, edits vanish on exit, and a throwaway config is used
unless `-config` (or `BERGLAS_UI_CONFIG`) is given. It's for trying the ui and developing skins.

### config file

Settings and sources live in a YAML file, so they survive restarts. Because the port is random,
the page's origin changes on every launch, so browser storage can't hold them. The file is
created on first save. Hand edits and top-level comments are kept when the ui writes to it, but
comments inside a `sources` entry are lost when you add or remove a source from the ui. Unknown
keys are an error, so a typo like `readonly` fails at startup instead of being silently ignored.

- default location: `~/.berglas-ui/config.yaml` (on Windows `%USERPROFILE%\.berglas-ui\config.yaml`)
- override: `-config <path>` or `BERGLAS_UI_CONFIG`
- the settings screen (⌘,) edits this same file; there is no second store. A save is one atomic
  write (owner-only, `0600`) and is all or nothing: one bad value and none of it is written.
- changes made in the settings screen apply at once, except `allowScreenCapture`, `listen` and
  `openBrowser`, which are read at startup. Hand edits to the file are also read at startup only.

```yaml
listen: 127.0.0.1:0          # -listen / BERGLAS_UI_LISTEN win; port 0 = a free port
openBrowser: true            # open the ui on startup (same as -open)
skin: terminal
theme: Dracula
zoom: 100                    # scale the whole ui, 50-200 percent (also the header's zoom menu)
timeZone: local              # times in the system zone, or utc (also a switch in the header)
envOrder: sorted             # .env views sorted by section and key, or file
readOnly: false              # refuse every write, everywhere
protect: ["*-prod-*"]        # writes/deletes to matching names need a typed confirmation
revealSeconds: 60            # hide revealed values and diffs after this; 0 = never
clipboardClearSeconds: 30    # clear copied values after this; 0 = never
cacheSeconds: 600            # keep secret/version lists (never values) for revisits; 0 = off
cacheEntries: 500            # at most this many cached lists, least recently used out first
auditLog: ~/.berglas-ui/audit.log   # one json line per write, export or safety settings change; empty = off
watchMinutes: 5              # how often watched secrets are checked
lockAfterMinutes: 15         # mac app: lock after this long without input; 0 = never
allowScreenCapture: false    # mac app: let screenshots and screen sharing see the window
credentials:                 # who the core acts as; switch between choices in the ui
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

The ui also keeps `favorites`, `recent` and `watch` here (source and name only).

| key | what it does | enforced by |
|---|---|---|
| `readOnly` (global or per source) | create, update, delete, grant, revoke and bootstrap answer `403 read_only`; the ui hides them | core |
| `protect` (global + per source) | `path.Match` globs; a matching name can only be written, deleted or saved to a file with its name in the `X-Berglas-Confirm` header (`428 confirm_required` otherwise). The ui asks you to type it | core |
| `kmsKey` (per storage source) | default key for new secrets; the ui prefills it and the core fills it in when a create omits it | core |
| `revealSeconds`, `clipboardClearSeconds` | auto-hide for values and diffs; clipboard clearing only happens if the clipboard still holds the copied value, and the browser has to allow the page to read it, otherwise you are told it was not cleared | ui |
| `zoom` | scales the whole ui. Zooming out gives the layout more room, the way browser zoom does: at 67% a 1440px window gets the wide layout (panes side by side) | ui |
| `cacheSeconds`, `cacheEntries` | lists of secrets and versions (names and times, never values) seen before show at once on a revisit while a fresh copy loads. Each expires `cacheSeconds` after it was fetched; at most `cacheEntries` are kept. Either at 0 turns the cache off | ui |
| `auditLog` | appends `{time, actor, action, backend, parent, name, version, path, result, error}` per write or export attempt (never values), file mode 0600. A change to a safety setting from the settings screen adds `{action: "settings change", changes: ["readOnly: false → true", …]}`, in the file in use before the change and, if the change moved the log, in the new one. If a line cannot be written, the write has still happened and the ui shows an error | core |
| `credentials` | every call is made as `impersonateServiceAccount` (your ADC identity needs `roles/iam.serviceAccountTokenCreator` on it), with quota billed to `quotaProject`; `choices` feeds the **act as** picker | core |
| `label`, `group`, `default` | display only; `group` also adds the service × env matrix and drift (click an env header to sort rows: newest first, oldest first, default) | ui |
| `timeZone`, `envOrder` | `local` / `utc`; `sorted` / `file` (the stored file is never reordered) | ui |
| `openBrowser`, `listen`, `allowScreenCapture` | startup only | core |

### mac app

The same ui and core in a native window (Wails v2, the system's WKWebView), so no browser and
no port: the web view hands requests to Go in-process. It reads the same
`~/.berglas-ui/config.yaml` and the same gcloud credentials, and finds them when started from
Finder. Building it: [releases](#releases).

- **clipboard and links:** a web view only lets a page touch the clipboard inside a click, so
  copies and the auto-clear go through the core (`/api/desktop/clipboard`); no route reads the
  clipboard back. `mailto:` and `http(s)` links open in your mail app or browser; other schemes
  are refused.
- **menus:** the standard app and Edit (⌘C ⌘V ⌘X ⌘A, undo) menus; Find (find ⌘F, next ⌘G,
  previous ⇧⌘G); Go (Go To… ⌘K; Settings… ⌘,; Lock ⇧⌘L); View (zoom in ⌘=, zoom out ⌘-, actual size ⌘0,
  reload ⌘R, full screen); Window.
- **lock:** Go → Lock, **Lock now** in ⌘K, or `lockAfterMinutes`. Unlocking asks for Touch ID
  (or the login password). An open editor keeps its draft under the lock.
- **hidden from screen capture** unless `allowScreenCapture: true` (read at startup).
- **links:** `Info.plist` registers the `berglas-ui://` scheme.
- **self-test (development):** `BERGLAS_UI_DEMO=1 BERGLAS_UI_SELFTEST=full` drives every
  testable feature inside the real window (both skins: `BERGLAS_UI_SKIN=native`), prints each
  step and then `SELFTEST [...]`, and quits. It writes secrets, so it only runs with the demo
  store, and it overwrites the clipboard. `BERGLAS_UI_SELFTEST=status` only checks that
  credentials are found; `layout` reports whether the page itself can scroll in the window.

### ui development

```bash
cd core && go run ./cmd/berglas-ui -api-only -listen 127.0.0.1:8740   # terminal 1
npm --prefix ui run dev        # terminal 2; proxies /api to $BERGLAS_UI_CORE or 127.0.0.1:8740
```

Open the printed link with the port changed to vite's (5173) so the cookie is set for that origin.

## changing the ui

The ui is split so the look can be replaced without touching behaviour:

```
ui/src/core/            no markup, no css: api client, .env parsing, diffing, time formatting
ui/src/core/hooks/      everything a screen needs: useApp (session, config, sources),
                        useSecretList, useSecret (versions, reveal, copy), and the edit/diff hooks
ui/src/skins/terminal/  the terminal-pane look: components, css and theme presets
ui/src/skins/native/    a Mac-style window: sidebar, segmented controls, light and dark themes
ui/src/skins/registry.ts  the skins this build has; main.tsx loads the one the config names
ui/src/skins/FEATURES.md  every ui feature a skin must offer, where it lives in core, how it is verified
```

To build a new look, add `ui/src/skins/<name>/` whose `index` exports an `App` built on the
hooks, and add it to `SKINS` in `registry.ts`. Work through
[`ui/src/skins/FEATURES.md`](ui/src/skins/FEATURES.md): a skin is done when it has every row.
Skins must not call `fetch` or parse values themselves; anything a second skin would also need
belongs in `core/`. Each skin is its own chunk, so only the chosen skin's code and css load.

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

### edit, review, conflicts

- **edit** opens the latest value. `.env` secrets get a key/value editor, where changing a value
  rewrites only that line and keeps comments, `export` prefixes and line endings. Any secret can be
  edited as raw text.
- **review changes** shows the diff from the loaded value to your draft, with warnings for keys
  set more than once and empty values. Nothing is written until you press **save** there.
- **conflicts:** the save carries the generation (storage) or version (secret manager) you
  loaded. If someone saved in between, the save is refused instead of overwriting their change.
  For `.env` secrets, **reapply my changes to latest** replays only the keys you changed onto the
  new version and shows the review again. Keys you both changed are flagged.
  - storage: the check is atomic (a Cloud Storage precondition).
  - secret manager: berglas has no precondition, so the core re-reads the latest version just
    before writing. The race window is small but not zero.
- **restore this version…** (on an old version) opens the editor with that version's value as a
  draft against the latest, and saves it as a new version.
- **new** (list pane) creates a secret after a review step. **delete…** needs the name typed
  and removes every version, history included.
  - storage: berglas finds generations by listing the name as a prefix, then deletes this name at
    each one. If another secret's name starts with this one (`api` and `api-key`), that fails
    partway, after some history is already gone. The core refuses such deletes up front. It only
    sees berglas secrets, so a non-secret object with the same prefix can still trip it.

### viewing and comparing

- **view tabs** (normal width): `<secret> · versions · overview · matrix · drift` sit in the
  title border of the right column's top pane. On **reveal** the value fills the right column and
  versions step aside until you pick that tab. Zoomed out, secret and versions stay side by side.
- **zoom:** the header's **zoom** menu (or ⌘= ⌘- ⌘0 in the mac app) scales the whole ui. The
  layout bands follow the ui's own width (`#root[data-width]`, set by `useLayoutWidth`), because
  css zoom never moves media queries and WebKit reads container queries at the unzoomed width.
- **filter a revealed value:** the box above a revealed or pinned `.env` value shows only keys or
  values containing what you type, under their section headings, with a count. Esc clears it.
- **find in page** (mac app, ⌘F): highlights every visible match, ⌘G / enter and ⇧⌘G / ⇧enter step
  through them, and it follows the page as it changes. Masked values are not text, so they are
  never found. In a browser, ⌘F stays the browser's.
- **diff:** in the versions table, pick `a` and `b`, then **diff a → b**.
- **pin:** **pin** keeps the shown version in its own pane while you open other secrets. Revealed
  first, its value comes along; pinned while hidden, it stays masked until you reveal it there. The pane
  appears once you open another secret and has the same details and buttons as a secret's pane
  (reveal / hide, copy value, save to file); a value shown there stays until you **hide** or
  **unpin** it (it does not hide on the reveal timer). With a pin:
  - **compare with pinned …** diffs the pinned value against the open secret's latest version.
    It works on a hidden pin too and shows only the diff; neither value is revealed.
    It reports "identical", or "same keys and values" when only comments, order or formatting
    differ.
  - revealing the open secret marks each key against the pin (`=`, `≈ quotes`, `≠ differs`,
    `+ only here`), with a one-line summary and the keys only the pinned secret has.
  - the editor marks every key `=`, `≠` (with **use pinned** to copy the pinned value) or
    `+ only here`, lists keys only the pinned secret has (with **add** or **add all**), and says
    when the draft matches the pinned secret exactly.
  - zoomed out, while a pin and a different secret are both open, the matrix/overview column
    steps aside so pinned, secret and versions share the width; overview and matrix move to tabs
    in the versions pane's title. Unpin to get the column back.
- **quotes:** values that differ only by one surrounding pair of quotes (`KEY="x"` vs `KEY=x`,
  which dotenv loaders read the same) are marked `≈ quotes only` in diffs and comparisons and
  `≈ quotes` in the editor beside a pin, instead of as changed. One-sided quotes or spaces outside
  the quotes still count as real changes.

## security model

The core serves secret values over plain HTTP on a local port, so:

- it binds to loopback only, and refuses other addresses unless `-allow-non-loopback` is passed
- requests with a non-localhost `Host` are rejected (DNS rebinding)
- every api call needs the per-launch token (cookie or `Authorization: Bearer`)
- cross-site requests are rejected via `Origin` and `Sec-Fetch-Site`
- responses are `Cache-Control: no-store`; values are never logged
- `?destination=` references are refused by `/api/resolve`, because berglas would write the
  secret to that file path

`readOnly` and `protect` guard against mistakes, not against the person at the keyboard: whoever
can use the app can change them in the settings screen (after a confirmation, and on record in
the audit log) or in the config file.

The mac app has no port, so it drops the loopback, token and origin checks (nothing outside
the app can send it requests) and keeps everything else, including read-only and protect.

## api

| method | path | body / query |
|---|---|---|
| GET | `/api/status` | — |
| GET, POST | `/api/config` | POST: any of `{skin, theme, zoom, timeZone, envOrder, sources, favorites, recent, recentCollapsed, watch, watchMinutes, readOnly, protect, lockAfterMinutes, revealSeconds, clipboardClearSeconds, allowScreenCapture, cacheSeconds, cacheEntries, auditLog, listen, openBrowser}`, saved in one write, all or nothing |
| POST | `/api/credentials` | `{impersonateServiceAccount, quotaProject}` |
| GET | `/api/secrets` | `backend, parent, prefix` |
| GET | `/api/secrets/versions` | `backend, parent, name` |
| POST | `/api/secrets/read` | `{backend, parent, name, version?}` |
| POST | `/api/secrets/drift` | `{backend, parent, names}` → per-key fingerprints, never values |
| POST | `/api/secrets/create` | `{backend, parent, name, plaintext, kmsKey?, locations?}` |
| POST | `/api/secrets/update` | `{backend, parent, name, plaintext, expectedGeneration?, expectedMetageneration?, expectedVersion?, createIfMissing?}` |
| POST | `/api/secrets/delete` | `{backend, parent, name}` |
| POST | `/api/secrets/grant`, `/revoke` | `{backend, parent, name, members}` |
| GET, POST | `/api/watch`, `/api/watch/ack`, `/api/watch/check` | changes to watched secrets; ack takes `{backend, parent, name}` |
| POST | `/api/bootstrap` | `{projectId, bucket, bucketLocation?, kmsLocation?, kmsKeyRing?, kmsCryptoKey?}` |
| POST | `/api/resolve` | `{ref}` |
| | `/api/desktop/…` | mac app only: `clipboard`, `clipboard/clear`, `open`, `save`, `authenticate` |

`backend` is `storage` or `sm`. `plaintext` is base64. Generations are JSON strings.
