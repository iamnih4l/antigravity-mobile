import { spawn } from 'node:child_process';
import path from 'node:path';
import { evaluateCommandPolicy, redactSensitiveData } from './security.mjs';

export class TerminalManager {
  constructor(workspaceManager, db, approvalCallback) {
    this.workspace = workspaceManager;
    this.db = db;
    this.approvalCallback = approvalCallback;
    this.sessions = new Map();
    this.listeners = new Set();
  }

  onOutput(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event) {
    for (const fn of this.listeners) {
      fn(event);
    }
  }

  createSession({ name = 'zsh-main', cwd = this.workspace.activeWorkspace } = {}) {
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let proc;
    if (process.platform === 'win32') {
      const shell = process.env.COMSPEC || 'powershell.exe';
      proc = spawn(shell, [], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } else {
      proc = spawn('python3', ['-u', '-c', 'import pty, os; pty.spawn(os.environ.get("SHELL", "/bin/bash"))'], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
    proc.on('error', (err) => {
      console.error(`[TerminalManager] Terminal session process error:`, err);
    });

    const session = {
      id,
      name,
      cwd,
      pid: proc.pid,
      createdAt: new Date().toISOString(),
      status: 'running',
      history: [],
      outputBuffer: '',
      proc,
    };

    const handleChunk = (chunk) => {
      const text = redactSensitiveData(chunk.toString('utf8'));
      session.outputBuffer = (session.outputBuffer + text).slice(-65536);
      this._emit({ type: 'terminal_output', sessionId: id, data: text, timestamp: new Date().toISOString() });
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);
    proc.on('exit', (code) => {
      session.status = 'exited';
      session.exitCode = code;
      this.db.recordEvent({
        project: path.basename(cwd),
        category: 'terminal',
        description: `Terminal session ${name} (${id}) exited with code ${code}`,
        status: 'completed',
        details: { sessionId: id, exitCode: code },
      });
    });

    this.sessions.set(id, session);
    this.db.recordEvent({
      project: path.basename(cwd),
      category: 'terminal',
      description: `Created interactive PTY terminal session "${name}" (PID ${proc.pid})`,
      status: 'completed',
      details: { sessionId: id, pid: proc.pid, cwd },
    });

    return {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      pid: session.pid,
      createdAt: session.createdAt,
      status: session.status,
    };
  }

  async executeCommand(sessionId, command, { approved = false } = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      throw new Error(`Terminal session ${sessionId} is not active.`);
    }

    const policy = evaluateCommandPolicy(command);
    if (policy.requiresApproval && !approved) {
      const approval = await this.approvalCallback({
        project: path.basename(session.cwd),
        category: 'terminal_command',
        operation: 'Execute restricted terminal command',
        commandOrPath: command,
        riskLevel: policy.riskLevel,
        sessionId,
      });
      return {
        status: 'pending_approval',
        approvalId: approval.id,
        reason: policy.reason,
      };
    }

    session.history.push({ command, timestamp: new Date().toISOString() });
    session.proc.stdin.write(command + '\n');

    await this.db.recordEvent({
      project: path.basename(session.cwd),
      category: 'terminal_command',
      description: `Executed command in ${session.name}: ${command}`,
      status: 'completed',
      details: { sessionId, command, pid: session.pid },
    });

    return { status: 'executed', sessionId, command };
  }

  stopProcess(sessionId, signal = 'SIGINT') {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Terminal session not found');
    if (signal === 'SIGINT') {
      session.proc.stdin.write('\x03');
    } else {
      session.proc.kill(signal);
    }
    return { sessionId, signalSent: signal };
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      name: s.name,
      cwd: s.cwd,
      pid: s.pid,
      createdAt: s.createdAt,
      status: s.status,
      history: s.history,
      recentOutput: s.outputBuffer.slice(-4096),
    }));
  }

  closeAll() {
    for (const s of this.sessions.values()) {
      try {
        s.proc.kill('SIGTERM');
      } catch {}
    }
  }
}
