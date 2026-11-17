'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Cpu,
  ShieldCheck,
  FileCode,
  Play,
  Layers,
} from 'lucide-react';
import { ModelInfo, AgentInfo } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface TaskComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelInfo[];
  agents: AgentInfo[];
  currentModelId: string;
  activeAgentId: string;
  onSubmit: (task: {
    prompt: string;
    modelId: string;
    agentId: string;
    executionMode: 'autonomous' | 'supervised_approval' | 'plan_only';
    targetFile?: string;
    fileContent?: string;
  }) => Promise<void>;
}

export function TaskComposerModal({
  isOpen,
  onClose,
  models,
  agents,
  currentModelId,
  activeAgentId,
  onSubmit,
}: TaskComposerModalProps) {
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState(currentModelId);
  const [agentId, setAgentId] = useState(activeAgentId);
  const [executionMode, setExecutionMode] = useState<'autonomous' | 'supervised_approval' | 'plan_only'>('autonomous');
  const [targetFile, setTargetFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [showFileFields, setShowFileFields] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        prompt: prompt.trim(),
        modelId,
        agentId,
        executionMode,
        targetFile: targetFile.trim() || undefined,
        fileContent: fileContent || undefined,
      });
      setPrompt('');
      setTargetFile('');
      setFileContent('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const templates = [
    {
      title: 'Health Probe & Verify',
      prompt: 'Create a remote health probe configuration file and verify workspace status',
      file: 'companion-service/data/agent-probe.json',
      content: JSON.stringify({ verifiedBy: 'acp-antigravity-coder', timestamp: new Date().toISOString() }, null, 2),
    },
    {
      title: 'Run Integration Tests',
      prompt: 'Run full companion service test suite and output SQLite event count',
      file: '',
      content: '',
    },
    {
      title: 'Git Status & Diff',
      prompt: 'Check git status, stage changed files, and prepare commit review',
      file: '',
      content: '',
    },
    {
      title: 'Audit Capability Matrix',
      prompt: 'Inspect capability matrix across all 22 acceptance criteria and report readiness',
      file: '',
      content: '',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-obsidian/80 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div
        className="w-full sm:max-w-xl bg-carbon border border-hairline rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="modal-title" className="font-display font-semibold text-sm sm:text-base text-white">
                Dispatch Autonomous Agent Task
              </h2>
              <p className="text-[11px] text-zinc-400">Agent Client Protocol & Local Antigravity Engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* TEMPLATE CHIPS */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Quick Prompt Templates
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {templates.map((tpl) => (
              <button
                key={tpl.title}
                type="button"
                onClick={() => {
                  setPrompt(tpl.prompt);
                  if (tpl.file) {
                    setTargetFile(tpl.file);
                    setFileContent(tpl.content);
                    setShowFileFields(true);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-300 whitespace-nowrap active:scale-95 transition"
              >
                {tpl.title}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* PROMPT TEXTAREA */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Task Prompt / Instruction
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the objective for the agent (e.g. Inspect capability matrix and verify sqlite WAL persistence...)"
              className="w-full bg-obsidian text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 rounded-lg p-3 border border-hairline focus:outline-none focus:border-indigo-500 resize-none font-sans"
              required
            />
          </div>

          {/* MODEL & AGENT SELECTORS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Model Target
              </label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full bg-obsidian text-xs text-zinc-200 font-mono rounded-lg p-2.5 border border-hairline focus:outline-none focus:border-indigo-500"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                Agent Worker
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full bg-obsidian text-xs text-zinc-200 font-mono rounded-lg p-2.5 border border-hairline focus:outline-none focus:border-indigo-500"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* EXECUTION MODE SELECTOR */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Safety & Execution Mode
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setExecutionMode('autonomous')}
                className={cn(
                  'p-2 rounded-lg border text-center font-mono transition',
                  executionMode === 'autonomous'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300 font-semibold'
                    : 'border-hairline bg-obsidian text-zinc-400 hover:text-zinc-200'
                )}
              >
                Autonomous
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('supervised_approval')}
                className={cn(
                  'p-2 rounded-lg border text-center font-mono transition',
                  executionMode === 'supervised_approval'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300 font-semibold'
                    : 'border-hairline bg-obsidian text-zinc-400 hover:text-zinc-200'
                )}
              >
                Supervised
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('plan_only')}
                className={cn(
                  'p-2 rounded-lg border text-center font-mono transition',
                  executionMode === 'plan_only'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300 font-semibold'
                    : 'border-hairline bg-obsidian text-zinc-400 hover:text-zinc-200'
                )}
              >
                Plan Only
              </button>
            </div>
          </div>

          {/* OPTIONAL FILE CREATION / INJECTION FIELDS */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowFileFields(!showFileFields)}
              className="text-xs font-mono text-indigo-400 hover:underline flex items-center gap-1"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{showFileFields ? 'Hide File Generation Options' : '+ Add Target File Generation'}</span>
            </button>

            {showFileFields && (
              <div className="mt-2.5 p-3 rounded-lg bg-obsidian/70 border border-hairline space-y-2">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Target Workspace Path
                  </label>
                  <input
                    type="text"
                    value={targetFile}
                    onChange={(e) => setTargetFile(e.target.value)}
                    placeholder="e.g. companion-service/data/agent-probe.json"
                    className="w-full bg-carbon text-xs text-zinc-200 font-mono rounded p-2 border border-hairline focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Initial Content (JSON / Text)
                  </label>
                  <textarea
                    rows={3}
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder="File content payload to write..."
                    className="w-full bg-carbon text-xs text-zinc-200 font-mono rounded p-2 border border-hairline focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim()}
              className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-medium text-xs sm:text-sm text-white transition active:scale-98 shadow-md flex items-center justify-center gap-2 min-h-[44px]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isSubmitting ? 'Starting Agent Pipeline...' : 'Launch Agent Task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskComposerModal;
