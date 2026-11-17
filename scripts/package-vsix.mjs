import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extDir = path.join(repoRoot, 'ide-extension');
const companionDir = path.join(repoRoot, 'companion-service');
const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));

const tempCompanion = path.join(extDir, 'companion-service');
const tempReadme = path.join(extDir, 'README.md');
const tempLicense = path.join(extDir, 'LICENSE');

try {
  // 1. Compile TypeScript
  console.log('1. Compiling ide-extension TypeScript...');
  execSync('npx --prefix mobile-pwa tsc -p ide-extension/tsconfig.json', {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });

  // 2. Stage bundled standalone companion-service + README + LICENSE inside ide-extension/
  console.log('2. Bundling standalone companion-service + docs...');
  if (fs.existsSync(tempCompanion)) fs.rmSync(tempCompanion, { recursive: true, force: true });
  fs.mkdirSync(tempCompanion, { recursive: true });
  fs.copyFileSync(path.join(companionDir, 'package.json'), path.join(tempCompanion, 'package.json'));
  fs.cpSync(path.join(companionDir, 'src'), path.join(tempCompanion, 'src'), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'README.md'), tempReadme);
  fs.copyFileSync(path.join(repoRoot, 'LICENSE'), tempLicense);

  // 3. Package using official @vscode/vsce (100% Open VSX & VS Code Marketplace compliant)
  const distDir = path.join(repoRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outVsix = path.join(distDir, `${pkg.name}-${pkg.version}.vsix`);
  if (fs.existsSync(outVsix)) fs.unlinkSync(outVsix);

  console.log(`3. Packaging official VSIX with @vscode/vsce -> ${outVsix}...`);
  execSync(`npx --yes @vscode/vsce package -o "${outVsix}"`, {
    cwd: extDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  console.log(`\nDONE! Official Open VSX-ready VSIX built at:\n  ${outVsix}`);
} finally {
  // Clean temporary staged files inside ide-extension/
  if (fs.existsSync(tempCompanion)) fs.rmSync(tempCompanion, { recursive: true, force: true });
  if (fs.existsSync(tempReadme)) fs.rmSync(tempReadme, { force: true });
  if (fs.existsSync(tempLicense)) fs.rmSync(tempLicense, { force: true });
}
