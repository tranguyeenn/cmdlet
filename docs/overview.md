# cmdlet — Product & Capability Overview

## What it is

**cmdlet** is a keyboard-driven command palette for macOS — a Raycast/Spotlight-style overlay
that you summon with **Control + Shift + Space**, type a command into, and dismiss with **Esc**.
It is a single-user desktop application: a Rust/Tauri 2 native shell wrapping a vanilla
TypeScript front end, with all user data persisted as plain files in the user's **iCloud Drive**
folder so it follows them across machines.

It is not a general launcher with a plugin marketplace. It is an opinionated **personal
operations console** for a student/developer: it captures academic planning (classes,
assignments, exams), productivity items (tasks, events, notes, reminders), reading progress, and
daily life metrics, and projects all of it into a richly-formatted Excel **"second brain"**
workbook that the user can also open and edit directly.

## Who it's for

A single power user who lives on the keyboard and wants:
- Zero-chrome capture: hotkey → type → enter, no window management.
- Data they own — flat JSON + an `.xlsx` workbook in their own iCloud folder, no server, no account.
- Native macOS reach: Apple Reminders, Apple Notes, Spotlight file search, Spotify control,
  notifications, and a system-wide keyboard lock.

## Capability surface

The palette exposes **27 commands** (plus aliases `sp`→`spotify`, `search`→`web`, `remind`→`reminder`)
across eight categories. Commands are either **pure front-end** (no backend call), **IPC** (invoke a
Rust command), or **hybrid** (mutate the Excel workbook *and* call a Rust command).

| Category | Commands | Notes |
| --- | --- | --- |
| System | `open`, `calc`, `clear`, `settings`, `help` | `open` launches apps; `calc` is a self-contained expression evaluator; `clear`/`help` are front-end only |
| Academic | `class`, `assignment`, `exam`, `project`, `life` | Planner items persisted to `planner.json` and mirrored into the workbook |
| Productivity | `task`, `event`, `note`, `reminder`, `alert` | `task`/`note` write to Apple Reminders/Notes; `event` is recorded locally |
| Reading | `book`, `progress` | Book catalog + page-progress tracking (`books.json` + workbook) |
| Overview | `brain`, `dashboard`, `export` | `brain` administers the workbook (init/open/sync/status); `dashboard`/`export` summarize the planner |
| Navigation | `web`, `file` | `web` opens a search in the configured browser; `file` is a Spotlight (`mdfind`) search |
| Media | `spotify` | Search via the Spotify Web API, control playback via AppleScript |
| Utilities | `timer`, `clipboard`, `notify` | Background timer with notification, clipboard read/write, native notifications |

### Interaction model

Most data-entry commands use an **interactive follow-up** flow rather than requiring every field on
one line. `task add Study` opens a field-by-field prompt (category, due date, status, …); pressing
Enter on each step advances the form, and the final step commits the row. The same mechanism powers
disambiguation (e.g. `spotify play <query>` lists matches and waits for you to pick a number).

### macOS integrations

| Integration | Mechanism | Behavior |
| --- | --- | --- |
| Apple Reminders | AppleScript (`osascript`) | `reminder` / `task` create real reminders; a local history (max 20) is also kept |
| Apple Notes | AppleScript | `note` writes into a "Cmdlet Notes" folder; local history kept |
| Apple Calendar | local history only | `event` records to `event-history.json`; it does **not** push to Calendar.app (the AppleScript event-creation path exists but is currently unused). A "Cmdlet" calendar can be created on demand |
| Spotify | Web API (`reqwest`) + AppleScript | Search uses client-credentials auth; playback is driven via AppleScript |
| File search | Spotlight (`mdfind`) | `file <query>` lists matches; open by index |
| Notifications | AppleScript / `afplay` / `caffeinate` | Normal banners, plus an "urgent" mode that pierces Focus/Do-Not-Disturb |
| Keyboard lock | CoreGraphics `CGEventTap` | `Control + L` suppresses all keyboard input until unlocked; requires Accessibility permission |

## Data model at a glance

- **Source of truth = flat files in iCloud Drive** (`~/Library/Mobile Documents/com~apple~CloudDocs/Cmdlet/`).
  An allowlisted set of JSON files (`planner.json`, `tasks.json`, `books.json`, `settings.json`,
  the `*-history.json` logs, …) plus the `cmdlet_second_brain.xlsx` workbook.
- **The workbook is a projection/editing surface**, not a separate database. Planner data flows
  JSON → Excel (on `brain sync`, form adds, etc.). The workbook adds dashboards, stats, dropdowns,
  conditional formatting, and a dynamic-array "Assignments View".
- **No multi-user / multi-profile concept.** One workbook and one JSON set per macOS user; iCloud
  handles cross-device sync with last-write-wins semantics.

## Where to go next

- [`architecture.md`](./architecture.md) — components, layers, the IPC bridge, and end-to-end data flow.
- [`system-design.md`](./system-design.md) — design decisions, storage/sync model, concurrency,
  the permission/capability model, failure handling, and the build/release pipeline.
- [`second-brain-template-seeding.md`](./second-brain-template-seeding.md) — how a fresh install
  bootstraps its workbook from a bundled, data-stripped template.
