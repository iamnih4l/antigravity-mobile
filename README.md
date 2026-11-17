# Antigravity Mobile — Complete Remote Control Centre for Google Antigravity IDE

A production-grade, mobile-first remote command centre for the standalone **[Google Antigravity IDE](https://antigravity.google/product/antigravity-ide/)** (VS Code-based IDE fork, distinct from Antigravity 2.0 standalone Agent Manager).

## Architecture Overview

1. **`scripts/discover-env.mjs` & `CAPABILITY_MATRIX.md`**
   - Inspects your host OS, standalone Google Antigravity IDE installation (`/Applications/Antigravity.app`, `~/.antigravity`, `~/.config/Antigravity`), `agy` daemon, [Google Antigravity CLI](https://antigravity.google/blog/introducing-google-antigravity-cli/), [Agent Client Protocol (ACP v1)](https://agentclientprotocol.com/protocol/v1/overview) endpoints, workspaces, and remote desktop capabilities.
2. **`companion-service/` (Node.js + SQLite + WebSocket + PTY + Git + ACP + Desktop)**
   - **Zero-Dependency Local Execution**: Runs out-of-the-box on Node.js 18+ and Python 3 (`sqlite3` + `pty`), persisting all events, execution traces, approvals, model selections, and paired devices to `companion-service/data/antigravity-mobile.db` (SQLite WAL mode).
   - **Security**: One-time QR pairing codes, HMAC-SHA256 bearer sessions, workspace directory sandboxing, token-bucket rate limiting, dangerous command interception (`rm -rf`, `git push --force`, `sudo`), and automatic credential redaction (`AIza...`, `ya29...`, `Bearer ...`).
   - **Always-Ready Mode**: Includes `daemon/com.antigravity.mobile.plist` (`launchd` for macOS) and `daemon/antigravity-mobile.service` (`systemd` for Linux) for automatic startup and crash recovery.
3. **`ide-extension/` (VS Code-Compatible Extension for Google Antigravity IDE)**
   - Uses documented [VS Code Extension APIs](https://antigravity.google/docs/ide/extensions/vscode/) (`vscode.lm.selectChatModels`, `vscode.workspace`, `vscode.window`, `vscode.languages.onDidChangeDiagnostics`) to stream live IDE state and model inventory to the Companion Service.
4. **`mobile-pwa/` & `antigravity_mobile.html` (Mobile-First Progressive Web App)**
   - Linear / Vercel / Raycast / Cursor inspired dark-first interface (`#09090B` obsidian surface, hairline `#1F222A` borders, restrained indigo/cyan accents).
   - Pre-configured `.mcp.json` for [`21st.dev Magic MCP`](https://21st.dev/mcp) ([`21st-dev/magic-mcp`](https://github.com/21st-dev/magic-mcp)).

## Quick Start (Local Development Machine)

```bash
# 1. Run Phase 1 Technical Discovery & Capability Probe
node scripts/discover-env.mjs

# 2. Run the automated end-to-end integration test suite (SQLite, Git, PTY, Approvals, ACP)
node companion-service/test/integration.test.mjs

# 3. Start the Always-Ready Local Companion Service on port 8787
node companion-service/src/server.mjs
```
