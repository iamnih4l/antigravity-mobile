import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const targets = [
  path.join(home, '.antigravity', 'extensions', 'antigravity-mobile-bridge'),
  path.join(home, '.vscode', 'extensions', 'antigravity-mobile-bridge'),
];

const sourceDir = path.resolve(process.cwd(), 'ide-extension');

console.log('[Antigravity Mobile] Installing extension from:', sourceDir);

for (const target of targets) {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Remove if exists
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.cpSync(sourceDir, target, { recursive: true });
    console.log('[Antigravity Mobile] Successfully installed into:', target);
  } catch (err) {
    console.warn('[Antigravity Mobile] Could not install to:', target, err.message);
  }
}

console.log('\n[Antigravity Mobile] Extension is now globally active in Antigravity IDE across ALL projects!');
console.log('Every time you open Antigravity IDE, the companion daemon will auto-start and bind your active workspace.');
