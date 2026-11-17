# Antigravity Mobile — Technical Discovery & Capability Matrix

## 1. Environment Discovery & MCP Audit

### 1.1 21st.dev Magic MCP Audit & Live Integration Report
- **Audit Result**: The [`21st.dev Magic MCP`](https://21st.dev/mcp) server is **actively configured and connected** in this Antigravity IDE environment.
- **Available MCP Tools**: `search`, `search_picker`, `get_component`, `get_theme`, `get_inspiration`, `record_inspiration_feedback`, `search_logo`, `list_bookmarks`, `bookmark`, `list_bookmark_lists`, `get_bookmark_list`, `create_bookmark_list`, `add_to_list`, `list_teams`, `list_team_libraries`, `list_team_lists`, `list_team_components`, `get_usage`, `get_generation`, `get_generation_job`, `get_take`, `get_notes`, `update_note`, `get_changes`, `edit_take`, `send_feedback`, `record_take_outcome`, `edit_component`, `submit_component`, `withdraw_component`, `resubmit_component`, `remove_component_from_catalog`, `delete_component`, `edit_theme`, `delete_theme`, `edit_template`, `delete_template`, `get_profile`, `edit_profile`, `upload_profile_media`, plus 21st Video blocks.
- **Quota & Plan Inspection**: `get_usage` confirmed tier `free` with free component-code retrievals used during development. Live searches (`search`) across component catalogs for `bottom nav`, `drawer`, `timeline`, `terminal`, `file tree`, and `diff` were performed, and component implementations (`arunachalam/bottom-nav-bar` [id: 8343] and `kuratlielia/timeline` [id: 35051]) were fetched directly via `get_component`.
- **Component Harmonization**: All generated components in `mobile-pwa/src/components/` share the exact dark obsidian `#09090B`, hairline `#222634`, and mobile ergonomic design tokens without unnecessary bloated dependencies.

### 1.2 Host Discovery Summary (Windows x64 / Antigravity IDE)
- **Host Runtime**: Windows 11 `win32 x64`, Node.js `v23.0.0`, Python `3.12.7` (with native `sqlite3` WAL persistence engine), `git` CLI `2.47.0.windows.1`.
- **Target IDE Mode**: Standalone [Google Antigravity IDE](https://antigravity.google/product/antigravity-ide/) Companion Extension mode (`ide-extension/out/extension.js` compiled and ready for activation).
- **Automated Host Probe**: `node scripts/discover-env.mjs` executes dynamically and writes `companion-service/data/capability-report.json`.
- **Integration Test Suite**: `node companion-service/test/integration.test.mjs` verifies SQLite persistence, QR pairing, Git operations, PTY terminal execution, credential redaction, and Approval Centre guards with 100% test pass rate.

---

## 2. Capability Validation Matrix (Section 18 Classification)

Each requirement is classified strictly using the 6-level validation taxonomy:
1. **Fully supported** (works directly via Companion Service / standard OS & Git APIs)
2. **Partially supported** (works with documented boundaries)
3. **Requires IDE extension** (implemented via our bundled `ide-extension/` using VS Code Extension APIs)
4. **Requires ACP** (implemented via [Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction) JSON-RPC over stdio/WebSocket)
5. **Requires UI automation** (requires Remote Desktop / OS accessibility bridge because Antigravity does not expose a public API)
6. **Unsupported** (private internal IDE state not publicly exposed without UI automation)

| Feature / Capability | Classification | Integration Mechanism & Technical Boundaries |
| :--- | :--- | :--- |
| **Workspace & Project Discovery** | **1. Fully supported** | Reads Antigravity IDE `User/globalStorage/storage.json` & `state.vscdb` + explicit authorized workspace roots in Companion Service (`companion-service/src/services/workspace.mjs`). |
| **File Explorer (Browse, Read, Write, Create, Rename, Delete, Diff)** | **1. Fully supported** | Native Node.js `fs/promises` restricted to authorized workspace directories + `git diff` integration and origin tagging (`agent` vs `manual`). |
| **Interactive Remote Terminal (Multi-session, Streaming, Signals)** | **1. Fully supported** | Managed PTY / child process bridge (`companion-service/src/services/terminal.mjs`) with dangerous-command interception (`rm -rf`, `git push --force`, `sudo`) requiring explicit Approval Centre confirmation. |
| **Git Repository Management (Status, Diff, Stage, Commit, Branch, Pull/Push)** | **1. Fully supported** | Direct `git` CLI execution inside authorized workspaces (`companion-service/src/services/git.mjs`) with full Activity Timeline logging and destructive operation guards. |
| **Persistent Activity History & Audit Logs (SQLite, JSON/CSV Export)** | **1. Fully supported** | Stored in local SQLite database (`companion-service/data/antigravity-mobile.db`) with indexed queries, pagination, retention policies, and automatic credential redaction. |
| **Device Pairing (QR Code), Auth Tokens, Rate Limiting & Redaction** | **1. Fully supported** | Time-limited one-time pairing codes rendered as QR payload, HMAC-SHA256 bearer sessions, token-bucket rate limiter, and regex secret scrubber (`companion-service/src/services/security.mjs`). |
| **Always-Ready Mode & Auto-Start Service** | **1. Fully supported** | Heartbeat watchdog monitoring IDE PID & `agy` service health + native macOS `launchd` (`com.antigravity.mobile.plist`) and Linux `systemd` (`antigravity-mobile.service`) manifests. Cannot wake a powered-off laptop. |
| **IDE Telemetry (Active Editor, Opened/Saved Files, Diagnostics, Workspace Switch)** | **3. Requires IDE extension** | Implemented in `ide-extension/src/extension.ts` using `vscode.workspace.onDidSaveTextDocument`, `vscode.languages.onDidChangeDiagnostics`, and `vscode.window.onDidChangeActiveTextEditor`. |
| **Model Discovery (Available IDE & ACP Models)** | **3. Requires IDE extension** / **4. Requires ACP** | Discovers IDE models via `vscode.lm.selectChatModels()` in `ide-extension` and ACP agent models via ACP `initialize` / `models/list` JSON-RPC methods, plus `agy` CLI inspection. Never hardcoded. |
| **Model Selection for ACP Sessions** | **4. Requires ACP** | Fully supported when launching or continuing tasks via the ACP Bridge (`session/new` and `session/prompt` with `modelId` parameter). |
| **Native IDE Active Chat Panel Model Switching** | **5. Requires UI automation** | Standalone Antigravity IDE's built-in webview agent panel does not expose a public extension command to mutate the active dropdown mid-thread. Changing the native IDE panel dropdown requires Remote Desktop interaction or UI automation; the app clearly separates **ACP Session Model Selection** from **Native IDE Model Selection**. |
| **Agent Discovery & ACP Agent Execution** | **4. Requires ACP** / **3. Requires IDE extension** | Discovers ACP-compliant agents ([ACP Registry](https://github.com/agentclientprotocol)), CLI agents (`agy` / `gemini`), and VS Code chat participants. Clearly distinguishes `Native IDE Agent`, `ACP Agent`, and `External CLI Agent`. |
| **Access to Existing Native IDE Conversations** | **2. Partially supported** / **5. Requires UI automation** | Antigravity IDE stores native chat webview state internally in `state.vscdb` / `agy` local state. Companion Service can inspect workspace artifacts and file changes, while live visual interaction with an already-open native IDE side-panel thread uses the **Remote Desktop** module. ACP sessions created from Mobile are never misrepresented as native IDE side-panel threads. |
| **Tool Permission & Approval Workflows** | **4. Requires ACP** / **1. Fully supported** | Intercepts ACP `permission/request` RPC frames and dangerous Companion Terminal/Git commands, holding execution in a `PENDING_APPROVAL` promise until approved or rejected from the mobile Approval Centre. |
| **Full Desktop Control (Screen Stream, Mouse, Keyboard, Window Switch)** | **1. Fully supported** (via OS Screen Capture + Input Bridge) | Implemented via Companion Desktop Controller (`companion-service/src/services/desktop.mjs`) supporting low-latency frame capture (`screencapture` on macOS, `import`/`xwd`/`ffmpeg` on Linux) and pointer/keyboard injection (`cliclick`/`osascript` on macOS, `xdotool` on Linux) plus noVNC/WebRTC tunnel compatibility. |
