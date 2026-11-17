'use client';

import React from 'react';
import {
  LayoutDashboard,
  Bot,
  FolderCode,
  Activity,
  Terminal,
  FileCode,
  GitBranch,
  Monitor,
  Cpu,
  ShieldAlert,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type MainView =
  | 'overview'
  | 'agents'
  | 'files'
  | 'activity'
  | 'terminal'
  | 'git'
  | 'models'
  | 'approvals'
  | 'desktop'
  | 'discovery';

interface BottomNavProps {
  activeView: MainView;
  onSelectView: (view: MainView) => void;
  pendingApprovalsCount: number;
  activeTasksCount: number;
  onOpenQrModal: () => void;
  isOnline: boolean;
  workspaces: string[];
  activeWorkspace: string;
  onSelectWorkspace: (ws: string) => void;
  currentModelId?: string;
}

export function BottomNav({
  activeView,
  onSelectView,
  pendingApprovalsCount,
  activeTasksCount,
  onOpenQrModal,
  isOnline,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  currentModelId,
}: BottomNavProps) {
  const primaryTabs: Array<{ id: MainView; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'agents', label: 'Agents', icon: Bot, badge: activeTasksCount > 0 ? activeTasksCount : undefined },
    { id: 'files', label: 'Projects', icon: FolderCode },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'approvals', label: 'Approvals', icon: ShieldAlert, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined },
  ];

  const contextualPills: Array<{ id: MainView; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'git', label: 'Git Client', icon: GitBranch },
    { id: 'models', label: 'AI Models', icon: Cpu },
    { id: 'desktop', label: 'Remote Desktop', icon: Monitor },
    { id: 'discovery', label: 'Host Probe', icon: CheckCircle2 },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR (Visible on md+ screens) */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-carbon border-r border-hairline shrink-0 select-none h-screen sticky top-0">
        <div className="p-4 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-display font-bold text-sm">
              AG
            </div>
            <div>
              <div className="font-display font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                Antigravity
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  IDE
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">Mobile Control v1.0</div>
            </div>
          </div>
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-all duration-300',
              isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
            )}
            title={isOnline ? 'Always-Ready Online' : 'Connecting to Companion Service...'}
          />
        </div>

        {/* Workspace Switcher */}
        <div className="px-3 py-2.5 border-b border-hairline">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
            Active Workspace
          </label>
          <select
            value={activeWorkspace}
            onChange={(e) => onSelectWorkspace(e.target.value)}
            className="w-full bg-surface text-xs text-zinc-200 font-mono rounded-md px-2.5 py-1.5 border border-hairline focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {(workspaces || []).map((ws: any) => {
              const wsStr = typeof ws === 'string' ? ws : ws?.path || ws?.name || String(ws || '');
              const wsLabel = wsStr.split(/[/\\]/).filter(Boolean).pop() || wsStr || 'Workspace';
              return (
                <option key={wsStr} value={wsStr}>
                  {wsLabel}
                </option>
              );
            })}
          </select>
        </div>

        {/* Desktop Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">Core Views</div>
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cn('w-4 h-4', isActive ? 'text-indigo-400' : 'text-zinc-400')} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 pt-3 pb-1">Tools & Bridge</div>
          {contextualPills.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={cn('w-4 h-4', isActive ? 'text-indigo-400' : 'text-zinc-400')} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-hairline bg-obsidian/60 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-emerald-400' : 'bg-rose-500')} />
              Always-Ready Daemon
            </span>
            <span className={cn('font-mono text-[10px]', isOnline ? 'text-emerald-400' : 'text-rose-400')}>
              {isOnline ? 'ACTIVE' : 'OFFLINE'}
            </span>
          </div>
          {currentModelId && (
            <div className="text-[10px] font-mono text-zinc-400 truncate" title={currentModelId}>
              Model: {currentModelId}
            </div>
          )}
          <button
            onClick={onOpenQrModal}
            className="w-full py-2 px-2.5 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-xs text-zinc-200 flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-400" />
            Pair Device / QR
          </button>
        </div>
      </aside>

      {/* MOBILE CONTEXTUAL PILL BAR (Horizontal scroll-snap above bottom nav) */}
      <div className="md:hidden fixed bottom-[58px] inset-x-0 z-20 px-2 py-1.5 bg-obsidian/90 backdrop-blur-md border-t border-hairline flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {contextualPills.map((pill) => {
          const Icon = pill.icon;
          const isActive = activeView === pill.id;
          return (
            <button
              key={pill.id}
              onClick={() => onSelectView(pill.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all shrink-0 min-h-[32px] border active:scale-95',
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                  : 'bg-surface/80 text-zinc-400 border-hairline hover:bg-surface hover:text-zinc-200'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>

      {/* FIXED 5-ITEM MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        role="navigation"
        aria-label="Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-carbon/95 backdrop-blur-lg border-t border-hairline px-1 py-1 flex items-center justify-around h-[58px] safe-bottom"
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectView(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-1 px-1 transition-all rounded-lg relative min-h-[44px] min-w-[44px] active:scale-95',
                isActive ? 'text-indigo-400 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              )}
              aria-label={tab.label}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5 transition-transform', isActive && 'scale-110 text-indigo-400')} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-amber-500 text-black font-bold">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[64px]">{tab.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-indigo-400 absolute bottom-1" />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default BottomNav;
