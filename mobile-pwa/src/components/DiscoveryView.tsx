'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Server,
  Layers,
  Shield,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscoveryViewProps {
  discoveryData: Record<string, unknown> | null;
  onRefresh: () => void;
}

export function DiscoveryView({ discoveryData, onRefresh }: DiscoveryViewProps) {
  const os = (discoveryData?.os || {}) as Record<string, unknown>;
  const ide = (discoveryData?.ide || {}) as Record<string, unknown>;
  const runtimes = (discoveryData?.runtimes || {}) as Record<string, unknown>;
  const desktop = (discoveryData?.desktopCompatibility || {}) as Record<string, unknown>;
  const matrix = ((discoveryData?.capabilityMatrix || []) as Array<{
    id: string;
    feature: string;
    classification: string;
    status: string;
  }>);

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* HEADER BANNER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h2 className="font-display font-semibold text-sm sm:text-base text-white">
              Host Environment & Capability Matrix
            </h2>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Real-time inspection of OS runtimes, Google Antigravity IDE binaries, and the 6-tier classification.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 active:scale-95 self-start sm:self-auto"
          title="Rerun host probe"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* HOST ENVIRONMENT TILES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl border border-hairline bg-surface/30">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Host OS</div>
          <div className="text-xs font-semibold text-white mt-1">
            {String(os.platform || 'OS')} ({String(os.arch || '')})
          </div>
          <div className="text-[10px] font-mono text-zinc-500 truncate">{String(os.hostname || '')}</div>
        </div>

        <div className="p-3 rounded-xl border border-hairline bg-surface/30">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Target IDE</div>
          <div className="text-xs font-semibold text-indigo-300 mt-1 truncate">
            Antigravity IDE
          </div>
          <div className="text-[10px] font-mono text-zinc-500">VS Code Fork</div>
        </div>

        <div className="p-3 rounded-xl border border-hairline bg-surface/30">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Node & Git</div>
          <div className="text-xs font-semibold text-emerald-300 mt-1">
            {String(runtimes.node || '')}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 truncate">{String(runtimes.git || 'git ready')}</div>
        </div>

        <div className="p-3 rounded-xl border border-hairline bg-surface/30">
          <div className="text-[10px] font-mono uppercase text-zinc-400">Desktop Engine</div>
          <div className="text-xs font-semibold text-cyan-300 mt-1 truncate">
            {String(desktop.mode || 'Virtual Bridge').split(' ')[0]}
          </div>
          <div className="text-[10px] font-mono text-zinc-500">Touch Coordinate HID</div>
        </div>
      </div>

      {/* 6-TIER TAXONOMY LEGEND */}
      <div className="p-3.5 rounded-xl border border-hairline bg-obsidian/70 space-y-2 text-xs">
        <div className="font-display font-medium text-zinc-200">6-Tier Technical Validation Taxonomy:</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>1. Fully supported</span>
          </div>
          <div className="flex items-center gap-1.5 text-sky-300">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>2. Partially supported</span>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-300">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>3. Requires IDE extension</span>
          </div>
          <div className="flex items-center gap-1.5 text-violet-300">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span>4. Requires ACP</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>5. Requires UI automation</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>6. Unsupported</span>
          </div>
        </div>
      </div>

      {/* CAPABILITY MATRIX ROWS */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/30 space-y-2.5">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2">
          Validated Capabilities ({matrix.length})
        </div>

        <div className="space-y-2">
          {matrix.map((row) => (
            <div
              key={row.id}
              className="p-3 rounded-lg bg-obsidian/60 border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">{row.feature}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">ID: {row.id}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface border border-hairline text-indigo-300">
                  {row.classification}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {row.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DiscoveryView;
