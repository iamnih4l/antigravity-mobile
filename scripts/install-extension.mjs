import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extSourceDir = path.resolve(__dirname, '../ide-extension');
const pkg = JSON.parse(fs.readFileSync(path.join(extSourceDir, 'package.json'), 'utf8'));

const extId = `${pkg.publisher}.${pkg.name}`;
const folderName = `${extId}-${pkg.version}`;

const candidateRoots = [
  path.join(os.homedir(), '.antigravity-ide', 'extensions'),
  path.join(os.homedir(), '.antigravity', 'extensions'),
  path.join(os.homedir(), '.vscode', 'extensions'),
];

for (const extRoot of candidateRoots) {
  if (!fs.existsSync(extRoot)) continue;

  const targetDir = path.join(extRoot, folderName);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  fs.copyFileSync(path.join(extSourceDir, 'package.json'), path.join(targetDir, 'package.json'));
  fs.cpSync(path.join(extSourceDir, 'out'), path.join(targetDir, 'out'), { recursive: true });
  if (fs.existsSync(path.join(extSourceDir, 'node_modules'))) {
    fs.cpSync(path.join(extSourceDir, 'node_modules'), path.join(targetDir, 'node_modules'), { recursive: true });
  }

  // Register cleanly in extensions.json if present (or inside .antigravity-ide)
  const extJsonPath = path.join(extRoot, 'extensions.json');
  if (fs.existsSync(extJsonPath) || extRoot.includes('.antigravity-ide')) {
    let list = [];
    if (fs.existsSync(extJsonPath)) {
      try {
        list = JSON.parse(fs.readFileSync(extJsonPath, 'utf8'));
      } catch {
        list = [];
      }
    }
    list = list.filter((e) => e?.identifier?.id !== extId);
    const posixPath = '/' + targetDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`);
    list.push({
      identifier: { id: extId },
      version: pkg.version,
      location: {
        $mid: 1,
        path: posixPath,
        scheme: 'file',
      },
      relativeLocation: folderName,
      metadata: {
        isApplicationScoped: false,
        isMachineScoped: false,
        isBuiltin: false,
        installedTimestamp: Date.now(),
        pinned: false,
        source: 'vsix',
        publisherDisplayName: pkg.publisher,
        targetPlatform: 'universal',
      },
    });
    fs.writeFileSync(extJsonPath, JSON.stringify(list), 'utf8');
  }

  console.log(`Installed & registered ${extId}@${pkg.version} in ${targetDir}`);
}
