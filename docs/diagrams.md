# cmdlet — Architecture Diagrams

GitHub-renderable Mermaid. Pair with [`architecture.md`](./architecture.md) (structure) and
[`system-design.md`](./system-design.md) (rationale). Diagrams are deliberately kept at the
component level — file-level detail lives in the architecture file index.

---

## 1. System context / containers

The whole app is one process: a WKWebView frontend and a Rust core, with the OS and external
services around it. The webview reaches the core only through the ACL-gated `invoke` bridge.

```mermaid
flowchart LR
    user(["User<br/>(keyboard)"])

    subgraph app["cmdlet.app — single process"]
        direction TB
        fe["Frontend (WKWebView)<br/>TypeScript + Vite, no framework<br/>main · executor · commands · services"]
        core["Rust core (Tauri 2)<br/>windows · global hotkey · file I/O<br/>AppleScript · Spotlight · event tap"]
        fe -- "invoke(cmd, args)<br/>ACL-gated IPC" --> core
        core -- "result / error" --> fe
    end

    subgraph os["macOS & external"]
        direction TB
        icloud[("iCloud Drive<br/>JSON + cmdlet_second_brain.xlsx")]
        pim["Apple Reminders / Notes / Calendar<br/>via osascript"]
        spotlight["Spotlight (mdfind) · open"]
        tap["CGEventTap<br/>(keyboard lock)"]
        spotify["Spotify Web API<br/>(reqwest)"]
    end

    user -- "Ctrl+Shift+Space, type, Enter" --> fe
    core --> icloud
    core --> pim
    core --> spotlight
    core --> tap
    core --> spotify
```

---

## 2. Frontend layers & dispatch

A keystroke is parsed, routed to a `Command`, and either returns a string (done) or a follow-up
handler that captures the next line (multi-step forms, pick-from-list).

```mermaid
flowchart TD
    input["main.ts<br/>keydown(Enter) → submit(line)"]
    input --> hasFU{"active<br/>follow-up?"}

    hasFU -- yes --> fu["route line to activeFollowUp(line)"]
    hasFU -- no --> parse["executor.parseInput<br/>name + args"]
    parse --> resolve["resolveCommand(name)<br/>(catalog + aliases)"]
    resolve --> exec["command.execute(args)"]

    fu --> result{"result type?"}
    exec --> result
    result -- "string" --> done["clear follow-up<br/>append to session history"]
    result -- "{output, followUp, hint}" --> store["store activeFollowUp + hint<br/>show output, await next line"]
    store -.-> input

    subgraph services["services/* (for data commands)"]
        sb["secondBrain.ts<br/>withWorkbook / sheet forms"]
        excel["excel.ts<br/>ExcelJS ⇄ base64 IPC"]
        sb --> excel
    end
    exec -.->|"task/note/assignment/…"| services
```

---

## 3. Command execution — end to end (`task add`)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant M as main.ts
    participant X as executor.ts
    participant C as task command
    participant S as secondBrain.ts
    participant R as Rust core
    participant F as iCloud folder

    U->>M: "task add Study | School | 2026-06-20" + Enter
    M->>X: executeCommand(line)
    X->>C: execute("add Study | …")
    C-->>X: {output, followUp, hint}  (prompt remaining fields)
    X-->>M: render prompt
    U->>M: field values (one Enter per step)
    M->>S: submitTaskRow(values) via withWorkbook(mutate)
    S->>R: second_brain_exists
    alt workbook missing
        S->>R: seed_second_brain_from_template (else code-gen)
    end
    S->>R: read_second_brain_base64
    R->>F: read bytes
    S->>S: ensureWorkbookSheets · applyFormRowValues · recolor
    S->>R: write_second_brain_base64
    R->>R: refuse if open in Excel · temp+fsync+rename · retry×4
    R->>F: atomic write
    S->>R: create_task / create_reminder (+ history)
    X-->>M: "Added …" → clear follow-up, append history
```

---

## 4. Workbook write pipeline

Every mutation funnels through one serialized chain; first materialization prefers the bundled
template; the Rust write is atomic and refuses to clobber a live editor.

```mermaid
flowchart TD
    call["any data command<br/>→ withWorkbook(mutate)"] --> chain["append to workbookWriteChain<br/>(serialized; no interleaving)"]
    chain --> exists{"workbook<br/>exists?"}

    exists -- no --> seed{"seed_second_brain<br/>_from_template?"}
    seed -- "true (bundled)" --> read
    seed -- "false (none)" --> codegen["configureWorkbookStructure()<br/>code-gen Dashboard/Stats/sheets"]
    codegen --> read
    exists -- yes --> read["read_second_brain_base64<br/>→ ExcelJS.load"]

    read --> ensure["ensureWorkbookSheets()<br/>headers, dropdowns if new"]
    ensure --> mutate["mutate(workbook)<br/>apply row / edit"]
    mutate --> recolor["recolor groups"]
    recolor --> write["ExcelJS.writeBuffer → base64<br/>→ write_second_brain_base64"]

    write --> lock{"open in<br/>Excel/Numbers?<br/>(lsof + ~$ lock)"}
    lock -- yes --> fail["refuse: 'close Excel'<br/>(data safe in planner JSON)"]
    lock -- no --> atomic["temp file → fsync → rename<br/>retry×4 on EBUSY"]
    atomic --> verify{"optional<br/>verify re-read"}
    verify -- ok --> done["done"]
    verify -- fail --> err["raise: save unverified"]
```

---

## 5. Permission / capability model (Tauri ACL)

The webview can invoke only the commands its window's capability grants. Adding a command means
touching all three layers.

```mermaid
flowchart LR
    subgraph windows["Windows"]
        main["main window<br/>(palette)"]
        lock["lock window<br/>(keyboard lock UI)"]
    end

    subgraph caps["capabilities/*.json"]
        defcap["default.json<br/>core:window/event/global-shortcut<br/>+ allow-&lt;feature&gt; × N"]
        lockcap["lock.json<br/>+ allow-keyboard-lock"]
    end

    subgraph perms["permissions/*.toml"]
        p1["allow-second-brain<br/>→ read/write/seed/open…"]
        p2["allow-academic<br/>→ add/list/delete/rename…"]
        pn["allow-… (one .toml per feature)"]
        pk["allow-keyboard-lock<br/>→ lock_keyboard / unlock_keyboard"]
    end

    cmds["#[tauri::command] fns<br/>registered in lib.rs invoke_handler!"]

    main --> defcap
    lock --> lockcap
    defcap --> p1 & p2 & pn
    lockcap --> pk
    p1 & p2 & pn & pk --> cmds
```

---

## 6. Data model — JSON authoritative, Excel as projection

```mermaid
flowchart LR
    subgraph json["iCloud JSON (source of truth)"]
        direction TB
        planner["planner.json<br/>classes · assignments · exams · notes"]
        books["books.json"]
        tasks["tasks.json"]
        settings["settings.json"]
        hist["*-history.json<br/>events · reminders · notes (cap 20)"]
    end

    subgraph wb["cmdlet_second_brain.xlsx (projection + editing surface)"]
        direction TB
        dash["Dashboard / Stats<br/>(formula sheets)"]
        data["Classes · Assignments(hidden) · Assignments View<br/>Exams · Projects · Books · Tasks · Events<br/>Notes · Life Tracker"]
    end

    planner -->|"brain sync · form adds"| data
    books -->|"progress · sync"| data
    data -. "manual export only" .-> exportjson["planner-export.json"]
    data --> dash

    note["Flow is primarily JSON → Excel.<br/>Direct Excel edits stay in the workbook<br/>unless a code path reads them back."]
```
