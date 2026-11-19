# berglas-ui: a guide for new users

berglas-ui is a window onto your team's secrets: the API keys, passwords and `.env` files your
services use, stored with [berglas](https://github.com/GoogleCloudPlatform/berglas) in Google
Cloud. You can browse them, read them, compare them across environments and change them, with
guard rails that make mistakes hard.

It works with both places berglas keeps secrets:

- **Storage + KMS**: secrets in a Cloud Storage bucket, encrypted with a KMS key
- **Secret Manager**: secrets in a Google Cloud project

You only ever see what your own Google account is allowed to see.

**Contents**

1. [Getting started](#1-getting-started)
2. [The window at a glance](#2-the-window-at-a-glance)
3. [Finding a secret](#3-finding-a-secret)
4. [Reading a secret](#4-reading-a-secret)
5. [Versions and history](#5-versions-and-history)
6. [Changing secrets](#6-changing-secrets)
7. [Comparing secrets](#7-comparing-secrets)
8. [Keeping an eye on changes](#8-keeping-an-eye-on-changes)
9. [How the app keeps you safe](#9-how-the-app-keeps-you-safe)
10. [Settings](#10-settings)
11. [Working as another identity](#11-working-as-another-identity)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [When something goes wrong](#13-when-something-goes-wrong)

---

## 1. Getting started

### Sign in to Google once

berglas-ui uses your own Google login. In a terminal, run this once per computer:

```bash
gcloud auth application-default login
```

### Open the app

- **Mac app:** open **berglas-ui.app**.
- **In a browser:** run berglas-ui from a terminal. It prints a link; open it, and your browser
  is connected for that session.

### Try it safely first (demo mode)

Demo mode fills the app with made-up secrets. Nothing reaches Google Cloud and nothing you do is
kept, so it's a good place to click around:

- Mac app: in a terminal, `BERGLAS_UI_DEMO=1 berglas-ui.app/Contents/MacOS/berglas-ui`
  (opening the app from Finder always uses your real secrets)
- Browser: start it with `-demo`

A banner at the top says when you're in demo mode.

### The setup guide

The first time you open the app with no sources, a short setup guide walks you through
three steps:

1. **Sources**: add the buckets and projects that hold your secrets. Add as many as you like,
   one per row, or paste a list (`berglas://my-bucket`, `sm://my-project`, or just the names).
   Each one is checked as you type: you'll see **✓ Reachable** and how many secrets it holds, or
   why it couldn't be read. The guide also suggests how the secret names group (for example
   `{service}-{env}-env`, which groups `orders-dev-env` and `orders-prod-env` under *orders*).
2. **Safety**: choose which secret names are **protected** (for example `*-prod-*`). The guide
   suggests patterns based on your names and shows how many secrets each would cover. You can
   also choose to lock the app when you're away, and keep an audit log.
3. **Review**: check everything, then **Save**.

You can skip the guide and add sources one at a time instead. To bring it back later, use
**Set up sources…** in the command palette (⌘K), **Add several at once…** in the sources pane, or
**Go → Set Up Sources…** in the Mac app's menu.

---

## 2. The window at a glance

- **Sources** (top left): your buckets and projects. Click one to open it. **+** adds another;
  **✕** removes it from the list (nothing in the cloud is deleted, and **Undo** puts it back).
- **Secrets** (left): everything in the open source, grouped by service, with each environment
  in its colour: **green** for dev, **amber** for staging, **red** for production.
- **The main area** (right): the open secret, with tabs for **Versions**, **Overview**,
  **Matrix** and **Drift**.
- **The header**: time zone, zoom, theme, skin, and **Settings**.

The app comes in two looks, **native** (the default) and **terminal**, each with several themes.
Switch with **Skin** and **Theme** in the header.

**Zoom out** (header **Zoom** menu, or ⌘− in the Mac app) to give the layout more room. On a wide
window, the matrix and overview then get their own column beside the secret.

---

## 3. Finding a secret

- **Filter**: type in the box above the list, or press **/** from anywhere.
- **Favourites**: click **☆** on a secret to star it. Favourites stay at the top of the list.
- **Recent**: the last few secrets you opened sit above the list. Click the heading to fold it;
  **×** removes one.
- **Command palette (⌘K)**: one box to jump to any secret or source, or run an action (new secret,
  refresh, switch view, theme, settings and more). Type a few letters, pick with ↑↓, press Enter.
- **Find in the window (⌘F, Mac app)**: highlights matching text anywhere in the window. Hidden
  values are never matched.

---

## 4. Reading a secret

Click a secret to see its details: when it last changed, its version, its key, and where it lives.
Its value stays hidden until you ask for it.

- **Reveal** shows the value. It hides again by itself after a minute (you can change this), or
  when you press **Esc** or **Hide**.
- **`.env` secrets** open as a table of keys:
  - **Keys / Raw** switches between the table and the file as stored.
  - **Sorted / File order** sorts the table by section and key, or shows the file's own order.
    Only the view changes; the file itself is never reordered.
  - **Filter keys and values** narrows the table to what you type.
- **Copying**:
  - **Copy** next to a key copies that one value.
  - **Copy value** copies the whole secret.
  - **Copy as export lines** copies every key as `export KEY='value'` lines, ready to paste into
    a terminal.
  - While a filter is on, **Copy N shown** copies just those keys.
  - Everything you copy is wiped from the clipboard after 30 seconds (you can change this), as
    long as you haven't copied something else since.
- **Save to file…** writes the revealed version to a file, after asking you first.

**Production secrets** sit under a red banner, so you always know when you're looking at one.

---

## 5. Versions and history

The **Versions** tab lists every saved version, newest first.

- **View** shows an older version (it's marked as old).
- **Diff**: pick **a** and **b** on two versions, then **Diff a → b** to see what changed.
- **Restore this version…** (on an older version) opens the editor with that old value, ready to
  save as a new version. Nothing is lost: the newer versions stay in the history.

---

## 6. Changing secrets

### Editing

1. Click **Edit…** (on production secrets it says **Edit production…**).
2. Change what you need. For `.env` secrets you can edit values one by one, **Remove** a key, or
   **Add key** (into a section of your choice). Switch to **Raw** to edit the text directly.
3. Click **Review changes**. You'll see exactly what will change, with warnings for keys set
   twice or left empty.
4. Click **Save**. Nothing is written until you do.

For a **protected** secret, you type the word **confirm** before saving.

**Save unchanged…** writes the same value again as a new version. It's useful when something
watches a secret for new versions (for example a cluster that syncs secrets) and you need it to
pick the secret up again.

**If someone else saved first**, your save is refused instead of overwriting their work. You can
**Reapply my changes to the latest** (for `.env` secrets) or **Start over from the latest**.

**If you try to leave with unsaved changes**, by opening another secret or switching source,
the app asks first. **Keep editing** is the default.

### Creating

Click **+** above the list (or **New secret** in ⌘K), fill in a name and a value, review, and
create. For a bucket, the KMS key can be filled in for you if you set one for that source.

**Drop a file** onto the window to use its contents: either as the new value of the open secret,
or as a new secret named after the file. You still review before anything is saved.

### Deleting

**Delete…** removes a secret and all of its history. You type the word **confirm** to go ahead.

---

## 7. Comparing secrets

### Pin and compare

**Pin** keeps a secret in its own pane while you open others. With something pinned:

- **Compare with pinned…** shows the differences between the pinned secret and the open one,
  without revealing either value.
- Revealing the open secret marks each key against the pin: **= same**, **≠ differs**,
  **≈ quotes** (same value, only the quotes differ), **+ only here**.
- In the editor, **Use pinned** copies a value across, and **Add all** brings over keys the
  pinned secret has and this one doesn't.

**Unpin** when you're done.

### Overview

A summary of the open source: how many secrets, how many changed recently, the latest change,
secrets untouched for a long time, the KMS keys used, and a list of recent changes.

### Matrix

Your services down the side, environments across the top (dev, staging, prod). Each cell shows how
long ago that secret last changed, or **–** if it doesn't exist. Click an environment to sort by
it, and click a cell to open that secret.

### Drift

Compares one service's keys across its environments: which keys are missing where, and which
values match. **No values are shown.** Instead, each distinct value gets a letter, so the same
letter means the same value. It also flags a production value that's the same as a non-production
one, which is often a copy-paste mistake.

Open it from the **Drift** tab, or **Compare keys** on a matrix row.

(Matrix and Drift appear for sources whose names follow a pattern like
`{service}-{env}-env`. The setup guide or Settings can set that pattern.)

---

## 8. Keeping an eye on changes

- **Watch**: click **Watch** on a secret, and the app checks it for new versions every few
  minutes. Changes made by someone else show under **Changed** above the list until you open
  them, and the Mac app sends a notification.
- **Copy link**: copies a `berglas-ui://` link that opens the Mac app straight at that secret.
  The link holds no value, so it's safe to share with teammates.

---

## 9. How the app keeps you safe

- **Hidden by default**: values appear only when you click **Reveal**, and hide again on a timer.
- **Clipboard clean-up**: anything you copy is wiped after a while.
- **Protected names**: saving, saving to a file and deleting need the word **confirm** typed.
- **Production banner**: production secrets are always marked in red.
- **Read-only**: a source, or the whole app, can refuse all changes.
- **Review before every save**, and saves never overwrite someone else's newer change.
- **Drift never shows values**: it compares keys without decrypting anything into view.
- **Lock (Mac app)**: lock the app from **Go → Lock** (⇧⌘L), or have it lock itself after a while
  without use. Unlocking asks for Touch ID or your password. A half-finished edit is kept.
- **Hidden from screen sharing (Mac app)**: the window doesn't appear in screenshots, recordings
  or screen shares, unless you allow it in Settings.
- **Audit log** (optional): a record of every change and export (what and when, never the values).

---

## 10. Settings

Open **Settings** from the header, with **⌘,**, or from ⌘K. Every setting is there, in sections
(Appearance, Safety, Sources, Identity, Cache and watch, About), with a search box at the top.

- Most settings apply the moment you change them.
- **Safety settings** (read-only, protected names, timers, the lock, screen sharing, the audit
  log) are collected first. A bar lists what will change, and you confirm them all at once.
- A few settings need the app restarted; they say so.

Your settings are kept in one file, `~/.berglas-ui/config.yaml`, which the app writes for you.

---

## 11. Working as another identity

If your team uses service accounts, the app can act as one instead of you. Once they're listed
in your settings file, an **Act as** picker appears at the top of the window (and in ⌘K). Switching
reloads the list, since a different identity may see different secrets.

---

## 12. Keyboard shortcuts

Press **?** at any time to see them all. The main ones:

| Keys | What it does |
|---|---|
| ⌘K | Jump to a secret, source or action |
| ⌘, | Settings |
| / | Filter the secret list |
| ? | Show all shortcuts |
| Esc | Close a dialog, clear a filter, hide a revealed value |
| ↑ ↓, Enter | Move and pick in lists and menus |
| ⌘F, ⌘G | Find in the window, next match (Mac app) |
| ⇧⌘L | Lock (Mac app) |
| ⌘= ⌘− ⌘0 | Zoom in, out, actual size (Mac app) |

On Windows and Linux, use Ctrl instead of ⌘.

---

## 13. When something goes wrong

- **"No usable Google credentials"**: run `gcloud auth application-default login`, then **Retry**.
- **A source shows an error, or no secrets**: your Google account probably lacks access to that
  bucket or project. Ask whoever manages it to grant you access.
- **Your save says "Not saved"** because someone saved a newer version while you were editing:
  reapply your changes to the latest, or start over from it.
- **"Couldn't check the clipboard"** (browser only): the browser didn't let the app read the
  clipboard, so the copied value wasn't wiped. Clear it yourself if it was sensitive.
- **The browser says it isn't paired**: open the link printed in the terminal again. Each run of
  berglas-ui has its own link.
