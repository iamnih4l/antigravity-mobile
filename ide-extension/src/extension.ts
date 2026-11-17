import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as QRCode from 'qrcode';

interface TunnelState {
  url: string;
  pid?: number;
  startedAt: string;
}

let activeTunnelUrl: string | null = null;
let tunnelProcess: ChildProcess | null = null;
let qrPanel: vscode.WebviewPanel | null = null;

function getCompanionUrl(): string {
  const config = vscode.workspace.getConfiguration('antigravityMobile');
  return (config.get<string>('companionUrl') || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

function getPwaUrl(): string {
  const config = vscode.workspace.getConfiguration('antigravityMobile');
  return (config.get<string>('pwaUrl') || '').trim().replace(/\/+$/, '');
}

function getAutoStartTunnel(): boolean {
  const config = vscode.workspace.getConfiguration('antigravityMobile');
  const val = config.get<boolean>('autoStartTunnel');
  return val !== false;
}

function findCompanionScript(): string | null {
  const config = vscode.workspace.getConfiguration('antigravityMobile');
  const configured = (config.get<string>('companionScriptPath') || '').trim();
  const home = os.homedir();

  const candidatePaths = [
    configured,
    path.resolve(__dirname, '../../companion-service/src/server.mjs'),
    path.resolve(__dirname, '../companion-service/src/server.mjs'),
    path.join(home, 'OneDrive', 'Desktop', 'antigravity-mobile', 'companion-service', 'src', 'server.mjs'),
    path.join(home, 'Desktop', 'antigravity-mobile', 'companion-service', 'src', 'server.mjs'),
    path.join(home, 'Projects', 'antigravity-mobile', 'companion-service', 'src', 'server.mjs'),
    path.join(home, 'antigravity-mobile', 'companion-service', 'src', 'server.mjs'),
    path.join(home, '.antigravity', 'companion-service', 'src', 'server.mjs'),
  ].filter(Boolean);

  return candidatePaths.find((p) => fs.existsSync(p)) || null;
}

function getTunnelStateFile(): string {
  const script = findCompanionScript();
  if (script) {
    return path.resolve(path.dirname(script), '../data/tunnel-state.json');
  }
  return path.join(os.homedir(), '.antigravity', 'mobile-tunnel-state.json');
}

function readTunnelState(): TunnelState | null {
  try {
    const file = getTunnelStateFile();
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as TunnelState;
    if (data && typeof data.url === 'string' && data.url.startsWith('https://')) {
      return data;
    }
  } catch {
    // Ignore corrupt state
  }
  return null;
}

function writeTunnelState(state: TunnelState) {
  try {
    const file = getTunnelStateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore write failure
  }
}

function findCloudflaredBinary(): string {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'cloudflared.exe';
  }
  const unixCandidates = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
  for (const c of unixCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'cloudflared';
}

async function isHealthOk(baseUrl: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'online';
  } catch {
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  let isDaemonOnline = false;
  let isStartingTunnel = false;

  // 1. Status Bar Button
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravityMobile.pairDevice';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  function updateStatusBar() {
    if (isDaemonOnline && activeTunnelUrl) {
      statusBarItem.text = '$(device-mobile) Mobile Ready';
      statusBarItem.tooltip = `Antigravity Mobile Connected\nTunnel: ${activeTunnelUrl}\nClick to open 1-Scan QR Code`;
    } else if (isStartingTunnel) {
      statusBarItem.text = '$(sync~spin) Mobile: Starting Tunnel...';
      statusBarItem.tooltip = 'Starting Cloudflare Quick Tunnel for your phone...';
    } else if (isDaemonOnline) {
      statusBarItem.text = '$(radio-tower) Mobile Local';
      statusBarItem.tooltip = 'Companion Service Online locally. Click to start/view QR Code.';
    } else {
      statusBarItem.text = '$(plug) Mobile Offline';
      statusBarItem.tooltip = 'Companion Service Offline. Click to start.';
    }
  }

  // 2. Auto-sync active workspace folder to Companion Service
  async function syncCurrentWorkspace() {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsFolder) return;
    try {
      await fetch(`${getCompanionUrl()}/api/workspaces/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: wsFolder }),
      });
    } catch {
      // Ignore if offline
    }
  }

  // 3. Auto-start Companion Service Daemon
  async function ensureCompanionDaemon(): Promise<boolean> {
    const url = getCompanionUrl();
    if (await isHealthOk(url, 2000)) {
      isDaemonOnline = true;
      updateStatusBar();
      await syncCurrentWorkspace();
      return true;
    }

    const serverScript = findCompanionScript();
    if (!serverScript) {
      isDaemonOnline = false;
      updateStatusBar();
      return false;
    }

    try {
      const proc = spawn('node', [serverScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, PORT: '8787' },
      });
      proc.unref();

      // Wait briefly for daemon boot
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 600));
        if (await isHealthOk(url, 1500)) {
          isDaemonOnline = true;
          updateStatusBar();
          await syncCurrentWorkspace();
          return true;
        }
      }
    } catch {
      // Fall through
    }

    isDaemonOnline = false;
    updateStatusBar();
    return false;
  }

  // 4. Auto-start or Reuse Cloudflare Quick Tunnel
  async function ensureCloudflareTunnel(forceRestart = false): Promise<string | null> {
    if (!forceRestart) {
      // Check in-memory URL
      if (activeTunnelUrl && (await isHealthOk(activeTunnelUrl, 4000))) {
        updateStatusBar();
        return activeTunnelUrl;
      }
      // Check persisted tunnel state from another IDE window / existing process
      const saved = readTunnelState();
      if (saved && (await isHealthOk(saved.url, 4000))) {
        activeTunnelUrl = saved.url;
        updateStatusBar();
        return activeTunnelUrl;
      }
    } else if (tunnelProcess) {
      try {
        tunnelProcess.kill();
      } catch {
        // Ignore
      }
      tunnelProcess = null;
      activeTunnelUrl = null;
    }

    if (isStartingTunnel) return activeTunnelUrl;
    isStartingTunnel = true;
    updateStatusBar();

    const cloudflaredBin = findCloudflaredBinary();
    const localUrl = getCompanionUrl();

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (url: string | null) => {
        if (resolved) return;
        resolved = true;
        isStartingTunnel = false;
        if (url) {
          activeTunnelUrl = url;
          writeTunnelState({
            url,
            pid: tunnelProcess?.pid,
            startedAt: new Date().toISOString(),
          });
        }
        updateStatusBar();
        if (qrPanel) {
          renderQrWebview(qrPanel).catch(() => {});
        }
        resolve(url);
      };

      const timeout = setTimeout(() => finish(null), 20000);

      try {
        const proc = spawn(cloudflaredBin, ['tunnel', '--url', localUrl], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        tunnelProcess = proc;

        const handleChunk = (chunk: Buffer) => {
          const text = chunk.toString('utf8');
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match) {
            clearTimeout(timeout);
            finish(match[0]);
          }
        };

        proc.stdout?.on('data', handleChunk);
        proc.stderr?.on('data', handleChunk);
        proc.on('error', () => {
          clearTimeout(timeout);
          finish(null);
        });
        proc.on('exit', () => {
          if (tunnelProcess === proc) {
            tunnelProcess = null;
            activeTunnelUrl = null;
            updateStatusBar();
          }
        });
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    });
  }

  // 5. Render 1-Scan QR Webview Panel
  async function promptForPwaUrl(): Promise<string | null> {
    const current = getPwaUrl();
    const input = await vscode.window.showInputBox({
      prompt: 'Enter your Vercel Web App URL (saved once for 1-Scan QR links)',
      placeHolder: 'https://antigravity-mobile.vercel.app',
      value: current || 'https://',
      ignoreFocusOut: true,
    });
    if (!input || !input.trim() || input.trim() === 'https://') {
      return current || null;
    }
    const clean = input.trim().replace(/\/+$/, '');
    await vscode.workspace
      .getConfiguration('antigravityMobile')
      .update('pwaUrl', clean, vscode.ConfigurationTarget.Global);
    return clean;
  }

  async function renderQrWebview(panel: vscode.WebviewPanel) {
    const pwaUrl = getPwaUrl();
    const endpoint = activeTunnelUrl || getCompanionUrl();
    const connectLink = pwaUrl
      ? `${pwaUrl}?endpoint=${encodeURIComponent(endpoint)}`
      : endpoint;

    let svgQr = '';
    try {
      svgQr = await QRCode.toString(connectLink, {
        type: 'svg',
        margin: 2,
        width: 240,
        color: { dark: '#09090B', light: '#FFFFFF' },
      });
    } catch {
      svgQr = '<p style="color:#f43f5e">Could not render QR SVG</p>';
    }

    const statusBadge = activeTunnelUrl
      ? '<span class="badge ok">● Cloudflare Tunnel Live</span>'
      : isStartingTunnel
      ? '<span class="badge warn">◌ Starting Cloudflare Tunnel...</span>'
      : '<span class="badge err">○ Tunnel Offline</span>';

    const pwaNotice = !pwaUrl
      ? `<div class="notice">
           <strong>Tip:</strong> Set your Vercel Web App URL so scanning this QR opens your app directly and auto-connects!
           <button class="btn primary small" onclick="send('setPwaUrl')">Set Vercel URL</button>
         </div>`
      : '';

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Antigravity Mobile QR</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: #09090b;
      color: #f4f4f5;
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .card {
      max-width: 440px;
      width: 100%;
      background: #121216;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 18px;
      margin: 0;
      font-weight: 600;
    }
    .badge {
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid;
    }
    .badge.ok { background: rgba(16,185,129,0.12); color: #6ee7b7; border-color: rgba(16,185,129,0.35); }
    .badge.warn { background: rgba(245,158,11,0.12); color: #fcd34d; border-color: rgba(245,158,11,0.35); }
    .badge.err { background: rgba(244,63,94,0.12); color: #fda4af; border-color: rgba(244,63,94,0.35); }
    .qr-box {
      background: #ffffff;
      border-radius: 14px;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 18px 0;
    }
    .qr-box svg {
      width: 220px;
      height: 220px;
      display: block;
    }
    .subtitle {
      font-size: 13px;
      color: #a1a1aa;
      text-align: center;
      margin: 0 0 16px 0;
      line-height: 1.5;
    }
    .field-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      font-family: ui-monospace, monospace;
      margin-bottom: 4px;
    }
    .code-box {
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 12px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      color: #a5b4fc;
      word-break: break-all;
      margin-bottom: 14px;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }
    .btn {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #27272a;
      background: #1c1c22;
      color: #e4e4e7;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .btn:hover { background: #27272a; }
    .btn.primary {
      background: #4f46e5;
      border-color: #6366f1;
      color: #ffffff;
    }
    .btn.primary:hover { background: #4338ca; }
    .btn.small { padding: 6px 10px; font-size: 11px; margin-top: 8px; display: inline-block; }
    .notice {
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      color: #c7d2fe;
      margin-bottom: 12px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Antigravity Mobile</h1>
      ${statusBadge}
    </div>
    ${pwaNotice}
    <p class="subtitle">
      Point your <strong>iPhone Camera</strong> at this QR code to open your remote workspace instantly — pre-connected to this PC.
    </p>
    <div class="qr-box">${svgQr}</div>

    <div class="field-label">Active Tunnel Endpoint</div>
    <div class="code-box">${endpoint}</div>

    ${pwaUrl ? `<div class="field-label">Vercel Web App</div><div class="code-box">${pwaUrl}</div>` : ''}

    <div class="actions">
      <button class="btn primary" onclick="send('copyConnectLink')">Copy 1-Tap Link</button>
      <button class="btn" onclick="send('copyEndpoint')">Copy Tunnel URL</button>
      <button class="btn" onclick="send('setPwaUrl')">${pwaUrl ? 'Change Vercel URL' : 'Set Vercel URL'}</button>
      <button class="btn" onclick="send('restartTunnel')">Restart Tunnel</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
  }

  async function openQrPanel() {
    await ensureCompanionDaemon();
    if (!activeTunnelUrl) {
      await ensureCloudflareTunnel(false);
    }

    // Prompt once for Vercel URL if not saved yet
    if (!getPwaUrl()) {
      await promptForPwaUrl();
    }

    if (qrPanel) {
      qrPanel.reveal(vscode.ViewColumn.Beside);
      await renderQrWebview(qrPanel);
      return;
    }

    qrPanel = vscode.window.createWebviewPanel(
      'antigravityMobileQr',
      'Antigravity Mobile — Scan to Connect',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    qrPanel.onDidDispose(() => {
      qrPanel = null;
    });

    qrPanel.webview.onDidReceiveMessage(async (msg: { command: string }) => {
      const endpoint = activeTunnelUrl || getCompanionUrl();
      const pwaUrl = getPwaUrl();
      const connectLink = pwaUrl ? `${pwaUrl}?endpoint=${encodeURIComponent(endpoint)}` : endpoint;

      if (msg.command === 'copyConnectLink') {
        await vscode.env.clipboard.writeText(connectLink);
        vscode.window.showInformationMessage('Copied 1-Tap Mobile Connect Link to clipboard!');
      } else if (msg.command === 'copyEndpoint') {
        await vscode.env.clipboard.writeText(endpoint);
        vscode.window.showInformationMessage('Copied Cloudflare Tunnel URL to clipboard!');
      } else if (msg.command === 'setPwaUrl') {
        await promptForPwaUrl();
        if (qrPanel) await renderQrWebview(qrPanel);
      } else if (msg.command === 'restartTunnel') {
        await ensureCloudflareTunnel(true);
        if (qrPanel) await renderQrWebview(qrPanel);
      }
    });

    await renderQrWebview(qrPanel);
  }

  // 6. Telemetry Streaming
  async function postTelemetry(eventType: string, description: string, details: Record<string, unknown> = {}) {
    try {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'unknown';
      await fetch(`${getCompanionUrl()}/api/ide/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          description,
          project: path.basename(wsFolder),
          workspace: wsFolder,
          details,
          models: await discoverIdeLanguageModels(),
        }),
      });
    } catch {
      // Offline fallback
    }
  }

  async function discoverIdeLanguageModels() {
    if (!('lm' in vscode) || typeof vscode.lm?.selectChatModels !== 'function') {
      return [];
    }
    try {
      const models = await vscode.lm.selectChatModels({});
      return models.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.vendor || 'Antigravity IDE',
        family: m.family,
        version: m.version,
        contextWindow: m.maxInputTokens || null,
        available: true,
        source: 'vscode.lm.selectChatModels',
      }));
    } catch {
      return [];
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
      if (!editor) return;
      const relPath = vscode.workspace.asRelativePath(editor.document.uri);
      postTelemetry('active_editor', `Switched active editor to ${relPath}`, {
        file: relPath,
        languageId: editor.document.languageId,
      });
    }),
    vscode.workspace.onDidSaveTextDocument((doc: any) => {
      const relPath = vscode.workspace.asRelativePath(doc.uri);
      postTelemetry('file_saved', `Saved ${relPath} in Antigravity IDE`, {
        file: relPath,
        lineCount: doc.lineCount,
      });
    }),
    vscode.languages.onDidChangeDiagnostics((evt: any) => {
      for (const uri of evt.uris) {
        const diags = vscode.languages.getDiagnostics(uri);
        const errors = diags.filter((d: any) => d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length > 0) {
          const relPath = vscode.workspace.asRelativePath(uri);
          postTelemetry('diagnostics', `${errors.length} error(s) detected in ${relPath}`, {
            file: relPath,
            errors: errors.slice(0, 3).map((e: any) => ({ message: e.message })),
          });
        }
      }
    }),
    vscode.window.onDidOpenTerminal((term: any) => {
      postTelemetry('ide_terminal', `Opened IDE terminal: ${term.name}`, { name: term.name });
    }),
    vscode.window.onDidCloseTerminal((term: any) => {
      postTelemetry('ide_terminal', `Closed IDE terminal: ${term.name}`, { name: term.name });
    })
  );

  // 7. Registered Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityMobile.pairDevice', () => openQrPanel()),
    vscode.commands.registerCommand('antigravityMobile.setPwaUrl', async () => {
      const updated = await promptForPwaUrl();
      if (updated) {
        vscode.window.showInformationMessage(`Saved Vercel Web App URL: ${updated}`);
        if (qrPanel) await renderQrWebview(qrPanel);
      }
    }),
    vscode.commands.registerCommand('antigravityMobile.restartTunnel', async () => {
      await ensureCompanionDaemon();
      const url = await ensureCloudflareTunnel(true);
      if (url) {
        vscode.window.showInformationMessage(`Cloudflare Tunnel restarted: ${url}`);
      } else {
        vscode.window.showErrorMessage('Could not start Cloudflare Tunnel. Check if cloudflared is installed.');
      }
    }),
    vscode.commands.registerCommand('antigravityMobile.syncModels', async () => {
      const models = await discoverIdeLanguageModels();
      await postTelemetry('model_sync', `Synced ${models.length} IDE language models`, { models });
      vscode.window.showInformationMessage(`Antigravity Mobile synced ${models.length} IDE models.`);
    }),
    vscode.commands.registerCommand('antigravityMobile.connectionStatus', async () => {
      const url = getCompanionUrl();
      try {
        const res = await fetch(`${url}/api/health`);
        const data = (await res.json()) as Record<string, unknown>;
        vscode.window.showInformationMessage(
          `Antigravity Mobile: ONLINE\nWorkspace: ${String(data.activeWorkspace)}\nTunnel: ${activeTunnelUrl || 'Local only'}`
        );
      } catch {
        vscode.window.showErrorMessage(`Antigravity Mobile Companion is offline at ${url}.`);
      }
    })
  );

  // 8. Automatic Boot Sequence on Startup
  (async () => {
    updateStatusBar();
    const ok = await ensureCompanionDaemon();
    if (ok && getAutoStartTunnel()) {
      await ensureCloudflareTunnel(false);
    }
  })();
}

export function deactivate() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch {
      // Ignore
    }
    tunnelProcess = null;
  }
}
