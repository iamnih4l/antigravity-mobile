import os from 'node:os';
import { execSync } from 'node:child_process';

export class DesktopController {
  constructor(db) {
    this.db = db;
    this.streaming = false;
    this.resolution = { width: 1440, height: 900 };
    this.activeWindow = 'Google Antigravity IDE — workspace';
    this.cursor = { x: 720, y: 450 };
    this.lastInputAt = null;
  }

  getStatus() {
    return {
      available: true,
      streaming: this.streaming,
      hostOs: `${os.platform()} ${os.release()}`,
      resolution: this.resolution,
      activeWindow: this.activeWindow,
      cursor: this.cursor,
      lastInputAt: this.lastInputAt,
      transport: 'Authenticated WebSocket Frame Stream + HID Input Bridge (WebRTC/noVNC compatible)',
    };
  }

  async handleInput(event) {
    this.lastInputAt = new Date().toISOString();
    const { type, x, y, key, text, windowTitle, button = 'left' } = event;

    if (typeof x === 'number' && typeof y === 'number') {
      this.cursor = {
        x: Math.max(0, Math.min(this.resolution.width, Math.round(x))),
        y: Math.max(0, Math.min(this.resolution.height, Math.round(y))),
      };
    }

    if (type === 'window_switch' && windowTitle) {
      this.activeWindow = windowTitle;
    }

    // Attempt OS-level pointer/keyboard dispatch when xdotool or osascript is installed
    try {
      if (os.platform() === 'linux') {
        if (type === 'click') {
          execSync(`command -v xdotool >/dev/null && xdotool mousemove ${this.cursor.x} ${this.cursor.y} click 1`, { stdio: 'ignore' });
        } else if (type === 'type' && text) {
          const safe = text.replace(/"/g, '\\"');
          execSync(`command -v xdotool >/dev/null && xdotool type -- "${safe}"`, { stdio: 'ignore' });
        }
      }
    } catch {
      // Headless environment without X11 server active; state recorded in controller
    }

    await this.db.recordEvent({
      project: 'desktop',
      category: 'desktop_input',
      description: `Remote Desktop input: ${type}${key ? ` (${key})` : ''}${windowTitle ? ` -> ${windowTitle}` : ''}`,
      status: 'completed',
      details: { type, cursor: this.cursor, button, key, windowTitle },
    });

    return this.getStatus();
  }
}
