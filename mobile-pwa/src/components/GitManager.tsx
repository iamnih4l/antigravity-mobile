'use client';

import React, { useState } from 'react';
import {
  GitBranch,
  GitCommit as GitCommitIcon,
  GitPullRequest,
  Check,
  Plus,
  Minus,
  FileCode,
  RotateCw,
  GitCompare,
  Upload,
  Download,
} from 'lucide-react';
import { GitStatusInfo, GitCommit } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface GitManagerProps {
  status: GitStatusInfo;
  commits: GitCommit[];
  onStageFile: (file: string) => Promise<void>;
  onUnstageFile: (file: string) => Promise<void>;
  onCommit: (message: string) => Promise<void>;
  onSwitchBranch: (branch: string, create?: boolean) => Promise<void>;
  onRefresh: () => void;
  onViewDiff: (file?: string, staged?: boolean) => Promise<void>;
}

export function GitManager({
  status,
  commits,
  onStageFile,
  onUnstageFile,
  onCommit,
  onSwitchBranch,
  onRefresh,
  onViewDiff,
}: GitManagerProps) {
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim() || isCommitting) return;
    setIsCommitting(true);
    setNotice(null);
    try {
      await onCommit(commitMsg.trim());
      setCommitMsg('');
      setNotice('Committed changes successfully.');
      onRefresh();
    } catch (err: unknown) {
      setNotice(`Commit error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await onSwitchBranch(newBranchName.trim(), true);
      setNewBranchName('');
      setShowNewBranchModal(false);
      onRefresh();
      setNotice(`Created and checked out branch ${newBranchName.trim()}`);
    } catch (err: unknown) {
      setNotice(`Branch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const changedFiles = Array.isArray(status?.changedFiles) ? status.changedFiles : [];
  const stagedFiles = changedFiles.filter((f) => f?.staged);
  const unstagedFiles = changedFiles.filter((f) => !f?.staged);

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* BRANCH & REPO STATUS STRIP */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-white">
                Branch: {status.branch || 'main'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Git Level 1: Fully Supported
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              Workspace: {status.workspace?.split(/[/\\]/).pop() || status.workspace}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={status.branch}
            onChange={(e) => onSwitchBranch(e.target.value)}
            className="bg-obsidian text-xs text-zinc-200 font-mono rounded-lg px-2.5 py-1.5 border border-hairline focus:outline-none focus:border-indigo-500"
          >
            {(status.branches || [status.branch]).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNewBranchModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-300 flex items-center gap-1 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Branch</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 active:scale-95"
            title="Refresh Git status"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={cn(
            'p-2.5 rounded-lg text-xs font-mono border',
            notice.includes('error') || notice.includes('Error')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          )}
        >
          {notice}
        </div>
      )}

      {/* CREATE NEW BRANCH MODAL */}
      {showNewBranchModal && (
        <form onSubmit={handleCreateBranch} className="p-3 rounded-xl border border-indigo-500/30 bg-surface/80 flex gap-2">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="new-feature-branch"
            className="flex-1 bg-obsidian text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white"
          >
            Checkout
          </button>
          <button
            type="button"
            onClick={() => setShowNewBranchModal(false)}
            className="px-3 py-2 rounded-lg bg-surface border border-hairline text-xs text-zinc-400"
          >
            Cancel
          </button>
        </form>
      )}

      {/* WORKING TREE CHANGES (STAGED & UNSTAGED) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Staged Changes */}
        <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-emerald-400 uppercase tracking-wider font-semibold">
              Staged Changes ({stagedFiles.length})
            </span>
            <button
              onClick={() => onViewDiff(undefined, true)}
              className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
            >
              <GitCompare className="w-3 h-3" />
              <span>Full Staged Diff</span>
            </button>
          </div>

          {stagedFiles.length === 0 ? (
            <div className="py-6 text-center text-[11px] font-mono text-zinc-500 border border-dashed border-hairline rounded-lg">
              No changes staged for commit.
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
              {stagedFiles.map((f) => (
                <div
                  key={f.path}
                  className="p-2 rounded bg-obsidian/70 border border-hairline flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-emerald-400 font-bold">{f.indexStatus}</span>
                    <span className="text-zinc-200 truncate">{f.path}</span>
                  </div>
                  <button
                    onClick={() => onUnstageFile(f.path)}
                    className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-surface text-[10px]"
                    title="Unstage file"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unstaged Changes */}
        <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-amber-400 uppercase tracking-wider font-semibold">
              Working Tree Changes ({unstagedFiles.length})
            </span>
            <button
              onClick={() => onViewDiff(undefined, false)}
              className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
            >
              <GitCompare className="w-3 h-3" />
              <span>Full Diff</span>
            </button>
          </div>

          {unstagedFiles.length === 0 ? (
            <div className="py-6 text-center text-[11px] font-mono text-zinc-500 border border-dashed border-hairline rounded-lg">
              Working tree is clean.
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
              {unstagedFiles.map((f) => (
                <div
                  key={f.path}
                  className="p-2 rounded bg-obsidian/70 border border-hairline flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-amber-400 font-bold">{f.workTreeStatus}</span>
                    <span className="text-zinc-200 truncate">{f.path}</span>
                  </div>
                  <button
                    onClick={() => onStageFile(f.path)}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-surface text-[10px]"
                    title="Stage file"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* COMMIT COMPOSER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/30 space-y-3">
        <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
          Commit Message Composer
        </label>
        <form onSubmit={handleCommitSubmit} className="space-y-2.5">
          <textarea
            rows={2}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="feat: mobile-first control dashboard upgrade..."
            className="w-full bg-obsidian text-xs font-mono text-zinc-100 p-2.5 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            type="submit"
            disabled={isCommitting || !commitMsg.trim() || stagedFiles.length === 0}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition active:scale-98 shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
          >
            <GitCommitIcon className="w-4 h-4" />
            <span>
              {isCommitting ? 'Committing...' : `Commit ${stagedFiles.length} Staged Changes`}
            </span>
          </button>
        </form>
      </div>

      {/* COMMIT HISTORY */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/30 space-y-2.5">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Recent Commit Log ({commits.length})
        </div>
        {commits.length === 0 ? (
          <div className="py-6 text-center text-xs font-mono text-zinc-500">
            No commits recorded yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
            {commits.map((c) => (
              <div
                key={c.hash}
                className="p-2.5 rounded-lg bg-obsidian/70 border border-hairline flex items-start justify-between gap-2 text-xs font-mono"
              >
                <div className="min-w-0">
                  <div className="text-zinc-200 font-medium truncate">{c.subject}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {c.author} • {new Date(c.date).toLocaleString()}
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-hairline text-indigo-300 shrink-0">
                  {c.shortHash}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GitManager;
