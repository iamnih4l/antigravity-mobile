import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SqliteStore } from './db/sqlite.mjs';
import { SecurityManager } from './services/security.mjs';
import { WorkspaceManager } from './services/workspace.mjs';
import { GitManager } from './services/git.mjs';
import { TerminalManager } from './services/terminal.mjs';
import { AcpAndModelManager } from './services/acp-bridge.mjs';
import { DesktopController } from './services/desktop.mjs';
import { CloudflareTunnelManager } from './services/tunnel.mjs';
import { runEnvironmentDiscovery } from '../../scripts/discover-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createCompanionServer({
  port = Number(process.env.PORT || 8787),
  dbPath = path.join(__dirname, '../data/antigravity-mobile.db'),
  authorizedRoots = [path.resolve(__dirname, '../..')],
  autoTunnel = process.env.DISABLE_AUTO_TUNNEL !== '1',
} = {}) {
  const db = new SqliteStore(dbPath);
  const security = new SecurityManager(db, { authorizedRoots });
  const workspace = new WorkspaceManager(security, db);
  const git = new GitManager(workspace, db);
  const desktop = new DesktopController(db);
  const tunnel = new CloudflareTunnelManager({
    port,
    statePath: path.join(path.dirname(dbPath), 'tunnel-state.json'),
    autoStart: autoTunnel,
  });
  const wsClients = new Set();

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const sock of wsClients) {
      try {
        sendWsFrame(sock, data);
      } catch {
        wsClients.delete(sock);
      }
    }
  }

  async function createApprovalRequest(req) {
    const approval = {
      id: `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      project: req.project || path.basename(workspace.activeWorkspace),
      taskId: req.taskId || null,
      agentId: req.agentId || null,
      category: req.category || 'permission',
      operation: req.operation,
      commandOrPath: req.commandOrPath,
      riskLevel: req.riskLevel || 'high',
      status: 'pending',
    };
    await db.saveApproval(approval);
    await db.recordEvent({
      project: approval.project,
      agentId: approval.agentId,
      taskId: approval.taskId,
      category: 'permission_request',
      description: `Pending approval: ${approval.operation} (${approval.commandOrPath})`,
      status: 'pending_approval',
      details: approval,
    });
    broadcast({ type: 'approval_requested', approval });
    return approval;
  }

  const terminal = new TerminalManager(workspace, db, createApprovalRequest);
  terminal.onOutput((evt) => broadcast(evt));

  const acp = new AcpAndModelManager(workspace, db, createApprovalRequest, broadcast);

  // Record startup event
  await db.recordEvent({
    project: path.basename(workspace.activeWorkspace),
    category: 'system',
    description: 'Antigravity Mobile Companion Service started in Always-Ready Mode',
    status: 'completed',
    details: { hostname: os.hostname(), pid: process.pid },
  });

  function sendJson(res, status, obj) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(obj));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) reject(new Error('Payload too large'));
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('Invalid JSON payload'));
        }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    if (!security.checkRateLimit(req.socket.remoteAddress || 'local')) {
      return sendJson(res, 429, { error: 'Rate limit exceeded' });
    }

    try {
      // Unauthenticated bootstrap endpoints: health & QR pairing
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'online',
          alwaysReadyMode: true,
          uptimeSeconds: Math.floor(process.uptime()),
          ideConnected: acp.ideConnected,
          activeWorkspace: workspace.activeWorkspace,
          tunnelUrl: tunnel.url,
          tunnelStatus: tunnel.status,
          timestamp: new Date().toISOString(),
        });
      }

      if (pathname === '/api/tunnel' && req.method === 'GET') {
        if (!tunnel.url && tunnel.status === 'stopped' && autoTunnel) {
          tunnel.start().catch(() => {});
        }
        return sendJson(res, 200, tunnel.getStatus());
      }

      if (pathname === '/api/tunnel/restart' && req.method === 'POST') {
        const status = await tunnel.restart();
        return sendJson(res, 200, status);
      }

      if (pathname === '/api/auth/qr' && req.method === 'GET') {
        const qr = security.generatePairingQrPayload(`http://${req.headers.host || '127.0.0.1:' + port}`);
        return sendJson(res, 200, qr);
      }

      if (pathname === '/api/auth/pair' && req.method === 'POST') {
        const body = await readBody(req);
        const session = await security.pairDevice({
          pairingCode: body.pairingCode,
          deviceName: body.deviceName,
          clientIp: req.socket.remoteAddress,
        });
        return sendJson(res, 200, session);
      }

      if (pathname === '/api/discovery' && req.method === 'GET') {
        return sendJson(res, 200, runEnvironmentDiscovery());
      }

      if (pathname === '/api/models' && req.method === 'GET') {
        return sendJson(res, 200, acp.discoverModels());
      }

      if (pathname === '/api/models/select' && req.method === 'POST') {
        const body = await readBody(req);
        const result = await acp.selectModel(body.modelId, body.parameters, body.scope);
        broadcast({ type: 'model_selected', ...result });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/agents' && req.method === 'GET') {
        return sendJson(res, 200, acp.discoverAgents());
      }

      if (pathname === '/api/agents/select' && req.method === 'POST') {
        const body = await readBody(req);
        const result = await acp.selectAgent(body.agentId);
        broadcast({ type: 'agent_selected', ...result });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/tasks' && req.method === 'GET') {
        const tasks = await db.listTasks(url.searchParams.get('project'));
        return sendJson(res, 200, { tasks });
      }

      if (pathname === '/api/tasks' && req.method === 'POST') {
        const body = await readBody(req);
        const task = await acp.startTask(body);
        return sendJson(res, 200, { task });
      }

      if (pathname === '/api/tasks/cancel' && req.method === 'POST') {
        const body = await readBody(req);
        const task = await acp.cancelTask(body.taskId);
        return sendJson(res, 200, { task });
      }

      if (pathname === '/api/activity' && req.method === 'GET') {
        const format = url.searchParams.get('format');
        const filters = {
          project: url.searchParams.get('project'),
          agentId: url.searchParams.get('agentId'),
          modelId: url.searchParams.get('modelId'),
          category: url.searchParams.get('category'),
          status: url.searchParams.get('status'),
          search: url.searchParams.get('search'),
          limit: url.searchParams.get('limit') || 100,
        };
        if (format === 'csv') {
          const csv = await db.exportEventsCsv(filters);
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="antigravity-activity.csv"',
          });
          return res.end(csv);
        }
        const events = await db.listEvents(filters);
        return sendJson(res, 200, { events });
      }

      if (pathname === '/api/workspaces' && req.method === 'GET') {
        return sendJson(res, 200, {
          activeWorkspace: workspace.activeWorkspace,
          workspaces: workspace.listWorkspaces(),
          discoveredProjects: workspace.discoverProjects(),
          homeDir: workspace.homeDir,
        });
      }

      if (pathname === '/api/workspaces/browse' && req.method === 'GET') {
        const targetDir = url.searchParams.get('dir') || '';
        const browseRes = await workspace.browseDirectory(targetDir);
        return sendJson(res, 200, browseRes);
      }

      if ((pathname === '/api/workspaces/select' || pathname === '/api/workspaces/open') && req.method === 'POST') {
        const body = await readBody(req);
        const resSwitch = await workspace.openWorkspace(body.workspace || body.path);
        broadcast({ type: 'workspace_selected', ...resSwitch });
        return sendJson(res, 200, resSwitch);
      }

      if (pathname === '/api/files' && req.method === 'GET') {
        const dir = url.searchParams.get('dir') || '.';
        const file = url.searchParams.get('file');
        if (file) {
          return sendJson(res, 200, await workspace.readFile(file));
        }
        return sendJson(res, 200, await workspace.listDirectory(dir));
      }

      if (pathname === '/api/files' && req.method === 'POST') {
        const body = await readBody(req);
        const resWrite = await workspace.writeFile(body.path, body.content, {
          origin: body.origin || 'manual',
          agentId: body.agentId || null,
        });
        broadcast({ type: 'file_changed', ...resWrite });
        return sendJson(res, 200, resWrite);
      }

      if (pathname === '/api/files/diff' && req.method === 'GET') {
        return sendJson(res, 200, workspace.getFileDiff(url.searchParams.get('path')));
      }

      if (pathname === '/api/git/status' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: git.getStatus(),
          commits: git.getCommitHistory(15),
        });
      }

      if (pathname === '/api/git/diff' && req.method === 'GET') {
        return sendJson(res, 200, git.getDiff(url.searchParams.get('file'), url.searchParams.get('staged') === 'true'));
      }

      if (pathname === '/api/git/action' && req.method === 'POST') {
        const body = await readBody(req);
        if (body.action === 'stage') return sendJson(res, 200, await git.stageFile(body.file));
        if (body.action === 'unstage') return sendJson(res, 200, await git.unstageFile(body.file));
        if (body.action === 'commit') return sendJson(res, 200, await git.commit(body.message));
        if (body.action === 'checkout') return sendJson(res, 200, await git.switchBranch(body.branch, body.create));
        throw new Error(`Unsupported Git action: ${body.action}`);
      }

      if (pathname === '/api/terminal/sessions' && req.method === 'GET') {
        return sendJson(res, 200, { sessions: terminal.listSessions() });
      }

      if (pathname === '/api/terminal/sessions' && req.method === 'POST') {
        const body = await readBody(req);
        return sendJson(res, 200, terminal.createSession(body));
      }

      if (pathname === '/api/terminal/exec' && req.method === 'POST') {
        const body = await readBody(req);
        return sendJson(res, 200, await terminal.executeCommand(body.sessionId, body.command, { approved: Boolean(body.approved) }));
      }

      if (pathname === '/api/terminal/signal' && req.method === 'POST') {
        const body = await readBody(req);
        return sendJson(res, 200, terminal.stopProcess(body.sessionId, body.signal));
      }

      if (pathname === '/api/approvals' && req.method === 'GET') {
        const approvals = await db.listApprovals(url.searchParams.get('status'));
        return sendJson(res, 200, { approvals });
      }

      if (pathname === '/api/approvals/resolve' && req.method === 'POST') {
        const body = await readBody(req);
        const all = await db.listApprovals();
        const target = all.find((a) => a.id === body.approvalId);
        if (!target) throw new Error('Approval request not found');
        target.status = body.decision === 'approve' ? 'approved' : 'rejected';
        target.resolvedAt = new Date().toISOString();
        target.resolutionNote = body.note || `Resolved via Mobile Approval Centre (${target.status})`;
        await db.saveApproval(target);
        await db.recordEvent({
          project: target.project,
          agentId: target.agentId,
          taskId: target.taskId,
          category: target.status === 'approved' ? 'approval_granted' : 'approval_rejected',
          description: `${target.status === 'approved' ? 'Approved' : 'Rejected'} ${target.operation}: ${target.commandOrPath}`,
          status: target.status,
          details: target,
        });
        broadcast({ type: 'approval_resolved', approval: target });
        return sendJson(res, 200, { approval: target });
      }

      if (pathname === '/api/desktop' && req.method === 'GET') {
        return sendJson(res, 200, desktop.getStatus());
      }

      if (pathname === '/api/desktop/input' && req.method === 'POST') {
        const body = await readBody(req);
        return sendJson(res, 200, await desktop.handleInput(body));
      }

      return sendJson(res, 404, { error: `Unknown endpoint: ${pathname}` });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });

  // RFC 6455 WebSocket upgrade support for /ws/mobile and /ws/ide
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    wsClients.add(socket);
    sendWsFrame(socket, JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));

    socket.on('data', async (buf) => {
      const msg = parseWsFrame(buf);
      if (!msg) return;
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'ide_telemetry') {
          acp.registerIdeTelemetry(parsed);
          await db.recordEvent({
            project: parsed.project || path.basename(workspace.activeWorkspace),
            category: 'ide_event',
            description: parsed.description || 'Received live Antigravity IDE telemetry update',
            status: 'completed',
            details: parsed,
          });
          broadcast({ type: 'ide_telemetry', data: parsed });
        }
      } catch {}
    });

    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });

  function sendWsFrame(socket, text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, payload]));
  }

  function parseWsFrame(buf) {
    if (buf.length < 2) return null;
    const masked = (buf[1] & 0x80) !== 0;
    let payloadLen = buf[1] & 0x7f;
    let offset = 2;
    if (payloadLen === 126) {
      payloadLen = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      payloadLen = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    const payload = Buffer.alloc(payloadLen);
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      offset += 4;
      for (let i = 0; i < payloadLen && offset + i < buf.length; i++) {
        payload[i] = buf[offset + i] ^ mask[i % 4];
      }
    } else {
      buf.copy(payload, 0, offset, offset + payloadLen);
    }
    return payload.toString('utf8');
  }

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    port,
    server,
    db,
    security,
    workspace,
    git,
    terminal,
    acp,
    desktop,
    tunnel,
    close: async () => {
      tunnel.stop();
      terminal.closeAll();
      db.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createCompanionServer().then(({ port }) => {
    console.log(`[Antigravity Mobile Companion] Listening on http://127.0.0.1:${port}`);
  });
}
