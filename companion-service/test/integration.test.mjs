import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCompanionServer } from '../src/server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

// Ensure rootDir is an initialized git repository so Git tests exercise real git CLI operations
if (!fs.existsSync(path.join(rootDir, '.git'))) {
  execSync('git init && git config user.name "Mohammed Nihal" && git config user.email "nihal@antigravity.local" && git add -A && git commit -m "chore: initial Antigravity Mobile workspace"', {
    cwd: rootDir,
    stdio: 'ignore',
  });
}

const instance = await createCompanionServer({ port: 8911, authorizedRoots: [rootDir], autoTunnel: false, persistWorkspaces: false });
const base = `http://127.0.0.1:${instance.port}`;

async function api(endpoint, options = {}) {
  const res = await fetch(`${base}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  return { status: res.status, data };
}

try {
  // 1. Health & Always-Ready check
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.alwaysReadyMode, true);

  // 2. QR Pairing & Token Issuance
  const qr = await api('/api/auth/qr');
  assert.equal(qr.status, 200);
  assert.ok(qr.data.pairingCode);

  const paired = await api('/api/auth/pair', {
    method: 'POST',
    body: JSON.stringify({ pairingCode: qr.data.pairingCode, deviceName: 'Nihal iPhone 16 Pro' }),
  });
  assert.equal(paired.status, 200);
  assert.ok(paired.data.token.startsWith('agm_'));

  // 3. Model Discovery & Selection
  const models = await api('/api/models');
  assert.ok(models.data.models.length >= 3);
  const selectModel = await api('/api/models/select', {
    method: 'POST',
    body: JSON.stringify({ modelId: 'gemini-2.5-flash-antigravity', parameters: { temperature: 0.1 } }),
  });
  assert.equal(selectModel.data.selectedModelId, 'gemini-2.5-flash-antigravity');

  // 4. Agent Discovery & Task Execution with File Modification + Trace
  const taskRes = await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Create a remote health probe configuration file and verify workspace status',
      modelId: 'gemini-2.5-pro-antigravity',
      agentId: 'acp-antigravity-coder',
      executionMode: 'autonomous',
      targetFile: 'companion-service/data/agent-probe.json',
      fileContent: JSON.stringify({ verifiedBy: 'acp-antigravity-coder', timestamp: new Date().toISOString() }, null, 2),
    }),
  });
  assert.equal(taskRes.status, 200);
  assert.equal(taskRes.data.task.status, 'completed');
  assert.ok(taskRes.data.task.trace.length >= 6);

  // 5. Git Status & Diff Verification
  const gitStatus = await api('/api/git/status');
  assert.equal(gitStatus.status, 200);
  assert.equal(gitStatus.data.status.isRepo, true);

  // 6. Interactive PTY Terminal Session + Dangerous Command Interception (Approval Centre)
  const termCreate = await api('/api/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({ name: 'mobile-pty-1' }),
  });
  assert.equal(termCreate.status, 200);
  const sessionId = termCreate.data.id;

  const safeCmd = await api('/api/terminal/exec', {
    method: 'POST',
    body: JSON.stringify({ sessionId, command: 'echo "ANTIGRAVITY_PTY_READY"' }),
  });
  assert.equal(safeCmd.data.status, 'executed');

  const dangerousCmd = await api('/api/terminal/exec', {
    method: 'POST',
    body: JSON.stringify({ sessionId, command: 'rm -rf /tmp/nonexistent_test_dir' }),
  });
  assert.equal(dangerousCmd.data.status, 'pending_approval');
  assert.ok(dangerousCmd.data.approvalId);

  // 7. Resolve Pending Approval
  const resolveRes = await api('/api/approvals/resolve', {
    method: 'POST',
    body: JSON.stringify({ approvalId: dangerousCmd.data.approvalId, decision: 'reject', note: 'Blocked destructive rm -rf from mobile' }),
  });
  assert.equal(resolveRes.data.approval.status, 'rejected');

  // 8. Credential Redaction & Persistent SQLite Activity Timeline Verification
  await instance.db.recordEvent({
    project: 'security-test',
    category: 'security',
    description: 'Leaked key test AIzaSyD123456789012345678901234567890123 and Bearer secret_jwt_token_xyz',
    status: 'warning',
  });
  const activity = await api('/api/activity?limit=50');
  assert.equal(activity.status, 200);
  assert.ok(activity.data.events.length >= 8);
  const redactedEvent = activity.data.events.find((e) => e.project === 'security-test');
  assert.ok(!redactedEvent.description.includes('AIzaSyD123456'));
  assert.ok(redactedEvent.description.includes('[REDACTED_CREDENTIAL]'));

  // 9. CSV Export Verification
  const csvRes = await fetch(`${base}/api/activity?format=csv`);
  const csvText = await csvRes.text();
  assert.ok(csvText.startsWith('id,timestamp,project'));

  console.log('[Integration Test Suite] ALL 9 END-TO-END VERIFICATION CHECKS PASSED:', {
    eventsPersistedInSqlite: activity.data.events.length,
    gitBranch: gitStatus.data.status.branch,
    ptyPid: termCreate.data.pid,
    approvalTested: resolveRes.data.approval.id,
  });
} finally {
  await instance.close();
}
