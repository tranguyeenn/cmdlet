# cmdlet — Engineering Documentation

Start here, then read in order. Each doc is self-contained but cross-links the others.

| Doc | What it answers | Read it when |
| --- | --- | --- |
| [overview.md](./overview.md) | What is cmdlet? Who is it for? What can it do? | You're new to the project or evaluating scope |
| [architecture.md](./architecture.md) | Runtime shape: layers, modules, the IPC bridge, end-to-end data flow, file index | You need to find where something lives or how a keystroke becomes a side effect |
| [diagrams.md](./diagrams.md) | Mermaid architecture diagrams: container, frontend dispatch, execution sequence, workbook write pipeline, permission model, data model | You want the visual reference |
| [system-design.md](./system-design.md) | Why it's built this way: storage/sync model, workbook concurrency & atomicity, security/ACL, failure modes, build/signing, extension checklist | You're making a non-trivial change or operating the build |
| [second-brain-template-seeding.md](./second-brain-template-seeding.md) | How a fresh install bootstraps its Excel workbook from a bundled, data-stripped template (+ regeneration runbook) | You're touching the workbook layout or first-run behavior |

## One-paragraph orientation

cmdlet is a single-process **Tauri 2** macOS app: a Rust core owning the OS (windows, the global
hotkey, file I/O, AppleScript, Spotlight, the keyboard-lock event tap, Spotify HTTP) and a
framework-free **TypeScript/Vite** frontend that reaches it solely through the ACL-gated `invoke`
bridge. It's single-user with no server — state is flat **JSON + an `.xlsx` workbook in the user's
iCloud Drive folder**, where JSON is authoritative and the workbook is a richly-formatted projection
and hand-editable surface. The trickiest subsystem is the workbook: ExcelJS runs in the frontend,
bytes cross IPC as base64, writes are serialized in-app and made atomic + live-editor-aware in Rust,
and fresh installs are seeded from a bundled template.
