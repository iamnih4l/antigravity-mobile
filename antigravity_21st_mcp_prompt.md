# Master Prompt for Google Antigravity IDE — Mobile-First Production Upgrade with 21st.dev Magic MCP

Copy and paste the prompt below directly into your local [Google Antigravity IDE](https://antigravity.google/product/antigravity-ide/) agent after extracting `antigravity_mobile_complete.zip` into your workspace.

## Prompt to Paste into Antigravity IDE

**ROLE & OBJECTIVE**

You are working inside the extracted `antigravity-mobile/` workspace on my local development machine. Your objective is to upgrade and wire `mobile-pwa/` into a complete, production-grade, mobile-first Next.js 14 + TypeScript + Tailwind CSS Progressive Web App (PWA) connected live to the existing `companion-service/` backend (`http://127.0.0.1:8787` and `ws://127.0.0.1:8787/ws/mobile`) and `ide-extension/` bridge, using the [21st.dev Magic MCP](https://21st.dev/mcp) server ([`21st-dev/magic-mcp`](https://github.com/21st-dev/magic-mcp)) and [`@21st-dev/cli`](https://www.npmjs.com/package/@21st-dev/cli) for all frontend UI component discovery, generation, and refinement.

**IMPORTANT PRODUCT TARGET**

Target the standalone [Google Antigravity IDE](https://antigravity.google/product/antigravity-ide/) (VS Code fork using the local `agy` service and [VS Code Extension APIs](https://antigravity.google/docs/ide/extensions/vscode/)). Do **not** target the standalone Antigravity 2.0 Agent Manager app ([Getting Started with Google Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)).

**EXISTING WORKSPACE INVENTORY (DO NOT REWRITE FROM SCRATCH — BUILD ON THESE FILES)**

1. **Host Discovery & Capability Validation**:
   - `scripts/discover-env.mjs` — Probes the host OS, installed Antigravity IDE binary, [Google Antigravity CLI](https://antigravity.google/blog/introducing-google-antigravity-cli/) (`agy`), [Agent Client Protocol (ACP v1)](https://agentclientprotocol.com/protocol/v1/overview) endpoints, workspaces, and remote desktop tools, writing `companion-service/data/capability-report.json`.
   - `CAPABILITY_MATRIX.md` — Documents the 6-level capability classification across all 22 acceptance criteria.
2. **Local Companion Service (`companion-service/`)**:
   - `companion-service/src/server.mjs` — HTTP REST + RFC 6455 WebSocket server on port `8787` (`/api/health`, `/api/auth/qr`, `/api/auth/pair`, `/api/discovery`, `/api/models`, `/api/models/select`, `/api/agents`, `/api/agents/select`, `/api/tasks`, `/api/tasks/cancel`, `/api/activity`, `/api/workspaces`, `/api/files`, `/api/files/diff`, `/api/git/status`, `/api/git/diff`, `/api/git/action`, `/api/terminal/sessions`, `/api/terminal/exec`, `/api/approvals`, `/api/approvals/resolve`, `/api/desktop`, `/api/desktop/input`).
   - `companion-service/src/db/sqlite.mjs` & `sqlite_worker.py` — Persistent SQLite WAL database (`companion-service/data/antigravity-mobile.db`).
   - `companion-service/src/services/` — `security.mjs` (QR pairing, HMAC-SHA256 bearer sessions, rate limiting, credential redaction), `workspace.mjs`, `git.mjs`, `terminal.mjs` (PTY runner), `acp-bridge.mjs` ([ACP Introduction](https://agentclientprotocol.com/get-started/introduction)), and `desktop.mjs`.
   - `companion-service/test/integration.test.mjs` — End-to-end integration test suite.
3. **VS Code-Compatible IDE Extension (`ide-extension/`)**:
   - `ide-extension/src/extension.ts` & `package.json` — Streams active editor, file saves, diagnostics, terminal events, and `vscode.lm.selectChatModels()` inventory to the Companion Service.
4. **Mobile PWA & Reference Implementation (`mobile-pwa/` & `.mcp.json`)**:
   - `.mcp.json` — Configured for `@21st-dev/magic@latest`.
   - `mobile-pwa/src/lib/companion-client.ts` — Typed REST + WebSocket client for `companion-service`.
   - `mobile-pwa/public/index.html` — Interactive reference UI containing all 10 views and state flows.

**MANDATORY REQUIREMENT: 21ST.DEV MAGIC MCP WORKFLOW**

Before writing any frontend React code in `mobile-pwa/src/`:

1. Inspect the active MCP tools in this IDE session and verify the configured [21st.dev Magic MCP](https://21st.dev/mcp) server ([`21st-dev/magic-mcp`](https://github.com/21st-dev/magic-mcp) / [FlowHunt 21st.dev Magic MCP Docs](https://www.flowhunt.io/mcp-servers/21st-dev-magic/)).
2. List the exact MCP tool names exposed by the server (such as component search, component generation, and UI iteration tools) and verify their required parameters.
3. If the MCP server requires an API key (`TWENTYFIRST_API_KEY` in `.mcp.json`) or is not yet active, stop and report that clearly before generating components—never fabricate MCP usage.
4. Use the 21st.dev Magic MCP tools (and [`@21st-dev/cli`](https://www.npmjs.com/package/@21st-dev/cli) where helpful) to discover, generate, and refine:
   - **Mobile Bottom Navigation Bar & Contextual Pill Bar**: Fixed 5-item mobile bottom bar (`Overview`, `Agents`, `Projects`, `Activity`, `Settings`), horizontal scroll-snap contextual pills (`Terminal`, `Files`, `Git`, `Desktop`, `Models`, `Approvals`), and a compact desktop sidebar (`md:flex`).
   - **Overview Command Dashboard**: Compact status strip, active workspace switcher, pending approvals alert drawer, inline quick task composer, active tasks list, and recent file modifications with `Agent` vs `Manual` origin badges.
   - **AI Model Selector & Parameter Drawer**: Live model cards discovered from `/api/models`, context window badges, parameter sliders (`temperature`, `maxOutputTokens`, `thinkingBudget`), selection history log, and clear visual separation between [Agent Client Protocol (ACP)](https://agentclientprotocol.com/get-started/clients) session model switching and native IDE side-panel model switching.
   - **AI Agent Selector & Task Composer**: Distinct badges for `1. Native Antigravity IDE Agent`, `2. ACP-Connected Agent`, and `3. External CLI Agent`, execution mode selector (`autonomous`, `supervised_approval`, `plan_only`), mid-run task steering, and cancellation.
   - **Unified Activity Timeline & Execution Trace Inspector**: Filterable real-time stream backed by `/api/activity` and WebSocket events, expandable step-by-step execution traces (`Prompt submitted → Model selected → Agent started → Tool invoked → Tool result → File modified → Task completed`), and one-tap JSON/CSV export.
   - **Project, File Explorer & Diff Viewer**: Authorized directory tree browser, mobile-optimized code editor with syntax highlighting, file save/create/delete with modal confirmation, and unified Git diff drawer.
   - **Interactive Remote Terminal (PTY)**: Multi-session PTY tabs (`/api/terminal/sessions`), streaming WebSocket terminal output, quick-command chips, `SIGINT` (`^C`) button, output search, and dangerous-command policy interception (`rm -rf`, `git push --force`, `sudo`).
   - **Mobile Git Client**: Branch switcher, working tree file staging/unstaging, commit composer, pull/push actions, and commit history list (`/api/git/status`, `/api/git/action`).
   - **Approval Centre**: Real-time permission queue (`/api/approvals`) with risk-level badges, exact command/path inspection, and one-tap Approve/Reject actions (`/api/approvals/resolve`).
   - **Remote Desktop Controller**: Low-latency interactive screen canvas (`/api/desktop`) with touch-to-click coordinate dispatch, window switcher, and on-screen IDE shortcut bar (`Cmd+P`, `Cmd+Shift+P`, `Cmd+S`, `Esc`).

**VISUAL & MOBILE-FIRST DESIGN RULES**

| Attribute | Specification |
| :--- | :--- |
| **Aesthetic Direction** | Minimal, dark-first developer OS inspired by Linear, Vercel, Raycast, and Cursor |
| **Surface Palette** | Deep obsidian `#09090B`, carbon `#0E1015`, elevated surface `#13161F`, hairline border `#222634` |
| **Accent Palette** | Restrained indigo `#6366F1`, violet `#8B5CF6`, and cyan `#06B6D4` with semantic emerald/amber/rose status indicators |
| **Typography** | `Space Grotesk` for headers, `Inter` for UI controls, and `JetBrains Mono` for code, diffs, terminal output, and hashes |
| **Mobile Ergonomics** | Designed first for iPhone viewports (`375px–430px` width): zero horizontal page overflow, `>= 44px` touch targets, bottom sheet drawers instead of cramped popovers, smooth momentum scrolling, and safe-area-inset bottom padding |
| **Progressive Disclosure** | Keep cards compact and uncluttered; place raw JSON payloads, full diffs, and multi-step execution traces inside collapsible drawers |

**STEP-BY-STEP EXECUTION PLAN**

1. **Step 1 — Host Discovery & Backend Verification**:
   - Run `node scripts/discover-env.mjs` on this machine and inspect `companion-service/data/capability-report.json` to see the real local Antigravity IDE path, workspaces, and CLI status.
   - Run `node companion-service/test/integration.test.mjs` to verify SQLite persistence, QR pairing, Git operations, PTY terminal execution, and Approval Centre guards on this host.
2. **Step 2 — 21st.dev Magic MCP Inspection & Component Generation**:
   - Inspect available [21st.dev Magic MCP](https://21st.dev/mcp) tools and generate modular React + TypeScript components inside `mobile-pwa/src/components/` (`BottomNav.tsx`, `CommandHeader.tsx`, `OverviewDashboard.tsx`, `ModelManager.tsx`, `AgentManager.tsx`, `TaskComposerModal.tsx`, `ActivityTimeline.tsx`, `ProjectFileExplorer.tsx`, `RemoteTerminal.tsx`, `GitManager.tsx`, `ApprovalCentre.tsx`, `RemoteDesktopView.tsx`, `QrPairingModal.tsx`).
   - Harmonize all generated 21st.dev components to share our exact Tailwind design tokens, hairline borders, and mobile touch ergonomics without adding bloated third-party UI libraries.
3. **Step 3 — Live Backend & Extension Wiring**:
   - Connect every view in `mobile-pwa/src/app/page.tsx` to `AntigravityCompanionClient` (`mobile-pwa/src/lib/companion-client.ts`) so all reads, mutations, and real-time updates flow through `companion-service` (`http://127.0.0.1:8787` / Tailscale IP) and persist in SQLite.
   - Compile and package `ide-extension/` so it activates inside Google Antigravity IDE and streams live editor, diagnostic, and `vscode.lm` model telemetry to `companion-service`.
4. **Step 4 — End-to-End Verification**:
   - Start `companion-service` and `mobile-pwa`, verify zero TypeScript or Next.js build errors, test mobile viewport responsiveness at `390x844`, and confirm all 22 final acceptance criteria pass against the live environment.
