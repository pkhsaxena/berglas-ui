# UI features — the skin checklist

Every skin must offer everything on this list. A skin is only markup and styles over the hooks
in `ui/src/core`, so the **Core** column says where each behaviour lives: a new skin wires it up,
it doesn't reimplement it.

**Keep this file current.** Add or change a row in the same commit that adds or changes a
feature, and apply UI fixes to every skin listed in `registry.ts` (today: `terminal`, `native`).

**Verified by**
- **app** = the in-window self-test (`BERGLAS_UI_DEMO=1 BERGLAS_UI_SELFTEST=full`, see the README's
  mac app section). It runs on any skin: set `skin:` in its config. The check's name is quoted.
- **unit** = vitest in `ui/src` or go test in `core/`; the file or test is named.
- **manual** = not automated yet. Check it by hand in each skin before calling a change done.
  These rows are where self-test coverage should grow next.

Status for every row: ✅ terminal · ✅ native, unless the row says otherwise.

## Session and window

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Session states | Loading; "not paired" (open the printed link); core offline with Retry; no Google credentials with the `gcloud auth application-default login` hint and Retry | `useApp` | manual |
| Account line | Account, impersonation, project and quota project; a demo badge in demo mode | `useApp` (`/api/status`) | manual |
| Time zone | Local or UTC for every timestamp, saved to the config | `useApp.setTimeZone`, `useStamp` | unit `time.test.ts` |
| Skin picker | Shown with two or more skins; saves `skin:` and reloads | `useApp.setSkin`, `registry.ts` | unit `registry.test.ts`, go `TestSkinRoundTrips` |
| Theme | Each skin's own names (terminal presets; native System / Light / Dark), saved as `theme:` | `useApp.setTheme` + the skin's `theme.ts` | manual |
| Zoom | 50–200 % picker in the header; mac app View menu ⌘= ⌘- ⌘0; saved as `zoom:` | `zoom.ts`, `useApp.setZoom`, `commands.ts` | app "zoom out reaches 60% and switches to the wide layout", "actual size resets zoom"; unit `zoom.test.ts`; go `TestZoomIsSavedAndBounded` |
| Layout bands | narrow (page scrolls inside the layout), normal, wide (panes side by side) from `#root[data-width]` | `useLayoutWidth` | app layout self-test (`BERGLAS_UI_SELFTEST=layout`); unit `useLayoutWidth.test.ts` |
| Page never scrolls or bounces | Only panes scroll | skin css | app layout self-test |
| Toasts | Saved, created, deleted, copied (with clear time), pinned | skin | manual |
| Audit-log error banner | A write succeeded but its audit line failed; dismissable | `onAuditError` (`api.ts`) | go `TestAuditFailureIsReported` (core side only) |
| Credit line | Name with mailto link; rotates every 20 s; reduced motion keeps one line | skin | manual |
| Find in page (mac app) | ⌘F bar; every visible match highlighted; Enter / ⇧Enter, ⌘G / ⇧⌘G; Esc closes; follows page changes; matches across keys split at `_`; letter-sized marks inside buttons | `find.ts`, `useFind` | app "find bar opens and takes focus", "find counts and paints matches", "find matches a key split at \"_\"", "matches in buttons get letter-sized marks", "a longer query repaints only its own matches", "find stays still while idle", "esc closes find and clears paint"; unit `find.test.ts` |

## Sources

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| List sources | Buckets (Storage + KMS) and projects (Secret Manager); label, read-only and default markers | `useApp.sources` | manual |
| Pick a source | Switches the list; closes the open secret | `useApp.setActive` | manual |
| Add a source | Backend picker + bucket / project id; validation errors inline; saved to the config | `useApp.addSource` | manual |
| Remove a source | Removes it from the list only (deletes nothing) | `useApp.removeSource` | manual |
| Config path and save errors | Where the config lives; an error if it couldn't be written | `useApp.configPath`, `configError` | manual |

## Secret list

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| List secrets | Names, version, time since change; "listing…", empty and error states | `useSecretList` | app "ui rendered", "GET /api/secrets (query string)" |
| Filter | Filter box; `/` focuses it | `useSecretList.filter` | manual |
| Grouping | Rows grouped by the source's `group` pattern (`{service}-{env}-env`), others under "other" | `group.ts` | unit `group.test.ts` |
| Environment colors | dev / staging / prod tone per secret in the list, matrix column headers and pane titles (native: dots and badges; terminal: names and `[prod]` tags in the theme's error / string / function colors) | `envtone.ts` | unit `envtone.test.ts`; manual for the colors |
| Refresh and New | Reload the list; start a new secret (hidden on read-only sources) | `useSecretList.refresh`, `readOnlyFor` | manual |
| Instant revisits | Lists seen before show at once while a fresh copy loads; `cacheSeconds` / `cacheEntries` | `cache.ts` | unit `cache.test.ts` |

## A secret

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Details | Generation / version (latest or older), updated, KMS key, replication (Secret Manager), location | `useSecret` | manual |
| Production banner | A red banner over prod secrets and their editor, saying protected / read-only / changes reach production; a thin colored strip or rule for staging and dev; prod edit and save buttons in red ("edit production…", "save to production") | `envtone.ts`, `protectedFor`, `readOnlyFor` | manual |
| Reveal and hide | Reveal decrypts; auto-hides after `revealSeconds`; Esc hides | `useSecret.reveal`, `scheduleHide` | app "copy button found after reveal"; go `TestFastReadMatchesBerglas` (opt-in, real bucket) |
| Fast reveal | Storage secrets prefetch the encrypted object when versions load, so reveal waits only for KMS | core `fastread.go`; `useSecret.latestId` | go `TestReadUsesThePrefetchedObject` and the other fastread tests |
| Key table | `.env` values as Keys / Raw; Sorted (sections, keys A→Z) or File order, saved as `envOrder:`; binary values get a notice | `envfile.ts`, `envsort.ts`, `useSettingsActions` | unit `envfile.test.ts`, `envsort.test.ts` |
| Filter revealed keys | Box above the table; matches keys or values; "2 of 8 keys"; Esc clears without hiding | `envfilter.ts` | app "filter shows only matching keys", "filter box shown with a revealed value"; unit `envfilter.test.ts` |
| Copy | Copy one key's value or the whole value; clipboard clears after `clipboardClearSeconds` if unchanged | `clipboard.ts`, `useSecret.copy` | app "copy puts the value on the mac clipboard", "clipboard auto-clears after clipboardClearSeconds"; unit `clipboard.test.ts` |
| View an older version | Pick a version to look at it | `useSecret.selectVersion` | manual |
| Read-only and protected | Read-only hides every write; protected names need the name typed to save or delete | `readOnlyFor`, `protectedFor` | app "protected write without confirm → 428", "protected write with X-Berglas-Confirm → 200"; go `TestReadOnlyRefusesWrites`, `TestProtectedNamesNeedTypedConfirmation`; unit `settings.test.ts` |

## Versions

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Version list | Newest first; latest marked; the shown one marked; "only the live generation exists" note when versioning is off | `useSecret.versions` | manual |
| Diff two versions | a / b pickers, Diff a → b; Keys / Lines views; added, removed, changed, quotes-only; show unchanged | `useVersionDiff`, `diff.ts` | unit `diff.test.ts` |
| Diff replaces the table | While a diff is open the table and pickers hide; **hide diff** in the pane header (beside the view tabs), Esc or the reveal timer brings the table back | `useVersionDiff.clear` | manual |

## Pin and compare

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Pin | After reveal, Pin keeps the value in its own pane until Unpin; Open jumps back to it | `usePinned` | manual |
| Key marks | The open secret's keys marked `=` same, `≠` differs, `≈` quotes only, `+` only here; "only in pinned" list; a one-line summary | `diff.ts` `matchAgainst` | unit `diff.test.ts` |
| Compare with pinned | Button in the open secret's pane; diff of pinned (a) against this secret's latest (b) | `useCompare` | manual |
| Comparing layout | Wide: the matrix / overview column steps aside; Versions · Overview · Matrix tabs move into the versions column | skin layout | manual |

## Edit, create, delete

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Edit | Keys or Raw mode; edit a value (rewrites only its line); remove a key; add a key into a chosen section | `useEditor` | manual |
| Edit against a pin | Per-key marks with **Use pinned**; "only in pinned" with Add / Add all; "matches pinned exactly" | `useEditor.edits`, `matchAgainst` | manual |
| Review before save | Diff of the change; overlap warning if someone else changed the same keys; typed name for protected secrets; nothing is written before Save | `useEditor.review`, `save` | app "POST update, 300 KB body round trip" (api only) |
| Conflict | A newer version saved meanwhile: not saved; Reapply my changes, Start over, Cancel | `useEditor` (409 `modified`) | unit `memory_test.go` `TestMemoryStorageUpdateChecksGeneration` (core side) |
| Restore a version | On an older version, Restore opens the editor with it as a draft against the latest | `useEditor.start(restore)` | manual |
| Create | Name, KMS key (prefilled from the source's `kmsKey`), value; review; typed name if protected | `useCreate`, `kmsKeyFor` | go `TestCreateUsesSourceKMSKey` |
| Delete | Type the name to confirm; deletes every version; refused when the name is a prefix of another secret | `useDelete` | app "POST delete"; go `TestMemoryDeleteRefusesPrefixOfAnotherSecret` |

## Overview and matrix

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| Overview | Count, changed in 7 / 30 days, latest change, stale (180 d+), KMS keys, recently changed, untouched longest; each name opens its secret | `overview.ts` | unit `overview.test.ts` |
| Matrix | Group-pattern grid (service × env), time since change per cell, `–` for missing; a cell opens its secret | `overview.ts` `matrixOf` | unit `overview.test.ts` |
| Matrix sort | Click an environment: newest first, oldest first, default | `sortMatrixRows` | unit `overview.test.ts` |
| View tabs | Normal width: Secret · Versions · Overview · Matrix in the top pane's header; wide: overview and matrix get their own column | skin `App.tsx` | manual |

## Mac app only

| Feature | What the user sees | Core | Verified by |
|---|---|---|---|
| No browser, no port | The ui in a native window; requests go to Go in-process | core `DesktopHandler` | app "page origin", "GET /api/desktop"; go `TestDesktopNeedsNoTokenButKeepsPolicy` |
| Clipboard through Go | Copy and auto-clear work outside a click | `desktop.ts`, `/api/desktop/clipboard` | app clipboard checks; go `TestDesktopClipboardClearsOnlyItsOwnValue` |
| Links open outside | mailto and http(s) go to the mail app or browser; other schemes refused | `desktop.ts`, `/api/desktop/open` | app "mailto link handed to the system, app stays"; go `TestDesktopOpenAllowsOnlyWebAndMail`; unit `desktop.test.ts` |
| Menus | App, Edit (copy/paste in fields), Find (⌘F ⌘G ⇧⌘G), View (zoom, reload, full screen), Window | `main.go` `appMenu`, `commands.ts` | manual (shortcuts pressed by hand) |
