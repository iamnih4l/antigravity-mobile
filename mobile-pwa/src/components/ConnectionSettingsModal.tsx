'use client';

import React, { useState, useEffect } from 'react';
import { X, Globe, RotateCw, Check, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSaveUrl: (url: string) => Promise<{ ok: boolean; message?: string }>;
  isOnline: boolean;
}

export function ConnectionSettingsModal({
  isOpen,
  onClose,
  currentUrl,
  onSaveUrl,
  isOnline,
}: ConnectionSettingsModalProps) {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(currentUrl);
      setTestResult(null);
    }
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isTesting) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await onSaveUrl(urlInput.trim());
      if (res.ok) {
        setTestResult({ ok: true, message: 'Connected to your PC!' });
        setTimeout(() => onClose(), 900);
      } else {
        setTestResult({
          ok: false,
          message: res.message || 'Could not reach PC companion service.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div
        className="w-full sm:max-w-md bg-[#121218] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conn-modal-title"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 id="conn-modal-title" className="font-display font-semibold text-sm text-white">
                PC Connection
              </h3>
              <p className="text-[11px] font-mono text-zinc-400">
                {isOnline ? '● Connected' : '○ Offline'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2.5 leading-relaxed">
          <Smartphone className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-300">
            Easiest way: click <strong className="text-white">AG Mobile QR</strong> in the bottom-right corner of Antigravity IDE and scan the QR code with your iPhone camera.
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

        <form onSubmit={handleTestAndSave} className="space-y-3">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
              Cloudflare Tunnel URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://xxxx.trycloudflare.com"
              className="w-full bg-[#09090B] text-xs sm:text-sm font-mono text-zinc-100 placeholder-zinc-500 px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isTesting || !urlInput.trim()}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white transition active:scale-[0.98] flex items-center justify-center gap-2 min-h-[44px]"
          >
            {isTesting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Connect &amp; Save</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ConnectionSettingsModal;
