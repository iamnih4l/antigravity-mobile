import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extDir = path.join(repoRoot, 'ide-extension');
const companionDir = path.join(repoRoot, 'companion-service');
const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));

// 1. Compile TypeScript
console.log('1. Compiling ide-extension TypeScript...');
execSync('npx --prefix mobile-pwa tsc -p ide-extension/tsconfig.json', {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: true,
});

// 2. Stage VSIX payload in a temp directory
const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agm-vsix-'));
const extPayloadDir = path.join(stageDir, 'extension');
fs.mkdirSync(extPayloadDir, { recursive: true });

console.log('2. Copying extension files & bundled standalone companion-service...');
fs.copyFileSync(path.join(extDir, 'package.json'), path.join(extPayloadDir, 'package.json'));
if (fs.existsSync(path.join(repoRoot, 'README.md'))) {
  fs.copyFileSync(path.join(repoRoot, 'README.md'), path.join(extPayloadDir, 'README.md'));
}
if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
  fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(extPayloadDir, 'LICENSE'));
}
fs.cpSync(path.join(extDir, 'out'), path.join(extPayloadDir, 'out'), { recursive: true });

// Copy runtime node_modules (skip @types dev deps)
const srcNodeModules = path.join(extDir, 'node_modules');
const dstNodeModules = path.join(extPayloadDir, 'node_modules');
if (fs.existsSync(srcNodeModules)) {
  fs.mkdirSync(dstNodeModules, { recursive: true });
  for (const entry of fs.readdirSync(srcNodeModules)) {
    if (entry === '@types' || entry === '.bin') continue;
    fs.cpSync(path.join(srcNodeModules, entry), path.join(dstNodeModules, entry), { recursive: true });
  }
}

// Bundle clean companion-service (src/ + package.json only — zero DB/local state!)
const dstCompanion = path.join(extPayloadDir, 'companion-service');
fs.mkdirSync(dstCompanion, { recursive: true });
fs.copyFileSync(path.join(companionDir, 'package.json'), path.join(dstCompanion, 'package.json'));
fs.cpSync(path.join(companionDir, 'src'), path.join(dstCompanion, 'src'), { recursive: true });

// 3. Write VSIX metadata manifests
const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".mjs" ContentType="application/javascript"/>
  <Default Extension=".py" ContentType="text/plain"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".txt" ContentType="text/plain"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
`;

const escapeXml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(pkg.name)}" Version="${escapeXml(pkg.version)}" Publisher="${escapeXml(pkg.publisher)}"/>
    <DisplayName>${escapeXml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description)}</Description>
    <Tags>${escapeXml((pkg.keywords || []).join(','))}</Tags>
    <Categories>${escapeXml((pkg.categories || ['Other']).join(','))}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(pkg.engines?.vscode || '^1.90.0')}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="${escapeXml(pkg.repository?.url || '')}"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
  </Assets>
</PackageManifest>
`;

fs.writeFileSync(path.join(stageDir, '[Content_Types].xml'), contentTypesXml, 'utf8');
fs.writeFileSync(path.join(stageDir, 'extension.vsixmanifest'), vsixManifestXml, 'utf8');

// 4. Zip into dist/<name>-<version>.vsix
const distDir = path.join(repoRoot, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outVsix = path.join(distDir, `${pkg.name}-${pkg.version}.vsix`);
if (fs.existsSync(outVsix)) fs.unlinkSync(outVsix);

console.log(`3. Packaging ${outVsix}...`);
const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
const zipScript = `
import os, sys, zipfile
src, out_path = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, rel)
print('Packed size:', os.path.getsize(out_path), 'bytes')
`;
execFileSync(pyCmd, ['-c', zipScript, stageDir, outVsix], {
  stdio: 'inherit',
  windowsHide: true,
});

fs.rmSync(stageDir, { recursive: true, force: true });
console.log(`\nDONE! Standalone VSIX ready at:\n  ${outVsix}`);
