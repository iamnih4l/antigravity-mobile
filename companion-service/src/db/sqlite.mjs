import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { redactSensitiveData } from '../services/security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SqliteStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.workerPath = path.join(__dirname, 'sqlite_worker.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    this.proc = spawn(pythonCmd, [this.workerPath, this.dbPath], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    this.proc.on('error', (err) => {
      console.error('[SqliteStore] Worker process error:', err);
    });
    this.pending = new Map();
    this.seq = 1;

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        const handler = this.pending.get(msg.id);
        if (handler) {
          this.pending.delete(msg.id);
          if (msg.ok) handler.resolve(msg);
          else handler.reject(new Error(msg.error || 'SQLite error'));
        }
      } catch (err) {
        // Ignore malformed stdout line
      }
    });
  }

  _send(action, sql, params = []) {
    return new Promise((resolve, reject) => {
      const id = this.seq++;
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, action, sql, params }) + '\n');
    });
  }

  async exec(sql, params = []) {
    return this._send('exec', sql, params);
  }

  async query(sql, params = []) {
    const res = await this._send('query', sql, params);
    return res.rows || [];
  }

  async recordEvent(evt) {
    const safeDesc = redactSensitiveData(evt.description || '');
    const safeDetails = redactSensitiveData(JSON.stringify(evt.details || {}));
    const id = evt.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = evt.timestamp || new Date().toISOString();
    await this.exec(
      `INSERT INTO activity_events
       (id, timestamp, project, agent_id, agent_name, model_id, category, description, status, duration_ms, task_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        timestamp,
        evt.project || 'global',
        evt.agentId || null,
        evt.agentName || null,
        evt.modelId || null,
        evt.category || 'system',
        safeDesc,
        evt.status || 'info',
        evt.durationMs ?? null,
        evt.taskId || null,
        safeDetails,
      ]
    );
    return {
      id,
      timestamp,
      project: evt.project || 'global',
      agentId: evt.agentId || null,
      agentName: evt.agentName || null,
      modelId: evt.modelId || null,
      category: evt.category || 'system',
      description: safeDesc,
      status: evt.status || 'info',
      durationMs: evt.durationMs ?? null,
      taskId: evt.taskId || null,
      details: JSON.parse(safeDetails),
    };
  }

  async listEvents({ project, agentId, modelId, category, status, search, limit = 100, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    if (project && project !== 'all') {
      clauses.push('project = ?');
      params.push(project);
    }
    if (agentId && agentId !== 'all') {
      clauses.push('agent_id = ?');
      params.push(agentId);
    }
    if (modelId && modelId !== 'all') {
      clauses.push('model_id = ?');
      params.push(modelId);
    }
    if (category && category !== 'all') {
      clauses.push('category = ?');
      params.push(category);
    }
    if (status && status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    if (search) {
      clauses.push('(description LIKE ? OR details_json LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.query(
      `SELECT * FROM activity_events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      project: r.project,
      agentId: r.agent_id,
      agentName: r.agent_name,
      modelId: r.model_id,
      category: r.category,
      description: r.description,
      status: r.status,
      durationMs: r.duration_ms,
      taskId: r.task_id,
      details: JSON.parse(r.details_json || '{}'),
    }));
  }

  async applyRetentionPolicy(maxDays = 30) {
    const cutoff = new Date(Date.now() - maxDays * 86400 * 1000).toISOString();
    return this.exec(`DELETE FROM activity_events WHERE timestamp < ?`, [cutoff]);
  }

  async exportEventsCsv(filters = {}) {
    const events = await this.listEvents({ ...filters, limit: 1000 });
    const header = ['id', 'timestamp', 'project', 'agentId', 'modelId', 'category', 'status', 'durationMs', 'description'];
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(',')];
    for (const e of events) {
      lines.push(header.map((k) => escapeCsv(e[k])).join(','));
    }
    return lines.join('\n');
  }

  async saveTask(task) {
    const safePrompt = redactSensitiveData(task.prompt || '');
    const traceJson = redactSensitiveData(JSON.stringify(task.trace || []));
    await this.exec(
      `INSERT OR REPLACE INTO tasks
       (id, created_at, updated_at, project, prompt, agent_id, agent_origin, model_id, execution_mode, status, duration_ms, input_tokens, output_tokens, total_tokens, trace_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.createdAt,
        task.updatedAt || new Date().toISOString(),
        task.project,
        safePrompt,
        task.agentId,
        task.agentOrigin || 'acp',
        task.modelId,
        task.executionMode || 'autonomous',
        task.status,
        task.durationMs || 0,
        task.inputTokens ?? null,
        task.outputTokens ?? null,
        task.totalTokens ?? null,
        traceJson,
      ]
    );
  }

  async listTasks(project = null) {
    const rows = project
      ? await this.query(`SELECT * FROM tasks WHERE project = ? ORDER BY created_at DESC LIMIT 50`, [project])
      : await this.query(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50`);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      project: r.project,
      prompt: r.prompt,
      agentId: r.agent_id,
      agentOrigin: r.agent_origin,
      modelId: r.model_id,
      executionMode: r.execution_mode,
      status: r.status,
      durationMs: r.duration_ms,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens: r.total_tokens,
      trace: JSON.parse(r.trace_json || '[]'),
    }));
  }

  async saveApproval(app) {
    await this.exec(
      `INSERT OR REPLACE INTO approvals
       (id, created_at, resolved_at, project, task_id, agent_id, category, operation, command_or_path, risk_level, status, resolution_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        app.id,
        app.createdAt,
        app.resolvedAt || null,
        app.project || 'global',
        app.taskId || null,
        app.agentId || null,
        app.category,
        app.operation,
        redactSensitiveData(app.commandOrPath || ''),
        app.riskLevel || 'high',
        app.status || 'pending',
        app.resolutionNote || null,
      ]
    );
  }

  async listApprovals(status = null) {
    const rows = status
      ? await this.query(`SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC`, [status])
      : await this.query(`SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100`);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      project: r.project,
      taskId: r.task_id,
      agentId: r.agent_id,
      category: r.category,
      operation: r.operation,
      commandOrPath: r.command_or_path,
      riskLevel: r.risk_level,
      status: r.status,
      resolutionNote: r.resolution_note,
    }));
  }

  close() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
    }
  }
}
