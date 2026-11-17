'use client';

import React, { useState, useEffect } from 'react';
import {
  Bot,
  Shield,
  Zap,
  StopCircle,
  Play,
  Check,
  FileSearch,
  Sparkles,
} from 'lucide-react';
import { AgentInfo, TaskItem } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface AgentManagerProps {
  agents: AgentInfo[];
  activeAgentId: string;
  onSelectAgent: (agentId: string) => Promise<void>;
  runningTasks: TaskItem[];
  onCancelTask: (taskId: string) => Promise<void>;
  onOpenTaskModal: () => void;
}

export function AgentManager({
  agents,
  activeAgentId,
  onSelectAgent,
  runningTasks,
  onCancelTask,
  onOpenTaskModal,
}: AgentManagerProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(activeAgentId);
  const [isSwitching, setIsSwitching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeAgentId) setSelectedAgent(activeAgentId);
  }, [activeAgentId]);

  const handleSelect = async (agentId: string, label: string) => {
    setSelectedAgent(agentId);
    setIsSwitching(true);
    setMsg(null);
    try {
      await onSelectAgent(agentId);
      setMsg(`Switched active agent to "${label}".`);
    } catch (err: unknown) {
      setMsg(`Error switching agent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSwitching(false);
    }
  };

  const getAgentPresentation = (agent: AgentInfo) => {
    switch (agent.type) {
      case 'acp':
        return {
          title: 'Remote Coding Agent',
          badge: 'Recommended',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          bestFor: 'Everyday mobile coding — edits files, checks Git, and runs commands with safety approvals.',
        };
      case 'native_ide':
        return {
          title: 'Desktop IDE Sync',
          badge: 'Desktop Companion',
          badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          bestFor: 'Viewing what is open on your PC editor (active file, saves, errors). Pair with Remote Desktop.',
        };
      case 'cli':
      default:
        return {
          title: 'Background CLI Runner',
          badge: 'Batch & Tests',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          bestFor: 'Running test suites, build checks, or repo audits quietly in the background.',
        };
    }
  };

  const safeAgents = Array.isArray(agents) ? agents : [];
  const safeRunning = Array.isArray(runningTasks) ? runningTasks : [];

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* HEADER BANNER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="font-display font-semibold text-sm sm:text-base text-white">
              Choose Your AI Agent
            </h2>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Pick which engine handles your prompts from mobile. Keep <strong className="text-white">Remote Coding Agent</strong> selected for everyday use.
          </p>
        </div>
        <button
          onClick={onOpenTaskModal}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm min-h-[40px] shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>New Agent Task</span>
        </button>
      </div>

      {msg && (
        <div
          className={cn(
            'p-2.5 rounded-lg text-xs font-mono border',
            msg.includes('Error')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          )}
        >
          {msg}
        </div>
      )}

      {/* ACTIVE RUNNING TASKS */}
      {safeRunning.length > 0 && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />
              <h3 className="font-display font-semibold text-xs sm:text-sm text-indigo-200">
                Currently Running ({safeRunning.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-indigo-300">Live</span>
          </div>

          <div className="space-y-2">
            {safeRunning.map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-lg bg-obsidian/80 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {task.executionMode}
                    </span>
                    <span className="text-xs font-mono font-medium text-white truncate">{task.agentId}</span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{task.prompt}</p>
                </div>
                <button
                  onClick={() => onCancelTask(task.id)}
                  className="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono flex items-center gap-1.5 transition active:scale-95 min-h-[36px] shrink-0"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AGENT CARDS */}
      <div className="space-y-2.5">
        {safeAgents.map((agent) => {
          const isSelected = selectedAgent === agent.id;
          const info = getAgentPresentation(agent);
          const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

          return (
            <button
              key={agent.id}
              type="button"
              disabled={isSwitching}
              onClick={() => handleSelect(agent.id, info.title)}
              className={cn(
                'w-full text-left hairline-card p-4 rounded-xl border cursor-pointer transition active:scale-[0.99]',
                isSelected
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-hairline bg-surface/30 hover:border-zinc-700'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold text-sm sm:text-base text-white">
                      {info.title}
                    </span>
                    <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full border font-medium', info.badgeColor)}>
                      {info.badge}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-600 text-white font-semibold">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {info.bestFor}
                  </p>
                </div>

                <div
                  className={cn(
                    'w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'border-hairline bg-obsidian text-transparent'
                  )}
                >
                  <Check className="w-3.5 h-3.5" />
                </div>
              </div>

              {capabilities.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-hairline/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-obsidian text-zinc-300 border border-hairline"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {agent.active ? '● Ready' : '○ Standby'}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* EXECUTION MODES EXPLAINER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-obsidian/60 space-y-3">
        <div className="text-xs font-display font-semibold text-white">
          Task Execution Modes (when you tap &quot;New Agent Task&quot;)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-surface/40 border border-hairline space-y-1">
            <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Autonomous
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Runs end-to-end automatically. Dangerous commands are still blocked for approval.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-surface/40 border border-hairline space-y-1">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Supervised (Ask First)
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Pauses before editing files or running commands so you can approve from your phone.
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-surface/40 border border-hairline space-y-1">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" />
              Plan Only
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Inspects your code and outlines a step-by-step plan without modifying any files.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentManager;
