# cmdlet

A keyboard-driven command palette for macOS. Summon it with **Control + Shift + Space**, type a
command, press Enter, dismiss with **Esc**. It captures academic planning, tasks/events/notes,
reading, and daily-life metrics, drives native macOS integrations (Reminders, Notes, Spotlight,
Spotify, notifications), and projects everything into a hand-editable Excel "second brain" workbook.

**Stack:** Tauri 2 (Rust core) + vanilla TypeScript/Vite frontend (no UI framework). Single-user,
no server — all state is flat files in the user's iCloud Drive.

## Architecture at a glance

```
WKWebView (TS/Vite, no framework)        Rust core (Tauri 2)              OS
  main.ts / executor.ts  ── invoke ──►   #[tauri::command] modules  ──►   iCloud Drive (JSON + .xlsx)
  commands/*  services/*   (ACL'd IPC)   storage, second_brain,           osascript (Reminders/Notes/
  storage/*   utils/*                    academic, books, planner,         Calendar/Spotify)
                                         reminders, calendar, notes,       mdfind / open
                                         spotify, files, notifications,    CGEventTap (keyboard lock)
                                         settings, keyboard_lock           Spotify Web API
```

The webview talks to the core **only** through `invoke`, gated by Tauri's per-window capability ACL.
Source of truth is JSON in `~/Library/Mobile Documents/com~apple~CloudDocs/Cmdlet/`; the workbook is
a projection + rich editing surface.

→ **Full docs in [`docs/`](./docs/):**
[overview](./docs/overview.md) ·
[architecture](./docs/architecture.md) ·
[diagrams](./docs/diagrams.md) ·
[system design](./docs/system-design.md) ·
[workbook template seeding](./docs/second-brain-template-seeding.md)

## Repository layout

```
cmdlet/
├── index.html                  # palette markup
├── src/                        # frontend (TypeScript, no framework)
│   ├── main.ts                 # palette UI: input, history, show/hide, resize
│   ├── executor.ts             # parse → resolve → dispatch + follow-up state machine
│   ├── autocomplete.ts         # Tab completion
│   ├── commands/               # one Command object per feature (+ catalog.ts registry)
│   ├── services/               # Excel subsystem (ExcelJS ⇄ base64 IPC, serialized writes)
│   ├── storage/                # thin invoke wrappers for JSON / settings / PIM
│   └── utils/                  # date/intent parsing, form prompts, recurrence
└── src-tauri/                  # Rust core
    ├── src/                    # one module per subsystem (see docs/architecture.md §3)
    ├── capabilities/           # default.json (main window) · lock.json (lock window)
    ├── permissions/*.toml      # per-feature command allowlists (the ACL)
    ├── resources/              # bundled second_brain_template.xlsx
    └── tauri.conf.json         # windows, bundle, signing
```

## Command surface

27 commands (+ aliases `sp`→`spotify`, `search`→`web`, `remind`→`reminder`) across eight categories.
Data-entry commands use an interactive field-by-field follow-up flow; `help <command>` shows examples.

| Category | Commands |
| --- | --- |
| System | `open`, `calc`, `clear`, `settings`, `help` |
| Academic | `class`, `assignment`, `exam`, `project`, `life` |
| Productivity | `task`, `event`, `note`, `reminder`, `alert` |
| Reading | `book`, `progress` |
| Overview | `brain`, `dashboard`, `export` |
| Navigation | `web`, `file` |
| Media | `spotify` |
| Utilities | `timer`, `clipboard`, `notify` |

```
assignment add Essay | HIST101 | friday | high
book add Anna Karenina 864     progress Anna Karenina +50
brain init                     brain sync        dashboard
spotify play bohemian rhapsody file budget.xlsx
```

## Prerequisites

- macOS 10.15+ · Node.js 18+ · Rust 1.77+ · Xcode Command Line Tools (`xcode-select --install`)

## Develop

```bash
npm install
npm run tauri dev      # Vite dev server on :1420 + Rust core; palette starts hidden
```

## Build & release

```bash
npm run tauri:build    # → src-tauri/target/release/bundle/macos/cmdlet.app  (bundle target "app")
npm run build:dmg      # also produces a .dmg via scripts/build-dmg.sh
```

The build is **code-signed with a stable self-signed cert** ("Cmdlet Dev Signing") so the macOS
Accessibility grant (needed by the `Control+L` keyboard lock) survives rebuilds — unlock the signing
keychain first or the `codesign` step prompts/fails. Install for testing:

```bash
cp -R src-tauri/target/release/bundle/macos/cmdlet.app /Applications/
xattr -dr com.apple.quarantine /Applications/cmdlet.app
open -a /Applications/cmdlet.app
```

See [`docs/system-design.md`](./docs/system-design.md) §6 for the signing rationale and DMG-build
pitfalls.

## Permissions

- **App-level (macOS TCC):** Reminders & Notes prompts (declared in `Info.plist`); Accessibility for
  the keyboard lock (granted manually in System Settings → Privacy & Security).
- **In-app (Tauri ACL):** the webview can invoke only the Rust commands granted to its window via
  `capabilities/*.json` + `permissions/*.toml`. Adding a backend command requires registering it in
  the `lib.rs` `invoke_handler!`, listing it in a `permissions/<feature>.toml`, and attaching that
  permission to a capability.

## Extending

- **New command:** add `src/commands/<name>.ts` exporting a `Command`, register it in
  `src/commands/catalog.ts`. Backend-backed commands also need the steps under *Permissions* above.
- **New workbook field/sheet:** update `SHEET`/`SHEET_ORDER`/`HEADERS` (and `excelRowSchemas.ts` for
  forms) in `src/services/secondBrain.ts`; to ship it on fresh installs, regenerate the bundled
  template per [`docs/second-brain-template-seeding.md`](./docs/second-brain-template-seeding.md).

See [`docs/system-design.md`](./docs/system-design.md) §8 for the full extension checklist.

## License

MIT
