import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function findCloudflaredBinary() {
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
  for (const c of ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared']) {
    if (fs.existsSync(c)) return c;
  }
  return 'cloudflared';
}

export class CloudflareTunnelManager {
  constructor({ port = 8787, statePath, autoStart = true } = {}) {
    this.port = port;
    this.statePath = statePath;
    this.autoStart = autoStart;
    this.proc = null;
    this.url = null;
    this.startedAt = null;
    this.status = 'stopped'; // 'stopped' | 'starting' | 'online' | 'error'
    this.lastError = null;
    this.startPromise = null;
    this.isStopping = false;

    if (this.autoStart) {
      this.start().catch(() => {});
    }
  }

  getStatus() {
    return {
      status: this.status,
      active: this.status === 'online' && Boolean(this.url),
      url: this.url,
      pid: this.proc?.pid || null,
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }

  _writeState() {
    if (!this.statePath || !this.url) return;
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(
        this.statePath,
        JSON.stringify(
          {
            url: this.url,
            pid: this.proc?.pid || null,
            startedAt: this.startedAt,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // Ignore state write failures
    }
  }

  async start() {
    if (this.status === 'online' && this.url && this.proc && !this.proc.killed) {
      return this.getStatus();
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.isStopping = false;
    this.status = 'starting';
    this.lastError = null;

    const bin = findCloudflaredBinary();
    const localUrl = `http://127.0.0.1:${this.port}`;

    this.startPromise = new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.startPromise = null;
        resolve(this.getStatus());
      };

      const timeout = setTimeout(() => {
        if (this.status === 'starting') {
          this.status = 'error';
          this.lastError = 'Timed out waiting for Cloudflare quick tunnel URL';
        }
        done();
      }, 25000);

      try {
        const proc = spawn(bin, ['tunnel', '--url', localUrl], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.proc = proc;

        const onData = (chunk) => {
          const text = chunk.toString('utf8');
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
          if (match && !this.url) {
            this.url = match[0];
            this.startedAt = new Date().toISOString();
            this.status = 'online';
            this.lastError = null;
            this._writeState();
            clearTimeout(timeout);
            console.log(`[Antigravity Mobile Tunnel] Live at ${this.url}`);
            done();
          }
        };

        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);

        proc.on('error', (err) => {
          this.status = 'error';
          this.lastError = `Failed to launch cloudflared (${err.message})`;
          clearTimeout(timeout);
          done();
        });

        proc.on('exit', (code) => {
          if (this.proc === proc) {
            this.proc = null;
            this.url = null;
            this.status = 'stopped';
            if (!this.isStopping && this.autoStart) {
              this.lastError = `cloudflared exited with code ${code}; retrying in 5s`;
              setTimeout(() => {
                if (!this.isStopping && !this.proc) {
                  this.start().catch(() => {});
                }
              }, 5000);
            }
          }
          clearTimeout(timeout);
          done();
        });
      } catch (err) {
        this.status = 'error';
        this.lastError = err.message;
        clearTimeout(timeout);
        done();
      }
    });

    return this.startPromise;
  }

  async restart() {
    this.stop();
    await new Promise((r) => setTimeout(r, 400));
    return this.start();
  }

  stop() {
    this.isStopping = true;
    this.url = null;
    this.status = 'stopped';
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        // Ignore
      }
      this.proc = null;
    }
  }
}
