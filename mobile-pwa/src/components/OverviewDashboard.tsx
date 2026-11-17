'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  Terminal,
  FolderGit2,
  Cpu,
  Monitor,
  CheckCircle2,
  Clock,
  ChevronRight,
  FileCode,
  User,
  Bot,
  AlertTriangle,
  Play,
  RotateCw,
} from 'lucide-react';
import {
  TaskItem,
  ApprovalItem,
  FileEntry,
  ModelInfo,
  AgentInfo,
} from '@/lib/companion-client';
import { MainView } from './BottomNav';
import { cn } from '@/lib/utils';

interface OverviewDashboardProps {
  onSelectView: (view: MainView) => void;
  onOpenTaskModal: () => void;
  activeWorkspace: string;
  workspaces: string[];
  onSelectWorkspace: (ws: string) => void;
  pendingApprovals: ApprovalItem[];
  onResolveApproval: (id: string, decision: 'approve' | 'reject', note?: string) => Promise<void>;
  tasks: TaskItem[];
  recentFiles: FileEntry[];
  currentModel: string;
  activeAgent: string;
  isOnline: boolean;
  ideConnected: boolean;
  onQuickSubmitTask: (prompt: string) => Promise<void>;
  onOpenFileDiff: (filePath: string) => void;
  onRefresh: () => void;
}

export function OverviewDashboard({
  onSelectView,
  onOpenTaskModal,
  activeWorkspace,
  workspaces,
  onSelectWorkspace,
  pendingApprovals,
  onResolveApproval,
  tasks,
  recentFiles,
  currentModel,
  activeAgent,
  isOnline,
  ideConnected,
  onQuickSubmitTask,
  onOpenFileDiff,
  onRefresh,
}: OverviewDashboardProps) {
  const [quickPrompt, setQuickPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onQuickSubmitTask(quickPrompt.trim());
      setQuickPrompt('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const wsName = activeWorkspace ? activeWorkspace.split(/[/\\]/).filter(Boolean).pop() || activeWorkspace : 'antigravity-mobile';

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-5xl mx-auto">
      {/* 1. TOP METRICS & ALWAYS-READY BANNER */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="hairline-card p-3 rounded-xl border border-hairline bg-surface/40">
          <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Daemon Status</span>
            <span className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500')} />
          </div>
          <div className="text-sm font-semibold font-display text-white mt-1">
            {isOnline ? 'Always-Ready' : 'Connecting...'}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
            {ideConnected ? 'VS Code API Active' : 'Extension Standby'}
          </div>
        </div>

        <div className="hairline-card p-3 rounded-xl border border-hairline bg-surface/40">
          <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Active Model</span>
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xs font-semibold font-mono text-indigo-300 mt-1 truncate" title={currentModel}>
            {currentModel.replace('-antigravity', '')}
          </div>
          <button
            onClick={() => onSelectView('models')}
            className="text-[10px] text-indigo-400 hover:underline mt-0.5 block text-left"
          >
            Switch Model →
          </button>
        </div>

        <div className="hairline-card p-3 rounded-xl border border-hairline bg-surface/40">
          <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Active Agent</span>
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xs font-semibold font-mono text-cyan-300 mt-1 truncate" title={activeAgent}>
            {activeAgent}
          </div>
          <button
            onClick={() => onSelectView('agents')}
            className="text-[10px] text-cyan-400 hover:underline mt-0.5 block text-left"
          >
            Configure Fleet →
          </button>
        </div>

        <div className="hairline-card p-3 rounded-xl border border-hairline bg-surface/40">
          <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Approvals</span>
            <ShieldAlert className={cn('w-3.5 h-3.5', pendingApprovals.length > 0 ? 'text-amber-400' : 'text-zinc-500')} />
          </div>
          <div className="text-sm font-semibold font-mono mt-1 flex items-center gap-1.5">
            <span className={pendingApprovals.length > 0 ? 'text-amber-300' : 'text-zinc-300'}>
              {pendingApprovals.length} Pending
            </span>
          </div>
          <button
            onClick={() => onSelectView('approvals')}
            className="text-[10px] text-amber-400 hover:underline mt-0.5 block text-left"
          >
            Audit Queue →
          </button>
        </div>
      </div>

      {/* 2. PENDING APPROVALS ALERT DRAWER (if any) */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="font-display font-semibold text-xs sm:text-sm text-amber-200">
                Action Required: {pendingApprovals.length} Guarded Operation(s)
              </span>
            </div>
            <button
              onClick={() => onSelectView('approvals')}
              className="text-xs text-amber-400 font-medium hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {pendingApprovals.slice(0, 2).map((appr) => (
              <div
                key={appr.id}
                className="p-2.5 rounded-lg bg-obsidian/70 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {appr.riskLevel}
                    </span>
                    <span className="text-xs text-zinc-200 font-medium truncate">{appr.operation}</span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
                    {appr.commandOrPath}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onResolveApproval(appr.id, 'reject', 'Rejected from mobile dashboard')}
                    className="px-2.5 py-1 rounded text-xs font-medium text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 active:scale-95"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => onResolveApproval(appr.id, 'approve', 'Approved from mobile dashboard')}
                    className="px-2.5 py-1 rounded text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. INLINE QUICK TASK COMPOSER */}
      <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-display font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Quick Autonomous Task
          </label>
          <span className="text-[10px] font-mono text-zinc-400">Target: {wsName}</span>
        </div>
        <form onSubmit={handleQuickSubmit} className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              placeholder="e.g. Inspect capability matrix and verify sqlite WAL persistence..."
              className="w-full bg-obsidian text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-2.5 border border-hairline focus:outline-none focus:border-indigo-500 pr-24"
            />
            <button
              type="submit"
              disabled={isSubmitting || !quickPrompt.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white flex items-center gap-1 transition active:scale-95"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>{isSubmitting ? 'Running...' : 'Run'}</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] text-zinc-500">Templates:</span>
              <button
                type="button"
                onClick={() => setQuickPrompt('Run health probe and verify workspace')}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline text-[10px] font-mono text-zinc-300 whitespace-nowrap"
              >
                Health Probe
              </button>
              <button
                type="button"
                onClick={() => setQuickPrompt('Check git diff and list unstaged changes')}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline text-[10px] font-mono text-zinc-300 whitespace-nowrap"
              >
                Git Diff
              </button>
              <button
                type="button"
                onClick={() => setQuickPrompt('Run integration test suite on companion service')}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline text-[10px] font-mono text-zinc-300 whitespace-nowrap"
              >
                Test Suite
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenTaskModal}
              className="text-indigo-400 hover:underline text-[11px] font-medium shrink-0 ml-2"
            >
              Advanced Modal →
            </button>
          </div>
        </form>
      </div>

      {/* 4. ACTIVE TASKS & RECENT EXECUTIONS */}
      <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <h3 className="font-display font-semibold text-xs sm:text-sm text-white">Agent Task Fleet</h3>
          </div>
          <button
            onClick={() => onSelectView('activity')}
            className="text-xs text-indigo-400 hover:underline font-medium"
          >
            All Activity ({tasks.length}) →
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-lg">
            No active agent tasks running. Click "Run" or "New Task" to launch an autonomous task.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 4).map((task) => {
              const isExpanded = expandedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className="rounded-lg border border-hairline bg-obsidian/60 p-3 transition hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={cn(
                            'text-[10px] font-mono uppercase px-1.5 py-0.2 rounded border',
                            task.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : task.status === 'running'
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse'
                              : task.status === 'failed'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          )}
                        >
                          {task.status}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">{task.agentId}</span>
                        <span className="text-[10px] font-mono text-zinc-500">• {new Date(task.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-zinc-200 mt-1 line-clamp-2">{task.prompt}</p>
                    </div>
                    <button
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-surface text-xs font-mono shrink-0"
                    >
                      {isExpanded ? 'Hide Trace' : `Trace (${task.trace.length})`}
                    </button>
                  </div>

                  {/* Collapsible Trace Steps */}
                  {isExpanded && (
                    <div className="mt-3 pt-2.5 border-t border-hairline space-y-1.5 text-[11px] font-mono">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Execution Steps</div>
                      {task.trace.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-zinc-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span>{step.step}</span>
                            <span className="text-zinc-500 text-[10px] ml-2">
                              {new Date(step.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. RECENT FILE MODIFICATIONS WITH AGENT VS MANUAL BADGES */}
      <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display font-semibold text-xs sm:text-sm text-white">
              Workspace Files & Origin Tracking
            </h3>
          </div>
          <button
            onClick={() => onSelectView('files')}
            className="text-xs text-emerald-400 hover:underline font-medium"
          >
            Explore All →
          </button>
        </div>

        {recentFiles.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-lg">
            No recently changed files recorded.
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentFiles.slice(0, 5).map((file) => (
              <div
                key={file.path}
                className="p-2 rounded-lg bg-obsidian/60 border border-hairline flex items-center justify-between gap-2 hover:border-zinc-700 transition"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className={cn(
                      'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0',
                      file.origin === 'agent'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    )}
                  >
                    {file.origin === 'agent' ? 'Agent' : 'Manual'}
                  </span>
                  <span className="text-xs font-mono text-zinc-200 truncate">{file.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                    {Math.round(file.size / 1024)} KB
                  </span>
                  <button
                    onClick={() => onOpenFileDiff(file.path)}
                    className="text-xs font-mono text-indigo-400 hover:underline px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline"
                  >
                    Diff
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. CONTEXTUAL TOOL SHORTCUTS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onSelectView('terminal')}
          className="p-3 rounded-xl bg-surface/50 hover:bg-surface border border-hairline text-left transition active:scale-98"
        >
          <Terminal className="w-4 h-4 text-indigo-400 mb-1.5" />
          <div className="text-xs font-semibold text-white">Remote Terminal</div>
          <div className="text-[10px] text-zinc-400 font-mono">Multi-session PTY</div>
        </button>

        <button
          onClick={() => onSelectView('git')}
          className="p-3 rounded-xl bg-surface/50 hover:bg-surface border border-hairline text-left transition active:scale-98"
        >
          <FolderGit2 className="w-4 h-4 text-emerald-400 mb-1.5" />
          <div className="text-xs font-semibold text-white">Mobile Git</div>
          <div className="text-[10px] text-zinc-400 font-mono">Stage, commit, branch</div>
        </button>

        <button
          onClick={() => onSelectView('desktop')}
          className="p-3 rounded-xl bg-surface/50 hover:bg-surface border border-hairline text-left transition active:scale-98"
        >
          <Monitor className="w-4 h-4 text-cyan-400 mb-1.5" />
          <div className="text-xs font-semibold text-white">Remote Desktop</div>
          <div className="text-[10px] text-zinc-400 font-mono">Screen & IDE shortcuts</div>
        </button>

        <button
          onClick={() => onSelectView('discovery')}
          className="p-3 rounded-xl bg-surface/50 hover:bg-surface border border-hairline text-left transition active:scale-98"
        >
          <CheckCircle2 className="w-4 h-4 text-amber-400 mb-1.5" />
          <div className="text-xs font-semibold text-white">Capability Probe</div>
          <div className="text-[10px] text-zinc-400 font-mono">22 acceptance points</div>
        </button>
      </div>
    </div>
  );
}

export default OverviewDashboard;
