import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'pubspec.yaml',
  'Makefile',
  'docker-compose.yml',
];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.cache',
  'AppData',
  'Application Data',
  'Local Settings',
  'Cookies',
  'NetHood',
  'PrintHood',
  'Recent',
  'SendTo',
  'Start Menu',
  'Templates',
  '__pycache__',
  '.venv',
  'venv',
]);

export class WorkspaceManager {
  constructor(security, db, options = {}) {
    this.security = security;
    this.db = db;
    this.homeDir = path.resolve(os.homedir());
    this.persistWorkspaces = options.persistWorkspaces !== false;
    this.storePath = options.storePath || path.resolve(path.dirname(db.dbPath), 'workspaces.json');
    this.activeWorkspace = Array.from(this.security.authorizedRoots)[0];
    this.fileOriginLedger = new Map(); // filePath -> { origin: 'agent' | 'manual', agentId, timestamp }
    this.onChangeCallback = options.onChange || null;
    this._watcher = null;
    this._debounceTimers = new Map();
    if (this.persistWorkspaces) {
      this._loadPersistedWorkspaces();
    }
  }

  startWatching(onChangeCallback) {
    if (onChangeCallback) this.onChangeCallback = onChangeCallback;
    this.stopWatching();

    if (!this.activeWorkspace || !fsSync.existsSync(this.activeWorkspace)) return;
    const watchedRoot = this.activeWorkspace;
    const projectName = path.basename(watchedRoot);

    try {
      this._watcher = fsSync.watch(watchedRoot, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const normalized = String(filename).replace(/\\/g, '/');

        // Detect Git index/HEAD updates as live git_changed events
        if (normalized === '.git/HEAD' || normalized === '.git/index' || normalized.startsWith('.git/refs/')) {
          const gitKey = '__git__';
          if (this._debounceTimers.has(gitKey)) clearTimeout(this._debounceTimers.get(gitKey));
          this._debounceTimers.set(
            gitKey,
            setTimeout(() => {
              this._debounceTimers.delete(gitKey);
              this.onChangeCallback?.({
                type: 'git_changed',
                workspace: watchedRoot,
                project: projectName,
                timestamp: new Date().toISOString(),
              });
            }, 800)
          );
          return;
        }

        // Ignore noisy build/cache/db paths
        const parts = normalized.split('/');
        if (
          parts.some((p) => IGNORED_DIRS.has(p) || p === '.git' || p === 'dist' || p === 'build' || p === 'out') ||
          normalized.endsWith('.db-wal') ||
          normalized.endsWith('.db-shm') ||
          normalized.endsWith('.db-journal') ||
          normalized.endsWith('.db') ||
          normalized.endsWith('tunnel-state.json') ||
          normalized.endsWith('workspaces.json')
        ) {
          return;
        }

        if (this._debounceTimers.has(normalized)) {
          clearTimeout(this._debounceTimers.get(normalized));
        }

        this._debounceTimers.set(
          normalized,
          setTimeout(async () => {
            this._debounceTimers.delete(normalized);
            const fullPath = path.join(watchedRoot, normalized);
            const exists = fsSync.existsSync(fullPath);

            // Track recent live workspace modification
            this.fileOriginLedger.set(fullPath, {
              origin: 'workspace_live',
              agentId: null,
              timestamp: new Date().toISOString(),
            });

            try {
              await this.db.recordEvent({
                project: projectName,
                category: 'file_modified',
                description: `${exists ? 'Live change' : 'Removed'} ${normalized} in ${projectName}`,
                status: 'completed',
                details: { path: normalized, workspace: watchedRoot, eventType, exists },
              });
            } catch {
              // Ignore DB write error during close
            }

            this.onChangeCallback?.({
              type: 'file_changed',
              path: normalized,
              workspace: watchedRoot,
              project: projectName,
              eventType,
              exists,
              timestamp: new Date().toISOString(),
            });
          }, 600)
        );
      });

      this._watcher.on('error', () => {
        // Ignore transient OS watch errors
      });
    } catch {
      // Recursive fs.watch fallback if unsupported on a specific path
    }
  }

  stopWatching() {
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
    if (this._watcher) {
      try {
        this._watcher.close();
      } catch {
        // Ignore
      }
      this._watcher = null;
    }
  }

  _loadPersistedWorkspaces() {
    try {
      if (fsSync.existsSync(this.storePath)) {
        const raw = JSON.parse(fsSync.readFileSync(this.storePath, 'utf8'));
        if (Array.isArray(raw.workspaces)) {
          for (const ws of raw.workspaces) {
            if (typeof ws === 'string' && fsSync.existsSync(ws)) {
              this.security.addAuthorizedWorkspace(ws);
            }
          }
        }
        if (typeof raw.activeWorkspace === 'string' && fsSync.existsSync(raw.activeWorkspace)) {
          this.security.addAuthorizedWorkspace(raw.activeWorkspace);
          this.activeWorkspace = path.resolve(raw.activeWorkspace);
        }
      }
    } catch {
      // Ignore corrupt workspace cache
    }
  }

  _persistWorkspaces() {
    try {
      const payload = {
        activeWorkspace: this.activeWorkspace,
        workspaces: Array.from(this.security.authorizedRoots),
        updatedAt: new Date().toISOString(),
      };
      fsSync.writeFileSync(this.storePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Ignore write failures
    }
  }

  _isWithinUserHomeOrAuthorized(targetPath) {
    const resolved = path.resolve(targetPath);
    const normResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const normHome = process.platform === 'win32' ? this.homeDir.toLowerCase() : this.homeDir;
    if (normResolved === normHome || normResolved.startsWith(normHome + path.sep)) {
      return true;
    }
    for (const root of this.security.authorizedRoots) {
      const normRoot = process.platform === 'win32' ? root.toLowerCase() : root;
      if (normResolved === normRoot || normResolved.startsWith(normRoot + path.sep)) {
        return true;
      }
    }
    return false;
  }

  _detectProjectType(dirPath) {
    for (const marker of PROJECT_MARKERS) {
      if (fsSync.existsSync(path.join(dirPath, marker))) {
        return marker;
      }
    }
    return null;
  }

  discoverProjects() {
    const candidateParents = [
      path.dirname(this.activeWorkspace),
      path.join(this.homeDir, 'OneDrive', 'Desktop'),
      path.join(this.homeDir, 'Desktop'),
      path.join(this.homeDir, 'Projects'),
      path.join(this.homeDir, 'projects'),
      path.join(this.homeDir, 'dev'),
      path.join(this.homeDir, 'code'),
      path.join(this.homeDir, 'repos'),
      path.join(this.homeDir, 'Documents'),
    ];

    const seen = new Set();
    const discovered = [];

    for (const parent of candidateParents) {
      const resolvedParent = path.resolve(parent);
      const key = process.platform === 'win32' ? resolvedParent.toLowerCase() : resolvedParent;
      if (seen.has(key) || !fsSync.existsSync(resolvedParent)) continue;
      seen.add(key);

      try {
        const entries = fsSync.readdirSync(resolvedParent, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(resolvedParent, entry.name);
          const itemKey = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
          if (seen.has(itemKey)) continue;

          const marker = this._detectProjectType(fullPath);
          const isGitRepo = fsSync.existsSync(path.join(fullPath, '.git'));
          // Include directories on Desktop/Projects/sibling folders or any directory with a project marker
          const isDevParent =
            resolvedParent.toLowerCase().endsWith('desktop') ||
            resolvedParent.toLowerCase().endsWith('projects') ||
            resolvedParent.toLowerCase().endsWith('dev') ||
            resolvedParent.toLowerCase().endsWith('code') ||
            resolvedParent.toLowerCase().endsWith('repos') ||
            resolvedParent === path.dirname(this.activeWorkspace);

          if (marker || isGitRepo || isDevParent) {
            seen.add(itemKey);
            discovered.push({
              path: fullPath,
              name: entry.name,
              parentName: path.basename(resolvedParent),
              isGitRepo,
              marker: marker || 'folder',
              active: path.resolve(fullPath) === path.resolve(this.activeWorkspace),
            });
          }
        }
      } catch {
        // Ignore unreadable system dirs
      }
    }

    // Sort: active first, then git repos, then project markers, then alphabetical
    discovered.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
      if ((a.marker !== 'folder') !== (b.marker !== 'folder')) return a.marker !== 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return discovered.slice(0, 60);
  }

  async browseDirectory(targetDir) {
    const requested = targetDir ? path.resolve(targetDir) : path.dirname(this.activeWorkspace) || this.homeDir;
    if (!this._isWithinUserHomeOrAuthorized(requested)) {
      throw new Error(`Browsing restricted to user home directory (${this.homeDir}).`);
    }
    if (!fsSync.existsSync(requested)) {
      throw new Error(`Directory does not exist: ${requested}`);
    }

    const entries = await fs.readdir(requested, { withFileTypes: true });
    const directories = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(requested, entry.name);
      const isGitRepo = fsSync.existsSync(path.join(fullPath, '.git'));
      const marker = this._detectProjectType(fullPath);
      directories.push({
        name: entry.name,
        path: fullPath,
        isGitRepo,
        marker: marker || 'folder',
        isProject: Boolean(isGitRepo || marker),
        active: path.resolve(fullPath) === path.resolve(this.activeWorkspace),
      });
    }

    directories.sort((a, b) => {
      if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parentCandidate = path.dirname(requested);
    const canGoUp = parentCandidate !== requested && this._isWithinUserHomeOrAuthorized(parentCandidate);

    const quickRoots = [
      { label: 'Home', path: this.homeDir },
      { label: 'OneDrive Desktop', path: path.join(this.homeDir, 'OneDrive', 'Desktop') },
      { label: 'Desktop', path: path.join(this.homeDir, 'Desktop') },
      { label: 'Documents', path: path.join(this.homeDir, 'Documents') },
      { label: 'Projects', path: path.join(this.homeDir, 'Projects') },
    ].filter((r) => fsSync.existsSync(r.path));

    return {
      currentDir: requested,
      parentDir: canGoUp ? parentCandidate : null,
      homeDir: this.homeDir,
      quickRoots,
      directories,
    };
  }

  listWorkspaces() {
    const roots = Array.from(this.security.authorizedRoots);
    return roots.map((r) => ({
      path: r,
      name: path.basename(r),
      active: r === this.activeWorkspace,
      exists: fsSync.existsSync(r),
      isGitRepo: fsSync.existsSync(path.join(r, '.git')),
    }));
  }

  async openWorkspace(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Workspace path is required');
    }
    const resolved = path.resolve(targetPath);
    if (!this._isWithinUserHomeOrAuthorized(resolved)) {
      throw new Error(`Access denied: workspace must be inside ${this.homeDir}`);
    }
    if (!fsSync.existsSync(resolved) || !fsSync.statSync(resolved).isDirectory()) {
      throw new Error(`Workspace directory does not exist: ${resolved}`);
    }

    this.security.addAuthorizedWorkspace(resolved);
    this.activeWorkspace = resolved;
    this._persistWorkspaces();
    if (this.onChangeCallback) {
      this.startWatching();
    }

    await this.db.recordEvent({
      project: path.basename(resolved),
      category: 'workspace',
      description: `Opened project workspace "${path.basename(resolved)}" (${resolved})`,
      status: 'completed',
      details: { path: resolved },
    });

    return {
      activeWorkspace: resolved,
      name: path.basename(resolved),
      workspaces: this.listWorkspaces(),
    };
  }

  async switchWorkspace(targetPath) {
    return this.openWorkspace(targetPath);
  }

  async listDirectory(relOrAbsPath = '.') {
    const target = path.isAbsolute(relOrAbsPath)
      ? this.security.authorizeWorkspacePath(relOrAbsPath)
      : this.security.authorizeWorkspacePath(path.join(this.activeWorkspace, relOrAbsPath));

    const entries = await fs.readdir(target, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(target, entry.name);
      const stat = await fs.stat(fullPath).catch(() => null);
      const originInfo = this.fileOriginLedger.get(fullPath) || { origin: 'workspace', agentId: null };
      items.push({
        name: entry.name,
        path: path.relative(this.activeWorkspace, fullPath) || '.',
        absolutePath: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat ? stat.size : 0,
        modifiedAt: stat ? stat.mtime.toISOString() : null,
        lastModifiedOrigin: originInfo.origin,
        lastModifiedByAgent: originInfo.agentId,
      });
    }
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
    return {
      workspace: this.activeWorkspace,
      directory: path.relative(this.activeWorkspace, target) || '.',
      items,
    };
  }

  async readFile(relPath) {
    const fullPath = this.security.authorizeWorkspacePath(path.resolve(this.activeWorkspace, relPath));
    const content = await fs.readFile(fullPath, 'utf8');
    const stat = await fs.stat(fullPath);
    await this.db.recordEvent({
      project: path.basename(this.activeWorkspace),
      category: 'file_read',
      description: `Read file ${path.relative(this.activeWorkspace, fullPath)}`,
      status: 'completed',
      details: { path: relPath, size: stat.size },
    });
    return {
      path: path.relative(this.activeWorkspace, fullPath),
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      origin: this.fileOriginLedger.get(fullPath)?.origin || 'manual',
    };
  }

  async writeFile(relPath, content, { origin = 'manual', agentId = null, taskId = null } = {}) {
    const fullPath = this.security.authorizeWorkspacePath(path.resolve(this.activeWorkspace, relPath));
    const existed = fsSync.existsSync(fullPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    this.fileOriginLedger.set(fullPath, {
      origin,
      agentId,
      timestamp: new Date().toISOString(),
    });

    await this.db.recordEvent({
      project: path.basename(this.activeWorkspace),
      agentId,
      taskId,
      category: existed ? 'file_modified' : 'file_created',
      description: `${existed ? 'Modified' : 'Created'} file ${path.relative(this.activeWorkspace, fullPath)} (${origin})`,
      status: 'completed',
      details: {
        path: path.relative(this.activeWorkspace, fullPath),
        origin,
        agentId,
        bytesWritten: Buffer.byteLength(content, 'utf8'),
      },
    });
    return {
      path: path.relative(this.activeWorkspace, fullPath),
      action: existed ? 'modified' : 'created',
      origin,
    };
  }

  async deleteFile(relPath, { confirmed = false } = {}) {
    if (!confirmed) {
      throw new Error('File deletion requires explicit confirmation.');
    }
    const fullPath = this.security.authorizeWorkspacePath(path.resolve(this.activeWorkspace, relPath));
    await fs.rm(fullPath, { recursive: true, force: false });
    await this.db.recordEvent({
      project: path.basename(this.activeWorkspace),
      category: 'file_deleted',
      description: `Deleted ${path.relative(this.activeWorkspace, fullPath)}`,
      status: 'completed',
      details: { path: relPath },
    });
    return { deleted: relPath };
  }

  getFileDiff(relPath) {
    const fullPath = this.security.authorizeWorkspacePath(path.resolve(this.activeWorkspace, relPath));
    try {
      const diff = execFileSync('git', ['diff', 'HEAD', '--', fullPath], {
        cwd: this.activeWorkspace,
        encoding: 'utf8',
        windowsHide: true,
      });
      return { path: relPath, diff: diff || 'No uncommitted diff against HEAD.' };
    } catch (err) {
      return { path: relPath, diff: `Diff unavailable: ${err.message}` };
    }
  }
}
