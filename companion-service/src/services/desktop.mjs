import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIN_HELPER_PATH = path.join(__dirname, 'win_desktop_helper.py');

export class DesktopController {
  constructor(db, options = {}) {
    this.db = db;
    this.enableHelper = options.enableHelper !== false;
    this.streaming = false;
    this.resolution = { width: 1920, height: 1080 };
    this.activeWindow = 'Google Antigravity IDE';
    this.windows = [];
    this.cursor = { x: 960, y: 540 };
    this.lastInputAt = null;
    this.lastError = null;

    this._proc = null;
    this._buffer = '';
    this._reqSeq = 1;
    this._pending = new Map();
  }

  _ensureWindowsHelper() {
    if (process.platform !== 'win32' || !this.enableHelper) return null;
    if (this._proc && !this._proc.killed) return this._proc;

    const proc = spawn('python', [WIN_HELPER_PATH], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._proc = proc;

    proc.stdout.on('data', (chunk) => {
      this._buffer += chunk.toString('utf8');
      let nl;
      while ((nl = this._buffer.indexOf('\n')) !== -1) {
        const line = this._buffer.slice(0, nl).trim();
        this._buffer = this._buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const pending = this._pending.get(msg.id);
          if (pending) {
            this._pending.delete(msg.id);
            clearTimeout(pending.timer);
            if (msg.ok) pending.resolve(msg);
            else pending.reject(new Error(msg.error || 'Desktop helper error'));
          }
        } catch {
          // Ignore malformed stdout line
        }
      }
    });

    proc.on('exit', () => {
      if (this._proc === proc) this._proc = null;
      for (const [id, pending] of this._pending.entries()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Desktop helper process exited'));
        this._pending.delete(id);
      }
    });

    proc.on('error', (err) => {
      this.lastError = err.message;
      if (this._proc === proc) this._proc = null;
    });

    return proc;
  }

  _callHelper(payload, timeoutMs = 8000) {
    const proc = this._ensureWindowsHelper();
    if (!proc) {
      return Promise.reject(new Error('Windows desktop helper unavailable on this platform'));
    }
    const id = this._reqSeq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Desktop command "${payload.cmd}" timed out`));
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, timer });
      try {
        proc.stdin.write(JSON.stringify({ ...payload, id }) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  async getStatusAsync() {
    if (process.platform === 'win32' && this.enableHelper) {
      try {
        const res = await this._callHelper({ cmd: 'status' }, 4000);
        if (res.screenWidth && res.screenHeight) {
          this.resolution = { width: res.screenWidth, height: res.screenHeight };
        }
        if (res.activeWindow) this.activeWindow = res.activeWindow;
        if (Array.isArray(res.windows)) this.windows = res.windows;
        this.lastError = null;
      } catch (err) {
        this.lastError = err.message;
      }
    }
    return this.getStatus();
  }

  getStatus() {
    return {
      available: true,
      supported: true,
      streaming: this.streaming,
      hostOs: `${os.platform()} ${os.release()}`,
      resolution: this.resolution,
      screenResolution: this.resolution,
      activeWindow: this.activeWindow,
      windows: this.windows,
      cursor: this.cursor,
      lastInputAt: this.lastInputAt,
      lastError: this.lastError,
      mode: process.platform === 'win32'
        ? 'Live Windows Screen Capture + Win32 HID & Clipboard Bridge'
        : 'Companion Screen Stream + HID Input Bridge',
      transport: 'Live JPEG Frame Stream + Native Win32 HID Input Bridge',
    };
  }

  async listWindows() {
    if (process.platform === 'win32' && this.enableHelper) {
      const res = await this._callHelper({ cmd: 'windows' }, 4000);
      this.windows = Array.isArray(res.windows) ? res.windows : [];
      if (res.activeWindow) this.activeWindow = res.activeWindow;
    }
    return { windows: this.windows, activeWindow: this.activeWindow };
  }

  async captureFrame({ maxWidth = 1280, quality = 70 } = {}) {
    if (process.platform !== 'win32' || !this.enableHelper) {
      throw new Error('Live JPEG frame capture is currently configured for Windows hosts');
    }
    const res = await this._callHelper({ cmd: 'capture', maxWidth, quality }, 8000);
    this.streaming = true;
    this.resolution = { width: res.screenWidth, height: res.screenHeight };
    if (res.activeWindow) this.activeWindow = res.activeWindow;
    this.lastError = null;
    return {
      buffer: Buffer.from(res.jpegBase64, 'base64'),
      screenWidth: res.screenWidth,
      screenHeight: res.screenHeight,
      frameWidth: res.frameWidth,
      frameHeight: res.frameHeight,
      activeWindow: this.activeWindow,
    };
  }

  async handleInput(event) {
    this.lastInputAt = new Date().toISOString();
    const action = event.action || event.type || 'click';
    const { x, y, key, shortcut, text, hwnd, windowTitle, button = 'left', delta, submit } = event;

    if (typeof x === 'number' && typeof y === 'number') {
      this.cursor = {
        x: Math.max(0, Math.min(this.resolution.width, Math.round(x))),
        y: Math.max(0, Math.min(this.resolution.height, Math.round(y))),
      };
    }

    if (process.platform === 'win32' && this.enableHelper) {
      if (action === 'click' || action === 'double_click' || action === 'right_click') {
        const res = await this._callHelper({
          cmd: 'click',
          x: this.cursor.x,
          y: this.cursor.y,
          button: action === 'right_click' ? 'right' : button,
          double: action === 'double_click',
        });
        if (res.activeWindow) this.activeWindow = res.activeWindow;
      } else if (action === 'scroll') {
        await this._callHelper({
          cmd: 'scroll',
          x: typeof x === 'number' ? this.cursor.x : null,
          y: typeof y === 'number' ? this.cursor.y : null,
          delta: typeof delta === 'number' ? delta : -360,
        });
      } else if (action === 'shortcut' || action === 'key') {
        const res = await this._callHelper({ cmd: 'shortcut', shortcut: shortcut || key });
        if (res.activeWindow) this.activeWindow = res.activeWindow;
      } else if (action === 'type_text' || action === 'type') {
        if (typeof text === 'string' && text.length > 0) {
          const res = await this._callHelper({ cmd: 'type_text', text, submit: Boolean(submit) });
          if (res.activeWindow) this.activeWindow = res.activeWindow;
        }
      } else if (action === 'focus_window' && hwnd) {
        const res = await this._callHelper({ cmd: 'focus_window', hwnd });
        if (res.activeWindow) this.activeWindow = res.activeWindow;
      }
    } else if (process.platform === 'linux') {
      try {
        if (action === 'click') {
          execSync(`command -v xdotool >/dev/null && xdotool mousemove ${this.cursor.x} ${this.cursor.y} click 1`, { stdio: 'ignore' });
        } else if ((action === 'type' || action === 'type_text') && text) {
          const safe = text.replace(/"/g, '\\"');
          execSync(`command -v xdotool >/dev/null && xdotool type -- "${safe}"`, { stdio: 'ignore' });
        }
      } catch {
        // Ignore headless linux fallback
      }
    }

    if (action === 'window_switch' && windowTitle) {
      this.activeWindow = windowTitle;
    }

    await this.db.recordEvent({
      project: 'desktop',
      category: 'desktop_input',
      description: `Remote Desktop: ${action}${shortcut || key ? ` (${shortcut || key})` : ''}${windowTitle ? ` -> ${windowTitle}` : ''}`,
      status: 'completed',
      details: { action, cursor: this.cursor, button, shortcut: shortcut || key, hwnd },
    });

    return this.getStatus();
  }

  close() {
    if (this._proc) {
      try {
        this._proc.kill();
      } catch {
        // Ignore
      }
      this._proc = null;
    }
  }
}
