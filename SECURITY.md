# Security

berglas-ui shows and changes secrets, so security reports are welcome and taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub instead:
**Security → [Report a vulnerability](https://github.com/pkhsaxena/berglas-ui/security/advisories/new)**.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get
an answer within a week. Once a fix is out, the advisory is published with credit to you,
unless you'd rather stay anonymous.

Never include real secret values in a report. The app's demo mode (`-demo`, or
`BERGLAS_UI_DEMO=1` for the mac app) has made-up secrets to reproduce with.

## Supported versions

There are no releases yet. Fixes go to `main`; build from the latest `main`.

## What's in scope

- The core (`core/`): the local API, its token, Host and Origin checks, and anything that could
  let another site, process or user read or change secrets through it
- The UI (`ui/`): anything that leaks a value it shouldn't show, such as drift, logs, the
  clipboard or exported files
- The mac app: the window's screen-capture exclusion, the lock and Touch ID unlock, and
  `berglas-ui://` links

Out of scope: berglas itself and Google Cloud (report those to
[berglas](https://github.com/GoogleCloudPlatform/berglas/security) and
[Google](https://bughunters.google.com/)), and anything that needs the user's own Google
credentials or an unlocked session at their keyboard.

## How the app protects secrets

### In both versions

- **Your own access only**: it uses your Google credentials, so it sees exactly what your
  account can see.
- **Values stay hidden**: values show only when you click Reveal, and hide again on a timer.
  Copies are wiped from the clipboard after 30 seconds, unless you've copied something else
  since. Drift compares keyed fingerprints, never values.
- **Nothing is logged**: values are never logged, and every response is marked not to be
  cached. The optional audit log records what changed and when, never a value.
- **Guard rails**: every save shows a review first, protected names need `confirm` typed, and
  sources can be read-only. These guard against mistakes, not against the person at the
  keyboard.

### The mac app

- **No port at all**: the window and the core run in one process. The web view hands each
  request straight to the core in memory, so no other app, user or website on the machine can
  send it one. That's why it needs no token.
- **A locked-down window**: the page loads only the app's own built-in files, and its content
  security policy lets it talk to nothing else. The web inspector and the right-click menu are
  left out of the build.
- **Links leave the app**: web and email links open in your browser or mail app (only
  `http`, `https` and `mailto`). The window itself never navigates away.
- **`berglas-ui://` links only navigate**: each link is checked, then opens the secret it
  names. It can never reveal a value, save or change a setting. A link to a source you
  haven't added asks you first.
- **Hidden from screen capture**: the window doesn't appear in screenshots, recordings or
  screen sharing, unless you turn on `allowScreenCapture` (a safety setting, confirmed first).
- **Lock**: lock the app with ⌘L, or have it lock itself after a while without input. Unlocking
  asks for Touch ID or your login password. A half-finished edit is kept.
- **Private copies**: each copy is marked concealed and transient, so clipboard managers that
  follow the shared convention leave it out of their history. It also stays on this Mac, out
  of Universal Clipboard, unless you turn on `allowUniversalClipboard` (a safety setting, off
  by default). Copies go through the core, so the auto-clear works even when the window isn't
  focused, and the page can't read the clipboard back.
- **Save to file**: you pick the place in the system Save dialog. The core reads the value
  itself, writes it readable by you only (mode 600), and records the export, with its path, in
  the audit log. Protected secrets need `confirm` typed.
- **Private files**: the settings file and the audit log are readable by you only.
- **Notifications** for watched secrets name the secret and its new version, never its value.

Known limits:

- Leaving a copy out of a clipboard history is up to each clipboard manager. One that ignores
  the convention can still record it until it's wiped.
- The build is signed ad hoc and not notarized.
- The app isn't sandboxed. It runs with your user's permissions, like the `gcloud` it borrows
  credentials from.

### The browser version

- **Local only**: the core listens on 127.0.0.1 behind a per-launch token, which reaches your
  browser through the link it prints. It rejects requests for other host names (DNS
  rebinding) and requests from other sites.
- **No lock to unlock**: there is nobody to ask for Touch ID, so the lock only hides the screen.
  Screen capture can't be blocked either.
- **Clipboard**: the browser may refuse to let the page check the clipboard. Then a copy can't
  be wiped, and the app tells you.

The full details are in the reference's [security model](docs/REFERENCE.md#security-model).
