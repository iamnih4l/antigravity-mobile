'use client';

import React, { useState } from 'react';
import {
  X,
  Wifi,
  ShieldCheck,
  Globe,
  Lock,
  Copy,
  Check,
  RotateCw,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSaveUrl: (url: string) => Promise<boolean>;
  isOnline: boolean;
  onOpenQrModal: () => void;
}

export function ConnectionSettingsModal({
  isOpen,
  onClose,
  currentUrl,
  onSaveUrl,
  isOnline,
  onOpenQrModal,
}: ConnectionSettingsModalProps) {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedTunnel, setCopiedTunnel] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isTesting) return;
    setIsTesting(true);
    setTestResult(null);

    const formatted = urlInput.trim().replace(/\/+$/, '');
    try {
      const ok = await onSaveUrl(formatted);
      if (ok) {
        setTestResult({ ok: true, message: 'Successfully connected to Companion Service!' });
        setTimeout(() => onClose(), 1200);
      } else {
        setTestResult({
          ok: false,
          message: 'Could not reach /api/health. Ensure the companion daemon and tunnel are running.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedTunnel(id);
    setTimeout(() => setCopiedTunnel(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-obsidian/85 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div
        className="w-full sm:max-w-lg bg-carbon border border-hairline rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conn-modal-title"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 id="conn-modal-title" className="font-display font-semibold text-sm sm:text-base text-white">
                Companion Service Host Endpoint
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                {isOnline ? '● Connected' : '○ Standby / Disconnected'}
              </p>
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

        {/* VERCEL NOTICE ON MIXED CONTENT */}
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 space-y-1.5 leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 text-white">
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            Vercel (HTTPS) + Local Machine Setup
          </div>
          <p className="text-[11px] text-zinc-300">
            When hosting on Vercel (`https://...`), web browsers enforce <strong>Mixed Content</strong> security: your Companion Service URL must use <span className="font-mono text-indigo-300">https://</span> (or a secure tunnel like Tailscale Serve, Cloudflare Tunnel, or ngrok).
          </p>
        </div>

        {testResult && (
          <div
            className={cn(
              'p-2.5 rounded-lg text-xs font-mono border',
              testResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            )}
          >
            {testResult.message}
          </div>
        )}

        {/* URL FORM */}
        <form onSubmit={handleTestAndSave} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
              Companion Service URL
            </label>
            <div className="relative">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://your-machine.tailnet.ts.net or https://xyz.trycloudflare.com"
                className="w-full bg-obsidian text-xs sm:text-sm font-mono text-zinc-100 placeholder-zinc-500 px-3 py-2.5 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500 pr-12"
              />
            </div>
            <div className="text-[10px] font-mono text-zinc-500 mt-1">
              Stored in local browser storage (`agm_companion_url`).
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isTesting || !urlInput.trim()}
              className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition active:scale-98 shadow-md flex items-center justify-center gap-2 min-h-[44px]"
            >
              <RotateCw className={cn('w-3.5 h-3.5', isTesting && 'animate-spin')} />
              <span>{isTesting ? 'Testing Connection...' : 'Connect & Save'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput('http://127.0.0.1:8787');
              }}
              className="px-3 py-2.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-400"
            >
              Reset 127.0.0.1
            </button>
          </div>
        </form>

        {/* 1-COMMAND TUNNEL RECIPES */}
        <div className="space-y-2.5 pt-2 border-t border-hairline">
          <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
            Recommended HTTPS Tunnels (Run on your laptop)
          </label>

          {/* Option 1: Tailscale Serve */}
          <div className="hairline-card p-2.5 rounded-lg bg-surface/30 border border-hairline space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">1. Tailscale Serve (Best for private VPN)</span>
              <button
                onClick={() => copyCommand('tailscale serve --bg 8787', 'ts')}
                className="text-[10px] font-mono text-indigo-400 hover:underline flex items-center gap-1"
              >
                {copiedTunnel === 'ts' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedTunnel === 'ts' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-[10px] text-zinc-400 bg-obsidian p-1.5 rounded">
              tailscale serve --bg 8787
            </div>
          </div>

          {/* Option 2: Cloudflare Tunnel */}
          <div className="hairline-card p-2.5 rounded-lg bg-surface/30 border border-hairline space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">2. Cloudflare Quick Tunnel (Free, No Account)</span>
              <button
                onClick={() => copyCommand('cloudflared tunnel --url http://127.0.0.1:8787', 'cf')}
                className="text-[10px] font-mono text-indigo-400 hover:underline flex items-center gap-1"
              >
                {copiedTunnel === 'cf' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedTunnel === 'cf' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-[10px] text-zinc-400 bg-obsidian p-1.5 rounded">
              cloudflared tunnel --url http://127.0.0.1:8787
            </div>
          </div>

          {/* Option 3: ngrok */}
          <div className="hairline-card p-2.5 rounded-lg bg-surface/30 border border-hairline space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">3. ngrok</span>
              <button
                onClick={() => copyCommand('ngrok http 8787', 'ngrok')}
                className="text-[10px] font-mono text-indigo-400 hover:underline flex items-center gap-1"
              >
                {copiedTunnel === 'ngrok' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedTunnel === 'ngrok' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-[10px] text-zinc-400 bg-obsidian p-1.5 rounded">
              ngrok http 8787
            </div>
          </div>
        </div>

        {/* BOTTOM QR LINK */}
        <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
          <span className="text-zinc-400">Need to pair token via camera?</span>
          <button
            onClick={() => {
              onClose();
              onOpenQrModal();
            }}
            className="text-indigo-400 font-mono hover:underline"
          >
            Open QR Code →
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionSettingsModal;
