import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { evaluateCommandPolicy } from './security.mjs';

export class GitManager {
  constructor(workspaceManager, db) {
    this.workspace = workspaceManager;
    this.db = db;
  }

  _runGit(args, cwd = this.workspace.activeWorkspace) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  }

  getStatus() {
    const cwd = this.workspace.activeWorkspace;
    try {
      this._runGit(['rev-parse', '--is-inside-work-tree'], cwd);
      let branch = 'main';
      try {
        branch = this._runGit(['branch', '--show-current'], cwd) || 'main';
      } catch {
        try {
          branch = this._runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
        } catch {}
      }
      const porcelain = this._runGit(['status', '--porcelain'], cwd);
      const files = porcelain
        ? porcelain.split(/\r?\n/).filter(Boolean).map((line) => ({
            indexStatus: line[0],
            workTreeStatus: line[1],
            path: line.slice(3).trim(),
            staged: line[0] !== ' ' && line[0] !== '?',
          }))
        : [];
      let branches = [branch];
      try {
        const branchesRaw = this._runGit(['branch', '--format=%(refname:short)'], cwd);
        if (branchesRaw) {
          const list = branchesRaw.split(/\r?\n/).filter(Boolean);
          if (list.length > 0) branches = list;
        }
      } catch {}
      return {
        isRepo: true,
        workspace: cwd,
        branch,
        branches,
        changedFiles: files,
        hasConflicts: files.some((f) => f.indexStatus === 'U' || f.workTreeStatus === 'U'),
      };
    } catch (err) {
      return {
        isRepo: false,
        workspace: cwd,
        error: err.message,
      };
    }
  }

  getCommitHistory(limit = 15) {
    try {
      const raw = this._runGit([
        'log',
        `-n`,
        String(limit),
        '--pretty=format:%H|%h|%an|%ae|%ad|%s',
        '--date=iso',
      ]);
      if (!raw) return [];
      return raw.split(/\r?\n/).filter(Boolean).map((line) => {
        const [hash, shortHash, author, email, date, subject] = line.split('|');
        return { hash, shortHash, author, email, date, subject };
      });
    } catch {
      return [];
    }
  }

  getDiff(filePath = null, staged = false) {
    try {
      const args = ['diff'];
      if (staged) args.push('--staged');
      if (filePath) args.push('--', filePath);
      return { diff: this._runGit(args) || 'No changes.' };
    } catch (err) {
      return { diff: `Git diff error: ${err.message}` };
    }
  }

  async stageFile(filePath) {
    this._runGit(['add', '--', filePath]);
    await this.db.recordEvent({
      project: path.basename(this.workspace.activeWorkspace),
      category: 'git',
      description: `Staged file ${filePath}`,
      status: 'completed',
      details: { operation: 'stage', filePath },
    });
    return this.getStatus();
  }

  async unstageFile(filePath) {
    this._runGit(['reset', 'HEAD', '--', filePath]);
    await this.db.recordEvent({
      project: path.basename(this.workspace.activeWorkspace),
      category: 'git',
      description: `Unstaged file ${filePath}`,
      status: 'completed',
      details: { operation: 'unstage', filePath },
    });
    return this.getStatus();
  }

  async commit(message, authorName = 'Mohammed Nihal', authorEmail = 'nihal@antigravity.local') {
    if (!message || !message.trim()) {
      throw new Error('Commit message is required.');
    }
    this._runGit([
      '-c',
      `user.name=${authorName}`,
      '-c',
      `user.email=${authorEmail}`,
      'commit',
      '-m',
      message.trim(),
    ]);
    const latest = this.getCommitHistory(1)[0];
    await this.db.recordEvent({
      project: path.basename(this.workspace.activeWorkspace),
      category: 'git',
      description: `Created Git commit ${latest?.shortHash || ''}: ${message.trim()}`,
      status: 'completed',
      details: { operation: 'commit', commit: latest },
    });
    return { status: this.getStatus(), commit: latest };
  }

  async switchBranch(branchName, create = false) {
    const args = create ? ['checkout', '-b', branchName] : ['checkout', branchName];
    this._runGit(args);
    await this.db.recordEvent({
      project: path.basename(this.workspace.activeWorkspace),
      category: 'git',
      description: `Switched to Git branch ${branchName}`,
      status: 'completed',
      details: { operation: 'checkout', branchName, create },
    });
    return this.getStatus();
  }
}
