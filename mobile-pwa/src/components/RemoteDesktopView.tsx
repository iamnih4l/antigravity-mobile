'use client';

import React, { useState, useRef } from 'react';
import {
  Monitor,
  MousePointer,
  Keyboard,
  RotateCw,
  Maximize2,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DesktopStatus } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface RemoteDesktopViewProps {
  status: DesktopStatus | null;
  onSendInput: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefresh: () => void;
}

export function RemoteDesktopView({
  status,
  onSendInput,
  onRefresh,
}: RemoteDesktopViewProps) {
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * (status?.screenResolution.width || 1920));
    const y = Math.round(((e.clientY - rect.top) / rect.height) * (status?.screenResolution.height || 1080));

    setClickIndicator({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setClickIndicator(null), 800);

    try {
      const res = await onSendInput({ action: 'click', x, y, button: 'left' });
      setLastAction(`Clicked at screen (${x}, ${y})`);
    } catch (err: unknown) {
      setLastAction(`Input error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShortcut = async (keyCombination: string) => {
    try {
      await onSendInput({ action: 'shortcut', shortcut: keyCombination });
      setLastAction(`Dispatched shortcut: ${keyCombination}`);
    } catch (err: unknown) {
      setLastAction(`Shortcut error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const shortcuts = [
    { label: 'Cmd+P', key: 'cmd+p', desc: 'Quick Open' },
    { label: 'Cmd+Shift+P', key: 'cmd+shift+p', desc: 'Command Palette' },
    { label: 'Cmd+S', key: 'cmd+s', desc: 'Save File' },
    { label: 'Cmd+`', key: 'cmd+`', desc: 'Toggle Terminal' },
    { label: 'Esc', key: 'escape', desc: 'Cancel' },
    { label: 'Enter', key: 'enter', desc: 'Accept' },
  ];

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* STATUS STRIP */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-white">
                Remote Desktop & Screen Controller
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Level 1/5: Fully Supported
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              Engine: {status?.mode || 'Companion Virtual Framebuffer & Input Bridge'}
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 active:scale-95 self-start sm:self-auto"
          title="Refresh screen status"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {lastAction && (
        <div className="p-2.5 rounded-lg text-xs font-mono bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
          {lastAction}
        </div>
      )}

      {/* ON-SCREEN IDE SHORTCUT BAR */}
      <div className="hairline-card rounded-xl p-3 border border-hairline bg-surface/30 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
          <span>On-Screen IDE Shortcuts</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {shortcuts.map((sc) => (
            <button
              key={sc.key}
              onClick={() => handleShortcut(sc.key)}
              className="px-3 py-2 rounded-lg bg-obsidian hover:bg-surface border border-hairline text-xs font-mono text-zinc-200 whitespace-nowrap active:scale-95 transition min-h-[44px] flex flex-col items-center justify-center shrink-0"
            >
              <span className="text-indigo-300 font-semibold">{sc.label}</span>
              <span className="text-[9px] text-zinc-500">{sc.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* INTERACTIVE SCREEN CANVAS */}
      <div className="hairline-card rounded-xl overflow-hidden border border-hairline bg-black shadow-2xl">
        <div className="bg-carbon px-3 py-2 border-b border-hairline flex items-center justify-between text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Interactive IDE Display ({status?.screenResolution.width || 1920}x{status?.screenResolution.height || 1080})</span>
          </div>
          <span className="text-[10px] text-zinc-500">Tap to Dispatch Pointer Click</span>
        </div>

        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="relative w-full aspect-[16/10] bg-zinc-950 flex flex-col items-center justify-center cursor-crosshair select-none overflow-hidden"
        >
          {/* Simulated IDE Layout Canvas */}
          <div className="w-full h-full p-4 flex flex-col justify-between text-left opacity-90">
            {/* Top Editor Tab Bar */}
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
              <span className="px-3 py-1 rounded bg-zinc-800 text-xs font-mono text-zinc-200">
                extension.ts
              </span>
              <span className="px-3 py-1 rounded bg-zinc-900 text-xs font-mono text-zinc-500">
                server.mjs
              </span>
            </div>

            {/* Code lines representation */}
            <div className="font-mono text-[11px] text-zinc-400 space-y-1.5 py-4">
              <div className="text-indigo-400">// Google Antigravity IDE Live Canvas</div>
              <div><span className="text-violet-400">export function</span> <span className="text-amber-300">activate</span>(context: ExtensionContext) &#123;</div>
              <div className="pl-4 text-zinc-300">vscode.lm.selectChatModels(&#123;&#125;).then(models =&gt; &#123;</div>
              <div className="pl-8 text-emerald-300">postTelemetry(&apos;model_discovery&apos;, models);</div>
              <div className="pl-4 text-zinc-300">&#125;);</div>
              <div>&#125;</div>
            </div>

            {/* Bottom Status bar representation */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span>TypeScript • UTF-8 • LF • Antigravity Agent Active</span>
              <span className="text-emerald-400">● Live Feed</span>
            </div>
          </div>

          {/* Touch Click Pulse Marker */}
          {clickIndicator && (
            <span
              className="absolute w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-400/30 animate-ping pointer-events-none"
              style={{ left: clickIndicator.x - 16, top: clickIndicator.y - 16 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default RemoteDesktopView;
