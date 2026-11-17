'use client';

import React, { useState } from 'react';
import {
  Bot,
  Shield,
  Zap,
  FileCheck,
  StopCircle,
  Play,
  RotateCcw,
  Check,
  AlertCircle,
  Terminal,
  Layers,
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

  const handleSelect = async (agentId: string) => {
    setSelectedAgent(agentId);
    setIsSwitching(true);
    setMsg(null);
    try {
      await onSelectAgent(agentId);
      setMsg(`Active agent switched to ${agentId}`);
    } catch (err: unknown) {
      setMsg(`Error switching agent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSwitching(false);
    }
  };

  const getAgentBadge = (type: string) => {
    switch (type) {
      case 'native_ide':
        return {
          label: '1. Native Antigravity IDE Agent',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        };
      case 'acp':
        return {
          label: '2. ACP-Connected Agent',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        };
      case 'cli':
      default:
        return {
          label: '3. External CLI Agent',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
    }
  };

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* HEADER BANNER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="font-display font-semibold text-sm sm:text-base text-white">
              AI Agent Fleet & Orchestrator
            </h2>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Dispatch autonomous tasks across Native IDE agents, ACP protocol agents, and local CLI engines.
          </p>
        </div>
        <button
          onClick={onOpenTaskModal}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm min-h-[40px] shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Launch Agent Task</span>
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

      {/* ACTIVE RUNNING TASKS & MID-RUN STEERING */}
      {runningTasks.length > 0 && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />
              <h3 className="font-display font-semibold text-xs sm:text-sm text-indigo-200">
                Live Mid-Run Agent Tasks ({runningTasks.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-indigo-300">Mid-Run Steering Active</span>
          </div>

          <div className="space-y-2">
            {runningTasks.map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-lg bg-obsidian/80 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {task.executionMode}
                    </span>
                    <span className="text-xs font-mono font-medium text-white truncate">{task.agentId}</span>
                    <span className="text-[10px] font-mono text-zinc-500">ID: {task.id}</span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{task.prompt}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onCancelTask(task.id)}
                    className="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono flex items-center gap-1.5 transition active:scale-95 min-h-[36px]"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>Cancel Task</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AGENT REGISTRY TIERS */}
      <div className="space-y-2.5">
        <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
          Agent Classification & Fleet Roster ({agents.length})
        </label>

        <div className="space-y-2.5">
          {agents.map((agent) => {
            const isSelected = selectedAgent === agent.id;
            const badge = getAgentBadge(agent.type);
            return (
              <div
                key={agent.id}
                onClick={() => handleSelect(agent.id)}
                className={cn(
                  'hairline-card p-4 rounded-xl border cursor-pointer transition',
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-hairline bg-surface/30 hover:border-zinc-700'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-semibold text-sm text-white">
                        {agent.name}
                      </span>
                      <span className={cn('text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-medium', badge.color)}>
                        {badge.label}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-600 text-white font-semibold">
                          Active Selection
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5">{agent.id}</div>
                    <p className="text-xs text-zinc-300 mt-2 leading-relaxed">{agent.description}</p>
                  </div>
                  <div className="p-1 rounded-full border border-hairline bg-obsidian shrink-0">
                    <Check className={cn('w-4 h-4', isSelected ? 'text-indigo-400' : 'text-transparent')} />
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-hairline/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-zinc-500">Capabilities:</span>
                    {agent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-obsidian text-zinc-300 border border-hairline"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Status: {agent.active ? 'Available' : 'Standby'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AgentManager;
