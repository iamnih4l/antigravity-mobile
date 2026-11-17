'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Plus,
  Play,
  RotateCcw,
  Search,
  AlertTriangle,
  StopCircle,
  Copy,
  Trash2,
} from 'lucide-react';
import { TerminalSession } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface RemoteTerminalProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (name?: string) => Promise<void>;
  onExecuteCommand: (sessionId: string, cmd: string) => Promise<{ status: string; approvalId?: string; reason?: string }>;
  terminalOutputs: Record<string, string>;
  onClearOutput: (sessionId: string) => void;
  onSendSignal: (sessionId: string, signal: string) => void;
}

export function RemoteTerminal({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onExecuteCommand,
  terminalOutputs,
  onClearOutput,
  onSendSignal,
}: RemoteTerminalProps) {
  const [commandInput, setCommandInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [interceptionNotice, setInterceptionNotice] = useState<string | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const output = (activeSession ? terminalOutputs[activeSession.id] : '') || activeSession?.recentOutput || '';

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const handleCommandSubmit = async (cmdToRun?: string) => {
    const cmd = cmdToRun || commandInput.trim();
    if (!cmd || !activeSession || isExecuting) return;
    setIsExecuting(true);
    setInterceptionNotice(null);
    try {
      const res = await onExecuteCommand(activeSession.id, cmd);
      if (res.status === 'pending_approval') {
        setInterceptionNotice(`Restricted command intercepted by Approval Centre: "${cmd}". Reason: ${res.reason || 'Dangerous command policy'}. Check Approval Centre.`);
      }
      setCommandInput('');
    } catch (err: unknown) {
      setInterceptionNotice(`Execution error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const quickCommands = [
    { label: 'Git Status', cmd: 'git status' },
    { label: 'Integration Tests', cmd: 'node companion-service/test/integration.test.mjs' },
    { label: 'Host Discovery', cmd: 'node scripts/discover-env.mjs' },
    { label: 'Inspect Matrix', cmd: 'cat CAPABILITY_MATRIX.md' },
    { label: 'Dangerous rm -rf (Interception Test)', cmd: 'rm -rf /tmp/test_dir' },
  ];

  const filteredOutput = searchFilter
    ? output
        .split('\n')
        .filter((line) => line.toLowerCase().includes(searchFilter.toLowerCase()))
        .join('\n')
    : output;

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-5xl mx-auto">
      {/* SESSION TABS BAR */}
      <div className="hairline-card rounded-xl p-3 border border-hairline bg-surface/40 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <Terminal className="w-4 h-4 text-indigo-400 shrink-0 ml-1 mr-1" />
          {sessions.map((sess) => {
            const isActive = sess.id === activeSession?.id;
            return (
              <button
                key={sess.id}
                onClick={() => onSelectSession(sess.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition flex items-center gap-1.5 border active:scale-95',
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 font-semibold'
                    : 'bg-obsidian/60 text-zinc-400 border-hairline hover:text-zinc-200'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{sess.name}</span>
                <span className="text-[10px] text-zinc-500">({sess.pid})</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onCreateSession(`pty-${sessions.length + 1}`)}
          className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-200 flex items-center gap-1 shrink-0 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New PTY</span>
        </button>
      </div>

      {/* DANGEROUS COMMAND INTERCEPTION NOTICE */}
      {interceptionNotice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-mono text-amber-200 flex items-start gap-2.5 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{interceptionNotice}</div>
          <button
            onClick={() => setInterceptionNotice(null)}
            className="text-amber-400 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* QUICK COMMAND CHIPS */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <span className="text-[10px] font-mono uppercase text-zinc-500 shrink-0">Quick Cmds:</span>
        {quickCommands.map((q) => (
          <button
            key={q.label}
            onClick={() => handleCommandSubmit(q.cmd)}
            className="px-2.5 py-1 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-[11px] font-mono text-zinc-300 whitespace-nowrap active:scale-95 transition"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* TERMINAL MONITOR WINDOW */}
      <div className="rounded-xl border border-hairline bg-black flex flex-col overflow-hidden shadow-2xl">
        {/* Terminal Header Bar */}
        <div className="bg-carbon px-3 py-2 border-b border-hairline flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="text-[11px] font-mono text-zinc-400 ml-1 truncate">
              {activeSession ? `${activeSession.name} (${activeSession.cwd})` : 'zsh'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter output..."
                className="bg-obsidian text-[10px] font-mono text-zinc-200 px-2 py-0.5 rounded border border-hairline focus:outline-none focus:border-indigo-500 w-24 sm:w-36"
              />
            </div>
            {activeSession && (
              <>
                <button
                  onClick={() => onSendSignal(activeSession.id, 'SIGINT')}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono hover:bg-rose-500/30 active:scale-95"
                  title="Send SIGINT (^C)"
                >
                  ^C
                </button>
                <button
                  onClick={() => onClearOutput(activeSession.id)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-surface text-[10px]"
                  title="Clear screen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Terminal Output Area */}
        <div className="p-3 font-mono text-xs text-zinc-100 min-h-[300px] max-h-[460px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text bg-black/95">
          {filteredOutput || 'Antigravity Mobile PTY session initialized. Type a command below...'}
          <div ref={outputEndRef} />
        </div>

        {/* Command Input Bar */}
        <div className="p-2 bg-carbon border-t border-hairline flex items-center gap-2">
          <span className="text-emerald-400 font-mono text-xs pl-1">❯</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommandSubmit();
            }}
            placeholder="Type terminal command (e.g. git status, npm test)..."
            className="flex-1 bg-obsidian text-xs font-mono text-zinc-100 px-3 py-2 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => handleCommandSubmit()}
            disabled={isExecuting || !commandInput.trim()}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-mono text-white flex items-center gap-1 active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span className="hidden sm:inline">Exec</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemoteTerminal;
