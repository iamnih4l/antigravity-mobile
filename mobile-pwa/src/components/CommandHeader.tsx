'use client';

import React from 'react';
import { Sparkles, ShieldAlert, Wifi, WifiOff, Globe, Settings2, FolderOpen, ChevronDown } from 'lucide-react';
import { MainView } from './BottomNav';
import { cn } from '@/lib/utils';

interface CommandHeaderProps {
  activeView: MainView;
  onOpenTaskModal: () => void;
  onSelectView: (view: MainView) => void;
  pendingApprovalsCount: number;
  isOnline: boolean;
  ideConnected: boolean;
  hostname?: string;
  activeWorkspace: string;
  onOpenConnectionModal?: () => void;
  onOpenProjectSwitcher?: () => void;
}

const VIEW_TITLES: Record<MainView, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview Command',
    subtitle: 'Google Antigravity IDE (VS Code Fork) • Always-Ready Mobile Bridge',
  },
  agents: {
    title: 'Agent Orchestrator',
    subtitle: 'ACP & Native Agent Fleet Management & Live Steering',
  },
  files: {
    title: 'Project Files & Diff',
    subtitle: 'Workspace Tree Browser, Mobile Code Editor & Unified Diff',
  },
  activity: {
    title: 'Activity Timeline',
    subtitle: 'Real-time SQLite Audit Trail, Traces & Data Export',
  },
  terminal: {
    title: 'Interactive Remote PTY',
    subtitle: 'Multi-session Terminal, Streaming I/O & Safety Interception',
  },
  git: {
    title: 'Mobile Git Client',
    subtitle: 'Branch Control, Hunk Staging, Commit Composer & History',
  },
  models: {
    title: 'AI Model Selector',
    subtitle: 'Live VS Code LM & ACP Models, Context Sliders & Scope Control',
  },
  approvals: {
    title: 'Approval Centre',
    subtitle: 'Guarded Operations, Danger Interception & Policy Auditing',
  },
  desktop: {
    title: 'Remote Desktop Control',
    subtitle: 'Low-latency Frame Canvas, Mouse Dispatch & IDE Shortcuts',
  },
  discovery: {
    title: 'Host Discovery Report',
    subtitle: 'OS Capabilities, CLI Binary Validation & ACP Matrix',
  },
};

export function CommandHeader({
  activeView,
  onOpenTaskModal,
  onSelectView,
  pendingApprovalsCount,
  isOnline,
  ideConnected,
  hostname,
  activeWorkspace,
  onOpenConnectionModal,
  onOpenProjectSwitcher,
}: CommandHeaderProps) {
  const currentMeta = VIEW_TITLES[activeView] || {
    title: 'Antigravity Mobile',
    subtitle: 'Remote Developer Companion',
  };

  const wsName = typeof activeWorkspace === 'string' && activeWorkspace
    ? activeWorkspace.split(/[/\\]/).filter(Boolean).pop() || activeWorkspace
    : 'Workspace';

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-hairline px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left: View title & connection status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="md:hidden w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-display font-bold text-xs shrink-0">
            AG
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-sm sm:text-base text-white truncate">
                {currentMeta.title}
              </h1>
              <button
                type="button"
                onClick={onOpenConnectionModal}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition active:scale-95 cursor-pointer shrink-0',
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                )}
                title="Click to configure companion service host / tunnel endpoint"
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  )}
                />
                {isOnline ? (ideConnected ? 'IDE Linked' : 'Online') : 'Offline'}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <button
                type="button"
                onClick={onOpenProjectSwitcher}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-md text-[11px] font-mono text-indigo-300 hover:bg-indigo-500/15 hover:text-white transition active:scale-95 max-w-[190px] sm:max-w-[260px]"
                title="Tap to switch or open another project folder"
              >
                <FolderOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate">{wsName}</span>
                <ChevronDown className="w-3 h-3 text-indigo-400 shrink-0" />
              </button>
              <span className="text-[10px] text-zinc-500 hidden sm:inline truncate">
                • {hostname || '127.0.0.1:8787'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenConnectionModal && (
            <button
              onClick={onOpenConnectionModal}
              className="p-1.5 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-zinc-400 hover:text-zinc-200 transition active:scale-95 min-h-[34px] min-w-[34px] flex items-center justify-center"
              title="Connection Settings (Tunnel & Endpoint)"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => onSelectView('approvals')}
            className={cn(
              'relative px-2.5 py-1.5 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-xs text-zinc-200 flex items-center gap-1.5 transition active:scale-95',
              pendingApprovalsCount > 0 && 'border-amber-500/50 bg-amber-500/10'
            )}
            title="Approval Centre"
          >
            <ShieldAlert className={cn('w-3.5 h-3.5', pendingApprovalsCount > 0 ? 'text-amber-400 animate-bounce' : 'text-zinc-400')} />
            <span className="hidden sm:inline">Approvals</span>
            {pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenTaskModal}
            className="px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 transition shadow-sm active:scale-95 min-h-[36px]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">New Task</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default CommandHeader;
