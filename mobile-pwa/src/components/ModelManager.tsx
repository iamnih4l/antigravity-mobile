'use client';

import React, { useState } from 'react';
import {
  Cpu,
  Sliders,
  CheckCircle2,
  AlertCircle,
  History,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ModelInfo, ModelParameterConfig } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface ModelManagerProps {
  models: ModelInfo[];
  currentModelId: string;
  onSelectModel: (
    modelId: string,
    params: ModelParameterConfig,
    scope: 'acp_session' | 'native_ide'
  ) => Promise<void>;
  onNavigateToDesktop: () => void;
}

export function ModelManager({
  models,
  currentModelId,
  onSelectModel,
  onNavigateToDesktop,
}: ModelManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(currentModelId);
  const [scope, setScope] = useState<'acp_session' | 'native_ide'>('acp_session');
  const [temperature, setTemperature] = useState<number>(0.2);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(4096);
  const [thinkingBudget, setThinkingBudget] = useState<number>(1024);
  const [isApplying, setIsApplying] = useState(false);
  const [historyLog, setHistoryLog] = useState<Array<{ modelId: string; timestamp: string; scope: string }>>([
    { modelId: currentModelId, timestamp: new Date().toLocaleTimeString(), scope: 'acp_session' },
  ]);
  const [message, setMessage] = useState<string | null>(null);

  const handleApply = async () => {
    setIsApplying(true);
    setMessage(null);
    try {
      await onSelectModel(
        selectedId,
        { temperature, maxOutputTokens, thinkingBudget },
        scope
      );
      setHistoryLog((prev) => [
        { modelId: selectedId, timestamp: new Date().toLocaleTimeString(), scope },
        ...prev.slice(0, 9),
      ]);
      setMessage(`Model successfully switched to ${selectedId} (${scope === 'acp_session' ? 'ACP Session' : 'Native IDE'})`);
    } catch (err: unknown) {
      setMessage(`Error switching model: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* SCOPE SEPARATION BANNER */}
      <div className="rounded-xl border border-hairline bg-surface/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="font-display font-semibold text-sm sm:text-base text-white">
            Model Scope & Architecture Separation
          </h2>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          Google Antigravity IDE enforces strict process boundaries between background ACP agents and the active editor side-panel:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setScope('acp_session')}
            className={cn(
              'p-3 rounded-lg border text-left transition',
              scope === 'acp_session'
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-hairline bg-obsidian/60 hover:border-zinc-700'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-medium text-xs text-white">
                1. ACP Agent Session Model
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Level 4: ACP
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Directly rebinds the next autonomous task, prompt pipeline, and tool invocation loop via Agent Client Protocol.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setScope('native_ide')}
            className={cn(
              'p-3 rounded-lg border text-left transition',
              scope === 'native_ide'
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-hairline bg-obsidian/60 hover:border-zinc-700'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-medium text-xs text-white">
                2. Native IDE Panel Model
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Level 5: UI Automation
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Changes the dropdown inside Google Antigravity IDE's desktop chat panel via Remote Desktop bridge.
            </p>
          </button>
        </div>

        {scope === 'native_ide' && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              Native IDE panel dropdown changes require Remote Desktop coordinate dispatch or UI automation.
            </span>
            <button
              onClick={onNavigateToDesktop}
              className="text-amber-400 underline font-mono text-[11px] shrink-0"
            >
              Open Remote Desktop →
            </button>
          </div>
        )}
      </div>

      {/* DISCOVERED MODEL CARDS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Discovered Models ({models.length})
          </label>
          <span className="text-[10px] font-mono text-zinc-500">Live from vscode.lm + ACP</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {models.map((model) => {
            const isSelected = selectedId === model.id;
            const isCurrent = currentModelId === model.id;
            return (
              <div
                key={model.id}
                onClick={() => setSelectedId(model.id)}
                className={cn(
                  'hairline-card p-3.5 rounded-xl border cursor-pointer transition relative',
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-hairline bg-surface/30 hover:border-zinc-700'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display font-semibold text-xs sm:text-sm text-white">
                        {model.name || model.id}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
                      {model.id}
                    </div>
                  </div>
                  <Cpu className={cn('w-4 h-4 shrink-0', isSelected ? 'text-indigo-400' : 'text-zinc-500')} />
                </div>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-obsidian text-zinc-300 border border-hairline">
                    {model.provider}
                  </span>
                  {model.contextWindow && (
                    <span className="px-1.5 py-0.5 rounded bg-obsidian text-indigo-300 border border-hairline">
                      {(model.contextWindow / 1000).toFixed(0)}k context
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-obsidian text-zinc-400 border border-hairline">
                    {model.source}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PARAMETER CONTROLS */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/30 space-y-3.5">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="font-display font-semibold text-xs sm:text-sm text-white">
            Sampling Parameters & Thinking Budget
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">Temperature</span>
              <span className="text-indigo-400">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-obsidian rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-0.5">
              <span>Precise (0.0)</span>
              <span>Balanced (0.5)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">Max Output Tokens</span>
              <span className="text-indigo-400">{maxOutputTokens}</span>
            </div>
            <input
              type="range"
              min="256"
              max="8192"
              step="256"
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 h-1.5 bg-obsidian rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">Thinking Budget (Tokens)</span>
              <span className="text-indigo-400">{thinkingBudget}</span>
            </div>
            <input
              type="range"
              min="0"
              max="4096"
              step="256"
              value={thinkingBudget}
              onChange={(e) => setThinkingBudget(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 h-1.5 bg-obsidian rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'p-2.5 rounded-lg text-xs font-mono border',
              message.includes('Error')
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            )}
          >
            {message}
          </div>
        )}

        <button
          onClick={handleApply}
          disabled={isApplying}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-medium text-xs sm:text-sm text-white transition active:scale-98 shadow-sm flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isApplying ? 'Applying Model Switch...' : `Apply Switch to ${selectedId}`}</span>
        </button>
      </div>

      {/* SELECTION HISTORY LOG */}
      <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-3.5 h-3.5 text-zinc-400" />
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Model Selection History</h4>
        </div>
        <div className="space-y-1 text-xs font-mono">
          {historyLog.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-obsidian/40 border border-hairline">
              <span className="text-zinc-300 truncate">{item.modelId}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-indigo-400">{item.scope}</span>
                <span className="text-[10px] text-zinc-500">{item.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModelManager;
