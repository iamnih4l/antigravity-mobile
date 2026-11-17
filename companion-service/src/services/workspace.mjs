import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export class WorkspaceManager {
  constructor(security, db) {
    this.security = security;
    this.db = db;
    this.activeWorkspace = Array.from(this.security.authorizedRoots)[0];
    this.fileOriginLedger = new Map(); // filePath -> { origin: 'agent' | 'manual', agentId, timestamp }
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

  async switchWorkspace(targetPath) {
    const resolved = this.security.authorizeWorkspacePath(targetPath);
    if (!fsSync.existsSync(resolved)) {
      throw new Error(`Workspace directory does not exist: ${resolved}`);
    }
    this.activeWorkspace = resolved;
    await this.db.recordEvent({
      project: path.basename(resolved),
      category: 'workspace',
      description: `Switched active workspace to ${path.basename(resolved)}`,
      status: 'completed',
      details: { path: resolved },
    });
    return { activeWorkspace: resolved, name: path.basename(resolved) };
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
      });
      return { path: relPath, diff: diff || 'No uncommitted diff against HEAD.' };
    } catch (err) {
      return { path: relPath, diff: `Diff unavailable: ${err.message}` };
    }
  }
}
