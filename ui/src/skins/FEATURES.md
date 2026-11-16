# UI features — the skin checklist

Every skin must offer everything on this list. A skin is only markup and styles over the hooks
in `ui/src/core`, so the **Core** column says where each behaviour lives: a new skin wires it up,
it doesn't reimplement it.

**Keep this file current.** Add or change a row in the same commit that adds or changes a
feature, and apply UI fixes to every skin listed in `registry.ts` (today: `terminal`, `native`).

**Verified by**
- **app** = the in-window self-test (`BERGLAS_UI_DEMO=1 BERGLAS_UI_SELFTEST=full`, see the README's
  mac app section). It runs on any skin: `BERGLAS_UI_SKIN=native`. The check's name is quoted.
- **unit** = vitest in `ui/src` or go test in `core/`; the file or test is named.
- **manual** = not automated. What is left: session states (the mac app never shows "not
  paired"; the others need the core down or credentials missing), config save errors, the credit
  line's rotation, how themes look, and the menu keyboard shortcuts (native keypresses the page
  never sees). Check these by hand in each skin.

Status for every row: ✅ terminal · ✅ native, unless the row says otherwise.

## Session and window

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Session states | Loading; "not paired" (open the printed link); core offline with Retry; no Google credentials with the `gcloud auth application-default login` hint and Retry | `useApp` | manual |
| Account line | Account, impersonation, project and quota project; a demo badge in demo mode | `useApp` (`/api/status`) | app "account line shows demo mode" |
| Act as | With `credentials.choices` in the config, an **act as** picker on the account line (not among the header controls): your gcloud login, each choice, and the one in use; switching saves it, swaps the core's identity live, drops cached lists, closes the open secret and reloads the list; also in ⌘K ("Act as …") | `useApp.setIdentity`, `identity.ts`; core `POST /api/credentials` | app "act as: switch to a configured service account and back; status follows"; go `TestCredentialsSwitchIdentity`; unit `identity.test.ts` |
| No spell check | No spell check, autocorrect, capitalisation or macOS word suggestions in any field (`<html>` attributes, and each field stamped as it appears) | `textassist.ts`, `index.html` | app "command palette: …" checks the attributes on the ⌘K box |
| Dropdowns | Every picker (time, zoom, theme, skin, act as, drift service, add-source backend, new key's section) is the skins' own dropdown, not the platform's: a button opens a popup with a search box; typing keeps options whose name contains the text (any case); ↑↓, Enter picks, Esc or a click outside closes; the popup floats over the page (fixed, zoom-corrected) so pane titles and tables never clip it, and closes if the page scrolls under it | `useCombo` (`filterOptions`), skin `Select.tsx` | app "dropdown: substring search, arrow keys, enter picks, esc closes"; unit `useCombo.test.ts` |
| Header controls | In this order and with these names in every skin: **time, zoom, theme, skin** | skin `App.tsx` | app "header controls: time, zoom, theme, skin" |
| Time zone | Local or UTC for every timestamp, saved to the config | `useApp.setTimeZone`, `useStamp` | unit `time.test.ts` |
| Skin picker | Shown with two or more skins; saves `skin:` and reloads | `useApp.setSkin`, `registry.ts` | unit `registry.test.ts`, go `TestSkinRoundTrips` |
| Theme | Each skin's own names (terminal presets; native System / Light / Dark), plus Catppuccin Latte, Frappé, Macchiato and Mocha in both skins (text colours at 4.5:1; the production banner keeps white text at 4.5:1 or more), labelled "theme" in every skin, saved as `theme:` | `useApp.setTheme` + the skin's `theme.ts` | app "theme picker applies and saves the theme" (that it looks right stays manual) |
| Zoom | 50–200 % picker in the header; mac app View menu ⌘= ⌘- ⌘0; saved as `zoom:` | `zoom.ts`, `useApp.setZoom`, `commands.ts` | app "zoom out reaches 60% and switches to the wide layout", "actual size resets zoom"; unit `zoom.test.ts`; go `TestZoomIsSavedAndBounded` |
| Layout bands | narrow (page scrolls inside the layout), normal, wide (panes side by side) from `#root[data-width]` | `useLayoutWidth` | app layout self-test (`BERGLAS_UI_SELFTEST=layout`); unit `useLayoutWidth.test.ts` |
| Page never scrolls or bounces | Only panes scroll | skin css | app layout self-test |
| Toasts | Saved, created, deleted, copied (with clear time), pinned | skin | app "toasts after save, create, delete and pin" |
| Audit-log error banner | A write succeeded but its audit line failed; dismissable | `onAuditError` (`api.ts`) | go `TestAuditFailureIsReported` (core side only) |
| Credit line | Name with mailto link; rotates every 20 s; reduced motion keeps one line | skin | manual |
| Command palette | ⌘K (or Ctrl+K; mac app Go → Go To…) opens one box: the open source's secrets, secrets of other sources seen this session, sources, and actions (new, refresh, overview / matrix / drift, compare keys of a service, find, zoom, theme, skin, time zone; the current theme, skin and time zone are left out); fuzzy match; ↑↓, Enter, Esc | `palette.ts`, `usePalette` | app "command palette: ⌘K and the Go menu open it; jump to a secret, run an action, esc closes"; unit `palette.test.ts` |
| Find in page (mac app) | ⌘F bar; every visible match highlighted; Enter / ⇧Enter, ⌘G / ⇧⌘G; Esc closes; follows page changes; matches across keys split at `_`; letter-sized marks inside buttons | `find.ts`, `useFind` | app "find bar opens and takes focus", "find counts and paints matches", "find matches a key split at \"_\"", "matches in buttons get letter-sized marks", "a longer query repaints only its own matches", "find stays still while idle", "esc closes find and clears paint"; unit `find.test.ts` |

## Sources

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| List sources | Buckets (Storage + KMS) and projects (Secret Manager); label, read-only and default markers | `useApp.sources` | app "sources list both demo sources" |
| Pick a source | Switches the list; closes the open secret | `useApp.setActive` | app "pick a source switches the list" |
| Add a source | Backend picker + bucket / project id; validation errors inline; saved to the config | `useApp.addSource` | app "add a source: bad names refused, a good one added and opened" |
| Remove a source | Removes it from the list only (deletes nothing) | `useApp.removeSource` | app "remove a source" |
| Config path and save errors | Where the config lives; an error if it couldn't be written | `useApp.configPath`, `configError` | app "config path is shown"; save errors manual |

## Secret list

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| List secrets | Names, version, time since change; "listing…", empty and error states | `useSecretList` | app "ui rendered", "GET /api/secrets (query string)" |
| Filter | Filter box; `/` focuses it | `useSecretList.filter` | app "filter narrows the list, / focuses it" |
| Grouping | Rows grouped by the source's `group` pattern (`{service}-{env}-env`), others under "other" | `group.ts` | unit `group.test.ts` |
| Environment colors | dev / staging / prod tone per secret in the list, matrix column headers and pane titles (native: dots and badges; terminal: names and `[prod]` tags in the theme's error / string / function colors) | `envtone.ts` | app "environment colors on list rows", "create a secret (its environment shows)", "view tabs, matrix colors, sort and open from a cell"; unit `envtone.test.ts` |
| Favourites and recents | ☆ in a secret's header stars it; **Favourites** and **Recent** (the last five opened, from any source) sit above the list while no filter is typed, and lead ⌘K; a row from another source switches to it; the **Recent** heading folds the list (saved as `recentCollapsed:`) and × on a recent row takes it off the list; saved as `favorites:` / `recent:` (names only) | `useApp.toggleFavorite`, `noteRecent`, `refs.ts`, skin `QuickList` | app "favourites and recents: star, list sections, ⌘K order, saved", "recent list: remove an entry, fold and unfold, both saved"; unit `refs.test.ts`, `palette.test.ts`; go `TestFavoritesRecentWatchRoundTrip` |
| Watch | **Watch** in a secret's header; the core checks watched secrets every `watchMinutes` (5) and keeps versions it didn't write; they show under **Changed** above the list (with a message) until opened; the mac app also posts a system notification (permission asked the first time); ⌘K "Check watched secrets now"; your own saves never count | `useWatch`; core `watch.go` (`/api/watch`, `/ack`, `/check`) | app "watch: someone else's write is reported and notified; opening clears it" (the notification is recorded, not shown); go `TestWatcherReportsOtherWritesNotOwn` |
| Refresh and New | Reload the list; start a new secret (hidden on read-only sources) | `useSecretList.refresh`, `readOnlyFor` | app "refresh keeps the list; new opens the create pane" |
| Instant revisits | Lists seen before show at once while a fresh copy loads; `cacheSeconds` / `cacheEntries` | `cache.ts` | unit `cache.test.ts` |

## A secret

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Details | Generation / version (latest or older), updated, KMS key, replication (Secret Manager), location | `useSecret` | app "secret details: generation, updated, kms key, location" |
| Production banner | A red banner over prod secrets and their editor, saying protected / read-only / changes reach production; a thin colored strip or rule for staging and dev; prod edit and save buttons in red ("edit production…", "save to production") | `envtone.ts`, `protectedFor`, `readOnlyFor` | app "production banner on a protected prod secret; a strip on dev" |
| Reveal and hide | Reveal decrypts; auto-hides after `revealSeconds`; Esc hides | `useSecret.reveal`, `scheduleHide` | app "copy button found after reveal"; go `TestFastReadMatchesBerglas` (opt-in, real bucket) |
| Fast reveal | Storage secrets prefetch the encrypted object when versions load, so reveal waits only for KMS | core `fastread.go`; `useSecret.latestId` | go `TestReadUsesThePrefetchedObject` and the other fastread tests |
| Key table | `.env` values as Keys / Raw; Sorted (sections, keys A→Z) or File order, saved as `envOrder:`; binary values get a notice | `envfile.ts`, `envsort.ts`, `useSettingsActions` | unit `envfile.test.ts`, `envsort.test.ts` |
| Filter revealed keys | Box above the table; matches keys or values; "2 of 8 keys"; Esc clears without hiding | `envfilter.ts` | app "filter shows only matching keys", "filter box shown with a revealed value"; unit `envfilter.test.ts` |
| Copy | Copy one key's value or the whole value; clipboard clears after `clipboardClearSeconds` if unchanged | `clipboard.ts`, `useSecret.copy` | app "copy puts the value on the mac clipboard", "clipboard auto-clears after clipboardClearSeconds"; unit `clipboard.test.ts` |
| View an older version | Pick a version to look at it | `useSecret.selectVersion` | app "view an older version: marked old, restore offered" |
| Read-only and protected | Read-only hides every write; protected names need the name typed to save or delete | `readOnlyFor`, `protectedFor` | app "protected write without confirm → 428", "protected write with X-Berglas-Confirm → 200"; go `TestReadOnlyRefusesWrites`, `TestProtectedNamesNeedTypedConfirmation`; unit `settings.test.ts` |

## Versions

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Version list | Newest first; latest marked; the shown one marked; "only the live generation exists" note when versioning is off | `useSecret.versions` | app "version list: three versions, newest first" |
| Diff two versions | a / b pickers, Diff a → b; Keys / Lines views; added, removed, changed, quotes-only; show unchanged | `useVersionDiff`, `diff.ts` | unit `diff.test.ts` |
| Diff replaces the table | While a diff is open the table and pickers hide; **hide diff** in the pane header (beside the view tabs), Esc or the reveal timer brings the table back | `useVersionDiff.clear` | app "a version diff replaces the table; hide diff brings it back" |

## Pin and compare

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Pin | Pin keeps the shown version in its own pane until Unpin. Revealed first, the value comes along; pinned while hidden, the pane stays masked until its own Reveal. The pin names its exact version. The pane shows once another secret is open (never a second pane for the open secret) and has the secret pane's fields (version, updated, KMS key, replication, location) and actions (Reveal / Hide, Copy value, Save to file…, Unpin) | `usePinned` | app "pin keeps the value; marks and compare against it", "pin without revealing; compare shows only the diff; pinned pane like a secret pane" |
| Key marks | The open secret's keys marked `=` same, `≠` differs, `≈` quotes only, `+` only here; "only in pinned" list; a one-line summary | `diff.ts` `matchAgainst` | unit `diff.test.ts` |
| Compare with pinned | Button in the open secret's pane; diff of pinned (a) against this secret's latest (b). Works on a hidden pin too; only the diff is shown, both values stay hidden | `useCompare` | app "pin keeps the value; marks and compare against it", "pin without revealing; compare shows only the diff; pinned pane like a secret pane" |
| Comparing layout | Wide: the matrix / overview column steps aside; Versions · Overview · Matrix tabs move into the versions column | skin layout | app "comparing layout: the side column steps aside when zoomed out" |

## Edit, create, delete

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Edit | Keys or Raw mode; edit a value (rewrites only its line); remove a key; add a key into a chosen section | `useEditor` | app "edit: change a value, remove a key, add a key into a section, save" |
| Edit against a pin | Per-key marks with **Use pinned**; "only in pinned" with Add / Add all; "matches pinned exactly" | `useEditor.edits`, `matchAgainst` | app "edit against the pin: use pinned, add all, typed name, save" |
| Review before save | Diff of the change; warnings for keys set more than once and empty values (marked when the current version already had them; they never block); overlap warning if someone else changed the same keys; typed name for protected secrets; nothing is written before Save | `useEditor.review`, `save`, `envlint.ts` | app "review warns about duplicate keys and empty values (nothing saved)", "POST update, 300 KB body round trip"; unit `envlint.test.ts` |
| Conflict | A newer version saved meanwhile: not saved; Reapply my changes, Start over, Cancel | `useEditor` (409 `modified`) | app "conflict: a newer save meanwhile is refused, not overwritten"; unit `memory_test.go` `TestMemoryStorageUpdateChecksGeneration` |
| Restore a version | On an older version, Restore opens the editor with it as a draft against the latest | `useEditor.start(restore)` | app "restore a version opens the editor over the latest" |
| Create | Name, KMS key (prefilled from the source's `kmsKey`), value; review; typed name if protected | `useCreate`, `kmsKeyFor` | app "create a secret (its environment shows)"; go `TestCreateUsesSourceKMSKey` |
| Drop a file | Dragging a file over the window shows a drop hint; dropping one opens a dialog: **Replace the value of <open secret>…** (the editor opens with the file as the draft, "replacing … with the dropped file") or **New secret in <source>…** (name from the file name, value prefilled); read-only sources offer neither; one UTF-8 text file up to 1 MB; binary and empty files are refused; nothing is written before the usual review and Save | `useFileDrop`, `useEditor.start(…, file)`, `useCreate(…, initial)` | app "drop a file: replace the open value, or start a new secret; binary refused; nothing saved"; unit `useFileDrop.test.ts` |
| Save to file | After a reveal, **Save to file…** asks first (the confirmation opens above the value, so a long key list never hides it) (plain text on disk; typed name for protected secrets), then: mac app, a native Save dialog, the core writes that exact version with mode 600 and adds an `export` line (with the path, never the value) to the audit log; browser, a download | `useExport`, `exportfile.ts`; core `POST /api/desktop/save` | app "save to file: confirmation first, mode 600, protected needs the name typed"; go `TestDesktopSaveWritesPrivateFileAndAudits`; unit `exportfile.test.ts` |
| Delete | Type the name to confirm; deletes every version; refused when the name is a prefix of another secret | `useDelete` | app "delete needs the name typed", "POST delete"; go `TestMemoryDeleteRefusesPrefixOfAnotherSecret` |

## Overview and matrix

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Overview | Count, changed in 7 / 30 days, latest change, stale (180 d+), KMS keys, recently changed, untouched longest; each name opens its secret | `overview.ts` | unit `overview.test.ts` |
| Matrix | Group-pattern grid (service × env), time since change per cell, `–` for missing; a cell opens its secret | `overview.ts` `matrixOf` | app "view tabs, matrix colors, sort and open from a cell"; unit `overview.test.ts` |
| Matrix sort | Click an environment: newest first, oldest first, default | `sortMatrixRows` | app "view tabs, matrix colors, sort and open from a cell"; unit `overview.test.ts` |
| Key drift | A **Drift** tab (zoomed out, where the view tabs are hidden, a **Drift** toggle in the side column's matrix header, pressed while the drift view is open; or a matrix row's **Compare keys** link; service names themselves are plain text) compares one service's keys across its environments: keys × envs, a letter per distinct value (same letter = same value), **missing**, ∅ empty, ≈ quotes only; counts; All keys / Differences; a **Check** column, shown only when a row in view has a prod warning (prod has the same value as a non-prod environment while the others differ, or is empty); the service picker and Compare sit on their own line at the top of the pane in both skins; a column header opens that secret. The core sends fingerprints (an HMAC under a per-run key), never values | `drift.ts`, `useDrift`; core `drift.go` (`POST /api/secrets/drift`) | app "drift: a matrix service compares its keys, values never shown", "drift zoomed out: the side matrix has a Drift toggle (the view tabs are hidden)"; unit `drift.test.ts`; go `TestDriftComparesKeysWithoutValues` |
| View tabs | Normal width: Secret · Versions · Overview · Matrix · Drift in the top pane's header; wide: overview and matrix get their own column and the matrix header's Drift toggle replaces the Drift tab | skin `App.tsx` | app "view tabs, matrix colors, sort and open from a cell" |

## Mac app only

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| No browser, no port | The ui in a native window; requests go to Go in-process | core `DesktopHandler` | app "page origin", "GET /api/desktop"; go `TestDesktopNeedsNoTokenButKeepsPolicy` |
| Clipboard through Go | Copy and auto-clear work outside a click | `desktop.ts`, `/api/desktop/clipboard` | app clipboard checks; go `TestDesktopClipboardClearsOnlyItsOwnValue` |
| Links open outside | mailto and http(s) go to the mail app or browser; other schemes refused | `desktop.ts`, `/api/desktop/open` | app "mailto link handed to the system, app stays"; go `TestDesktopOpenAllowsOnlyWebAndMail`; unit `desktop.test.ts` |
| Lock | **Lock now** in ⌘K, Go → Lock (⇧⌘L), or `lockAfterMinutes` without input: a lock screen covers the window (the page keeps its state, so drafts survive); **Unlock with Touch ID…** (never disabled, so it keeps its look while the prompt is up; extra clicks are ignored) asks for Touch ID or the login password through macOS LocalAuthentication; in a browser it only hides the screen | `useLock`, `desktop.ts`; core `POST /api/desktop/authenticate`, `touchid_darwin.go` | app "lock: hides the window, unlock asks for touch id" (the prompt itself is stubbed; answering it is manual); go `TestDesktopAuthenticate`, `TestCanAuthenticateAnswers` |
| Hidden from screen capture | The mac app's window is left out of screenshots, recordings and screen sharing (NSWindowSharingNone) unless `allowScreenCapture: true` | `main.go` `ContentProtection` | manual (the window server reports the window as not shared; seeing a capture blanked needs Screen Recording permission) |
| Deep links | `berglas-ui://open?backend=…&parent=…&name=…` opens the app at that secret (Info.plist registers the scheme); **Copy link** in a secret's header; a source you haven't added is asked about before it is saved; bad links are ignored; links never reveal or change anything | `commands.ts` `onOpenLink`, `deeplink.ts`; `links.go`, `main.go` `OnUrlOpen` | app "deep links: open a secret, ask before adding a source, ignore bad links, copy link"; go `TestParseLink`, `TestLinkJSEscapes`; unit `deeplink.test.ts`; a real link through macOS checked by hand |
| Menus | App, Edit (copy/paste in fields), Find (⌘F ⌘G ⇧⌘G), Go (Go To… ⌘K, Lock ⇧⌘L), View (zoom, reload, full screen), Window | `main.go` `appMenu`, `commands.ts` | manual (shortcuts pressed by hand) |
