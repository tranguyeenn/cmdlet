# cmdlet — System Design

> Audience: engineers making non-trivial changes. This covers the design decisions, data/sync model,
> concurrency, security boundary, failure handling, and the build/release pipeline. For the runtime
> shape and file index, read [`architecture.md`](./architecture.md) first.

## 1. Design goals & constraints

| Goal | Consequence |
| --- | --- |
| **User owns their data; no server/account** | Persistence is flat files in the user's iCloud Drive folder. Sync, backup, and cross-device are delegated to iCloud. No network is required for core features. |
| **Keyboard-first, zero-chrome** | An `Accessory` app (no Dock icon, `LSUIElement`), a borderless always-on-top palette toggled by a global hotkey, blur-to-hide, session-only history. |
| **Native macOS reach without entitlement sprawl** | OS integrations go through AppleScript / CLI tools the user already trusts, behind Tauri's per-command ACL. The only "scary" permission is Accessibility, required solely by the keyboard-lock feature. |
| **The workbook must be hand-editable** | The Excel "second brain" is a first-class editing surface, not an internal format — hence the editor-lock detection and atomic writes that coexist with a user who has the file open in Excel. |
| **Single user, single workbook** | No multi-tenant logic. Concurrency is intra-process (overlapping async writes), not multi-client. |

## 2. Storage & sync model

### 2.1 Layout

Everything lives in `~/Library/Mobile Documents/com~apple~CloudDocs/Cmdlet/` (resolved by
`storage::icloud_storage_dir()` from `$HOME`). Two kinds of artifact:

- **Allowlisted JSON** — `storage.rs` enforces an `ALLOWED_FILES` allowlist
  (`planner.json`, `tasks.json`, `books.json`, `quicklinks.json`, `settings.json`,
  `planner-export.json`, `event-history.json`, `reminder-history.json`, `note-history.json`).
  `ensure_storage_ready()` creates the folder and seeds defaults idempotently on startup and before
  every read/write. The allowlist is also a **security boundary** — the generic
  `read_json_command`/`write_json_command` can't be coerced into touching arbitrary paths.
- **The workbook** — `cmdlet_second_brain.xlsx`, managed by `second_brain.rs`.

### 2.2 JSON as source of truth, Excel as projection

The planner JSON is authoritative. The workbook is a **downstream projection plus rich editing
surface**:

```
planner.json / books.json  ──(brain sync, form adds, quick logs)──►  cmdlet_second_brain.xlsx
   (authoritative)                                                     (dashboards, stats,
                                                                         dropdowns, Assignments View)
```

Flow is primarily JSON → Excel. There is no automatic Excel → JSON reconciliation; `brain sync`
pushes planner items the workbook is missing, and `planner_export()` writes a point-in-time snapshot
to `planner-export.json`. Implication: if a user edits a row directly in Excel, that edit lives only
in the workbook unless a code path reads it back. This is an accepted limitation, not a bug — see
[`second-brain-template-seeding.md`](./second-brain-template-seeding.md) §8.

### 2.3 Consistency model

iCloud gives **eventual consistency with last-write-wins** at file granularity. Each mutation is a
full read-modify-write of the whole file. There is no CRDT/merge: two devices editing concurrently
will have one clobber the other on sync. Acceptable for a single user who is rarely racing themselves
across machines.

### 2.4 Legacy migration

`migrate_from_legacy()` runs once at startup: if an iCloud file is still empty and the old Tauri
app-data dir has content, it copies it over (`tasks/books/settings` directly; planner via
`planner_data::migrate_planner_from_legacy`). Emptiness-gated so it never overwrites real iCloud data.

## 3. The workbook subsystem

This is the most intricate part of the system because it must be **safe against a concurrent human
editor** and **safe against overlapping async writers within the app**.

### 3.1 Read-modify-write over base64 IPC

ExcelJS runs in the **frontend** (it's a JS library). The backend only moves bytes:

```
read:  Rust read_bytes → base64  ──IPC──►  JS base64→Uint8Array → ExcelJS.load
write: ExcelJS.writeBuffer → base64  ──IPC──►  Rust base64-decode → write_bytes_atomic
```

Base64 is used deliberately — large raw byte arrays are unreliable over Tauri IPC.

### 3.2 Serialized write chain (`withWorkbook`)

Multiple commands can fire overlapping async writes. `secondBrain.ts` funnels every mutation through
`withWorkbook(mutate)`, which chains onto a module-level `workbookWriteChain` promise. Each link does
a fresh **read → mutate → write**, so no writer operates on a stale in-memory workbook and writes
cannot interleave. An optional `verify` callback re-reads after writing to confirm the row landed.

### 3.3 Atomic writes + live-editor detection (`second_brain.rs`)

`write_bytes_atomic`:
1. **Refuses** if a spreadsheet editor holds the file open — probed via `lsof -F cn` against both the
   workbook and its Office `~$` lock file, matched against `EDITOR_APP_MARKERS`
   (excel/numbers/soffice/openoffice/libreoffice). Writing under a live editor would be silently lost
   on the editor's next save, so we fail loudly and tell the user to close it.
2. Writes to a temp file → `fsync` → atomic `rename` (crash-safe; no torn files).
3. Retries up to `WRITE_RETRIES = 4` with linear backoff on transient busy errors
   (`EACCES`/`EAGAIN`/`EADDRINUSE`).

Reads use the same retry-on-busy logic. Note the asymmetry vs. JSON files, which use a plain
`fs::write` — the workbook gets the heavier treatment because it is the artifact a human opens.

### 3.4 First-run bootstrap

On the first materialization (missing workbook), the app prefers a **bundled, data-stripped template**
over code-generation, so a new user inherits the curated layout (including the dynamic-array
"Assignments View"). The seed-then-fallback is wired into all three materialization points
(`ensureWorkbookReady`, `initSecondBrain`, `performWorkbookWrite`). Full design + the template
regeneration runbook: [`second-brain-template-seeding.md`](./second-brain-template-seeding.md).

## 4. macOS integration design

- **AppleScript over native frameworks.** Reminders, Notes, Calendar-creation, and Spotify playback
  are driven by `osascript`. Trade-off: no extra entitlements and trivial to reason about, at the cost
  of fragile string scripts and coarse error reporting. All dynamic values pass through
  `escape_applescript` (escapes `\` and `"`) to prevent script injection. Error strings from
  `osascript` are pattern-matched to human remediation (e.g. authorization failures → "open System
  Settings → Privacy").
- **Local-history side-tables.** Reminders/Notes/Events each keep a capped (max 20) `*-history.json`
  so the palette can show "recent" lists without round-tripping AppleScript. **Events are
  history-only**: `calendar::create_event` records locally and returns "Created event (local)"; the
  AppleScript event-push (`create_apple_event`) exists but is currently unused dead code.
- **Notifications that pierce Focus.** `notifications.rs` offers an "urgent" mode that combines
  `caffeinate -u` (wake the display), `afplay` (a sound Focus won't silence), and a `display dialog`
  modal with `giving up after` — because banner notifications are suppressed under Do-Not-Disturb.
- **Keyboard lock.** `keyboard_lock.rs` installs a session-level `CGEventTap` on a dedicated thread
  whose run loop is pumped in 250 ms slices, so unlock latency is bounded. It requires Accessibility
  (`AXIsProcessTrusted`); if missing, the hotkey surfaces a notification pointing at the Accessibility
  pane. This is the **only** feature needing Accessibility, and it drives the code-signing decision
  in §6.

## 5. Security & permission model

- **Tauri capability/ACL.** The webview can invoke *only* the commands granted to its window.
  `capabilities/default.json` grants the `main` window one `allow-<feature>` permission per subsystem;
  `capabilities/lock.json` grants the `lock` window only `allow-keyboard-lock`. Each
  `permissions/<feature>.toml` lists the exact command names. A new backend command is unreachable
  until it is added to a `.toml` *and* that permission is attached to a capability.
- **Path allowlist.** Generic JSON I/O is constrained to `ALLOWED_FILES`; no traversal, no arbitrary
  reads/writes.
- **No remote code / CSP.** `csp: null` is set because the frontend is fully local and loads no remote
  origins; there is no third-party script surface.
- **Secrets.** Spotify credentials come from env vars (`SPOTIFY_CLIENT_ID/SECRET`) or a local
  `spotify.json` in app-data — never bundled. Absence yields a setup hint, not a crash.
- **Trust boundary.** The webview is treated as the lower-trust tier; all OS reach is behind typed,
  allowlisted Rust commands. The practical attack surface is "what the user typed into their own
  palette," so the hardening that matters is AppleScript escaping and the path allowlist.

## 6. Build, signing & release

```
npm run build       → tsc (typecheck) + vite build → dist/   (frontend embedded in the binary)
npm run tauri:build → tauri build (bundle target "app")        → src-tauri/target/release/bundle/macos/cmdlet.app
npm run build:dmg   → scripts/build-dmg.sh → tauri build --bundles app,dmg → also …/bundle/dmg/*.dmg
```

- **Frontend is embedded.** Vite (dev server on :1420, matching `tauri.conf.json` `devUrl`) compiles
  `src/` + `public/` (incl. `lock.html`) into `dist/`, which the release binary embeds.
- **Code signing is load-bearing.** The bundle is signed with a **stable self-signed cert**
  ("Cmdlet Dev Signing") rather than ad-hoc. Reason: macOS TCC pins the Accessibility grant to the
  code's Designated Requirement; an ad-hoc signature changes hash every build and would force the user
  to re-grant Accessibility each time. The signing keychain must be unlocked before building.
- **DMG flakiness is known and self-healing.** `scripts/build-dmg.sh` `pkill`s app instances launched
  from a mounted `/Volumes/dmg.*` (which otherwise keep the backing store busy and break `hdiutil`)
  before building. The `.app` always builds even when the `.dmg` step fails.
- **Install for test:** copy the `.app` to `/Applications`, `xattr -dr com.apple.quarantine`, `open`.
  Note macOS is case-insensitive — `Cmdlet.app` and `cmdlet.app` are the same file.

## 7. Notable failure modes & how they're handled

| Failure | Handling |
| --- | --- |
| Workbook open in Excel/Numbers during a write | `write_bytes_atomic` refuses, returns a "close Excel" message; data stays safe in the planner JSON |
| Overlapping async workbook writes | `withWorkbook` serialization chain; each link re-reads first |
| Crash mid-write | temp-file + `fsync` + atomic `rename` → never a torn workbook |
| Transient FS busy (iCloud/network) | retry ×4 with backoff on read and write |
| iCloud Drive disabled | `ensure_storage_ready` surfaces a clear "enable iCloud Drive" error |
| Missing OS permission (Reminders/Calendar/Accessibility) | AppleScript error strings mapped to remediation text; keyboard lock points to the Accessibility pane |
| Missing Spotify creds | setup hint instead of failure |
| Re-grant churn on rebuild | stable code-signing cert pins the TCC Accessibility grant |

## 8. Extending the system

- **New palette command:** add `src/commands/<name>.ts` exporting a `Command`; register in
  `commands/catalog.ts`. Pure-frontend commands need nothing else.
- **New backend capability:** add the `#[tauri::command]` fn + module, register it in the `lib.rs`
  `invoke_handler!`, add the command name to a `permissions/<feature>.toml`, and attach that
  permission in `capabilities/default.json`. Bridge it with a thin `invoke` wrapper under
  `src/storage/` or `src/services/`.
- **New workbook sheet/column:** update `SHEET`/`SHEET_ORDER`/`HEADERS` and (if it's a form)
  `excelRowSchemas.ts` in `secondBrain.ts`; if it must ship in fresh installs, also regenerate the
  bundled template (see the seeding doc).
- **New persisted JSON file:** add it to `ALLOWED_FILES` and seed a default in `ensure_storage_ready`.
