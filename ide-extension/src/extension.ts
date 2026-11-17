import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Google Antigravity IDE Companion Extension.
 * Activates automatically across any project workspace via `onStartupFinished`.
 * 1. Checks if companion-service daemon is running; auto-spawns it if not.
 * 2. Dynamically registers the current active workspace with the companion service.
 * 3. Shows an interactive status bar item with 1-click phone pairing link & QR code.
 * 4. Streams live active editor, saves, diagnostics, and vscode.lm language models.
 */
export function activate(context: vscode.ExtensionContext) {
  const getCompanionUrl = () =>
    vscode.workspace.getConfiguration('antigravityMobile').get<string>('companionUrl') || 'http://127.0.0.1:8787';

  const getVercelAppUrl = () =>
    vscode.workspace.getConfiguration('antigravityMobile').get<string>('vercelAppUrl') || 'https://antigravity-mobile.vercel.app';

  // 1. Interactive Status Bar Item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'antigravityMobile.pairDevice';
  context.subscriptions.push(statusBar);

  function updateStatusBar(online: boolean) {
    if (online) {
      statusBar.text = '$(device-mobile) Antigravity Mobile: Active';
      statusBar.tooltip = 'Companion Service is running. Click to view phone pairing link / QR code';
      statusBar.show();
    } else {
      statusBar.text = '$(device-mobile) Antigravity Mobile (Offline)';
      statusBar.tooltip = 'Companion Service is offline. Click to launch';
      statusBar.show();
    }
  }

  // 2. Auto-Spawn Companion Daemon if not already running
  async function ensureCompanionDaemon() {
    const url = getCompanionUrl();
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        updateStatusBar(true);
        syncCurrentWorkspace();
        return;
      }
    } catch {
      // Offline, attempt auto-spawn
    }

    // Search for companion-service entry script
    const candidatePaths = [
      path.resolve(__dirname, '../../companion-service/src/server.mjs'),
      path.resolve(__dirname, '../companion-service/src/server.mjs'),
      path.join(os.homedir(), '.antigravity/companion-service/src/server.mjs'),
      path.join(os.homedir(), 'antigravity-mobile/companion-service/src/server.mjs'),
    ];

    const serverScript = candidatePaths.find((p) => fs.existsSync(p));
    if (serverScript) {
      try {
        const proc = spawn('node', [serverScript], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, PORT: '8787' },
        });
        proc.unref();

        // Check health after brief spin-up delay
        setTimeout(async () => {
          try {
            const res = await fetch(`${url}/api/health`);
            if (res.ok) {
              updateStatusBar(true);
              syncCurrentWorkspace();
            }
          } catch {
            updateStatusBar(false);
          }
        }, 1500);
      } catch {
        updateStatusBar(false);
      }
    } else {
      updateStatusBar(false);
    }
  }

  // 3. Automatically sync whichever project is opened
  async function syncCurrentWorkspace() {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsFolder) return;
    try {
      await fetch(`${getCompanionUrl()}/api/workspaces/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: wsFolder }),
      });
    } catch {
      // Ignored if daemon is temporarily busy
    }
  }

  // 4. Send telemetry updates
  async function postTelemetry(category: string, description: string, details: Record<string, unknown> = {}) {
    try {
      const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'global';
      await fetch(`${getCompanionUrl()}/api/activity/ide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: workspaceName,
          category,
          description,
          details,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Offline fallback
    }
  }

  // 5. Discover LM models
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

  // Track active editor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor: any) => {
      if (!editor) return;
      const relPath = vscode.workspace.asRelativePath(editor.document.uri);
      postTelemetry('active_editor', `Switched active editor to ${relPath}`, {
        file: relPath,
        languageId: editor.document.languageId,
      });
    })
  );

  // Track file saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc: any) => {
      const relPath = vscode.workspace.asRelativePath(doc.uri);
      postTelemetry('file_save', `Saved file ${relPath} in Antigravity IDE`, {
        file: relPath,
        languageId: doc.languageId,
      });
    })
  );

  // Track diagnostics
  context.subscriptions.push(
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
    })
  );

  // Track terminals
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((term: any) => {
      postTelemetry('ide_terminal', `Opened IDE terminal: ${term.name}`, { name: term.name });
    }),
    vscode.window.onDidCloseTerminal((term: any) => {
      postTelemetry('ide_terminal', `Closed IDE terminal: ${term.name}`, { name: term.name });
    })
  );

  // 6. Registered Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityMobile.pairDevice', async () => {
      const url = getCompanionUrl();
      const vercelUrl = getVercelAppUrl();
      try {
        const qrRes = await fetch(`${url}/api/auth/qr`);
        const qrData = (await qrRes.json()) as { pairingCode: string; loopbackUrl: string };
        const deepLink = `${vercelUrl}?endpoint=${encodeURIComponent(url)}&code=${qrData.pairingCode}`;

        const choice = await vscode.window.showInformationMessage(
          `Antigravity Mobile is Active!\nPairing Code: ${qrData.pairingCode}`,
          'Open Web App on Desktop',
          'Copy Phone Direct Link',
          'Copy Pairing Code'
        );

        if (choice === 'Open Web App on Desktop') {
          vscode.env.openExternal(vscode.Uri.parse(deepLink));
        } else if (choice === 'Copy Phone Direct Link') {
          await vscode.env.clipboard.writeText(deepLink);
          vscode.window.showInformationMessage('Copied pre-authenticated mobile link to clipboard! Paste or send to your phone.');
        } else if (choice === 'Copy Pairing Code') {
          await vscode.env.clipboard.writeText(qrData.pairingCode);
          vscode.window.showInformationMessage(`Copied pairing code ${qrData.pairingCode} to clipboard.`);
        }
      } catch {
        const choice = await vscode.window.showErrorMessage(
          'Companion Service is not responding. Would you like to start it now?',
          'Start Service'
        );
        if (choice === 'Start Service') {
          ensureCompanionDaemon();
        }
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
          `Antigravity Mobile Companion: ONLINE\nActive Workspace: ${String(data.activeWorkspace)}\nUptime: ${String(data.uptimeSeconds)}s`
        );
      } catch {
        vscode.window.showErrorMessage(`Antigravity Mobile Companion is offline at ${url}.`);
      }
    })
  );

  // Initialize daemon and workspace sync
  ensureCompanionDaemon();
}

export function deactivate() {}
