'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Monitor,
  MousePointer,
  Keyboard,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Send,
  ClipboardPaste,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  AppWindow,
  AlertTriangle,
} from 'lucide-react';
import { DesktopStatus, DesktopWindow } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface RemoteDesktopViewProps {
  baseUrl: string;
  status: DesktopStatus | null;
  onSendInput: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefresh: () => void;
}

export function RemoteDesktopView({
  baseUrl,
  status,
  onSendInput,
  onRefresh,
}: RemoteDesktopViewProps) {
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const [tapMode, setTapMode] = useState<'click' | 'double_click' | 'right_click'>('click');
  const [chatText, setChatText] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [screenRes, setScreenRes] = useState<{ width: number; height: number }>({
    width: status?.screenResolution?.width || 1920,
    height: status?.screenResolution?.height || 1080,
  });
  const [liveWindowTitle, setLiveWindowTitle] = useState<string>(status?.activeWindow || 'Desktop');

  const imgRef = useRef<HTMLImageElement>(null);
  const prevBlobUrlRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const fetchFrame = useCallback(async () => {
    if (!baseUrl || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const maxWidth = isZoomed ? 1920 : 1280;
      const quality = isZoomed ? 82 : 70;
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/desktop/frame?maxWidth=${maxWidth}&quality=${quality}&t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const w = Number(res.headers.get('X-Screen-Width'));
      const h = Number(res.headers.get('X-Screen-Height'));
      const win = res.headers.get('X-Active-Window');
      if (w > 0 && h > 0) setScreenRes({ width: w, height: h });
      if (win) {
        try {
          setLiveWindowTitle(decodeURIComponent(win));
        } catch {
          setLiveWindowTitle(win);
        }
      }

      const blob = await res.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
      prevBlobUrlRef.current = nextUrl;
      setFrameUrl(nextUrl);
      setFrameError(null);
    } catch (err: unknown) {
      setFrameError(err instanceof Error ? err.message : 'Screen capture unavailable');
    } finally {
      inFlightRef.current = false;
    }
  }, [baseUrl, isZoomed]);

  // Live frame polling loop while Desktop tab is mounted & live is ON
  useEffect(() => {
    fetchFrame();
    if (!isLive) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchFrame();
    }, 650);
    return () => clearInterval(interval);
  }, [isLive, fetchFrame]);

  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, []);

  const scheduleQuickRefresh = () => {
    setTimeout(() => fetchFrame(), 200);
    setTimeout(() => fetchFrame(), 700);
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const x = Math.round((relX / rect.width) * screenRes.width);
    const y = Math.round((relY / rect.height) * screenRes.height);

    setClickIndicator({ x: relX, y: relY });
    setTimeout(() => setClickIndicator(null), 650);

    try {
      await onSendInput({
        action: tapMode,
        x,
        y,
        button: tapMode === 'right_click' ? 'right' : 'left',
      });
      setLastAction(`${tapMode.replace('_', ' ')} at (${x}, ${y})`);
      scheduleQuickRefresh();
    } catch (err: unknown) {
      setLastAction(`Input error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleScroll = async (delta: number) => {
    try {
      await onSendInput({
        action: 'scroll',
        x: Math.round(screenRes.width * 0.75),
        y: Math.round(screenRes.height * 0.5),
        delta,
      });
      setLastAction(delta > 0 ? 'Scrolled up' : 'Scrolled down');
      scheduleQuickRefresh();
    } catch (err: unknown) {
      setLastAction(`Scroll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShortcut = async (keyCombination: string, label?: string) => {
    try {
      await onSendInput({ action: 'shortcut', shortcut: keyCombination });
      setLastAction(`Sent ${label || keyCombination}`);
      scheduleQuickRefresh();
    } catch (err: unknown) {
      setLastAction(`Shortcut error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSendText = async (submit: boolean) => {
    if (!chatText.trim() || isSendingText) return;
    setIsSendingText(true);
    try {
      await onSendInput({
        action: 'type_text',
        text: chatText,
        submit,
      });
      setLastAction(submit ? 'Sent prompt to PC (Paste + Enter)' : 'Pasted text into PC');
      setChatText('');
      scheduleQuickRefresh();
    } catch (err: unknown) {
      setLastAction(`Type error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSendingText(false);
    }
  };

  const handleFocusWindow = async (win: DesktopWindow) => {
    try {
      await onSendInput({ action: 'focus_window', hwnd: win.hwnd, windowTitle: win.title });
      setLiveWindowTitle(win.title);
      setLastAction(`Focused "${win.title}"`);
      scheduleQuickRefresh();
      onRefresh();
    } catch (err: unknown) {
      setLastAction(`Window switch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const shortcuts = [
    { label: 'Enter', key: 'enter' },
    { label: 'Esc', key: 'escape' },
    { label: 'Backspace', key: 'backspace' },
    { label: 'Ctrl+L (Chat)', key: 'ctrl+l' },
    { label: 'Ctrl+I (Inline AI)', key: 'ctrl+i' },
    { label: 'Ctrl+Shift+P', key: 'ctrl+shift+p' },
    { label: 'Ctrl+S', key: 'ctrl+s' },
    { label: 'Alt+Tab', key: 'alt+tab' },
  ];

  const windows = Array.isArray(status?.windows) ? status!.windows! : [];

  return (
    <div className="p-3 sm:p-4 space-y-3 max-w-5xl mx-auto">
      {/* TOP BAR: LIVE STATUS + STREAM CONTROLS */}
      <div className="hairline-card rounded-xl p-3 border border-hairline bg-surface/40 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Monitor className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-xs sm:text-sm text-white">
                Live PC Screen
              </span>
              <span
                className={cn(
                  'text-[10px] font-mono px-1.5 py-0.5 rounded-full border',
                  isLive && !frameError
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                )}
              >
                {isLive && !frameError ? '● LIVE' : 'PAUSED'}
              </span>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[200px] sm:max-w-md">
              {liveWindowTitle} ({screenRes.width}×{screenRes.height})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsLive((v) => !v)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 active:scale-95',
              isLive
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-surface text-zinc-300 border-hairline'
            )}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isLive ? 'Live' : 'Start'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsZoomed((z) => !z)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 active:scale-95',
              isZoomed
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-surface text-zinc-300 border-hairline'
            )}
            title="Toggle 2x zoom for tapping chat boxes & dropdowns"
          >
            {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
            <span>{isZoomed ? '2x' : 'Fit'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRefresh();
              fetchFrame();
            }}
            className="p-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 active:scale-95"
            title="Refresh frame & windows"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1-TAP DESKTOP WINDOW SWITCHER */}
      {windows.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <AppWindow className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          {windows.slice(0, 10).map((win) => (
            <button
              key={win.hwnd}
              type="button"
              onClick={() => handleFocusWindow(win)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-mono border whitespace-nowrap transition active:scale-95 shrink-0 max-w-[180px] truncate',
                win.active
                  ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                  : win.isAntigravity
                  ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/20'
                  : 'bg-surface/60 text-zinc-400 border-hairline hover:text-zinc-200'
              )}
              title={win.title}
            >
              {win.title}
            </button>
          ))}
        </div>
      )}

      {/* LIVE SCREEN CANVAS */}
      <div className="hairline-card rounded-xl border border-hairline bg-obsidian overflow-hidden">
        <div className="px-3 py-1.5 border-b border-hairline bg-carbon/90 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          {/* Tap Mode Switch */}
          <div className="flex items-center gap-1">
            {(['click', 'double_click', 'right_click'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTapMode(m)}
                className={cn(
                  'px-2 py-0.5 rounded border text-[10px] transition',
                  tapMode === m
                    ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                    : 'bg-surface/40 text-zinc-400 border-hairline'
                )}
              >
                {m === 'click' ? 'Click' : m === 'double_click' ? '2× Click' : 'Right'}
              </button>
            ))}
          </div>

          {/* Scroll Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleScroll(420)}
              className="px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 flex items-center gap-0.5 active:scale-95"
            >
              <ChevronUp className="w-3 h-3" /> Up
            </button>
            <button
              type="button"
              onClick={() => handleScroll(-420)}
              className="px-2 py-0.5 rounded bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 flex items-center gap-0.5 active:scale-95"
            >
              <ChevronDown className="w-3 h-3" /> Down
            </button>
          </div>
        </div>

        {/* SCREEN VIEWPORT */}
        <div className={cn('relative w-full bg-black', isZoomed ? 'overflow-auto max-h-[60vh]' : 'overflow-hidden')}>
          {frameUrl ? (
            <div className={cn('relative inline-block', isZoomed ? 'w-[200%]' : 'w-full')}>
              <img
                ref={imgRef}
                src={frameUrl}
                alt="Live PC Screen"
                onClick={handleImageClick}
                draggable={false}
                className="w-full h-auto block select-none cursor-crosshair"
              />
              {clickIndicator && (
                <div
                  className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-cyan-400 bg-cyan-400/25 pointer-events-none animate-ping"
                  style={{ left: clickIndicator.x, top: clickIndicator.y }}
                />
              )}
            </div>
          ) : (
            <div className="py-12 px-4 text-center space-y-2.5">
              {frameError ? (
                <>
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <div className="text-xs font-mono text-amber-300">
                    Screen Capture Unavailable: {frameError}
                  </div>
                  <p className="text-[11px] text-zinc-400 max-w-md mx-auto leading-relaxed">
                    Make sure your laptop screen is unlocked and the companion daemon was started by Antigravity IDE (run <strong>Developer: Reload Window</strong> in Antigravity so it launches inside your desktop session).
                  </p>
                </>
              ) : (
                <>
                  <RotateCw className="w-6 h-6 text-cyan-400 mx-auto animate-spin" />
                  <div className="text-xs font-mono text-zinc-400">Connecting to live PC screen...</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MOBILE TYPE & SEND TO ANTIGRAVITY CHAT BAR */}
      <div className="hairline-card rounded-xl p-3 border border-indigo-500/30 bg-surface/40 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-display font-semibold text-white flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-indigo-400" />
            Type &amp; Send to PC Chat Box
          </span>
          <span className="text-[10px] font-mono text-zinc-400">
            Tap chat input above, then Send
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            rows={2}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Write a prompt for Antigravity IDE's built-in chat bar..."
            className="flex-1 bg-obsidian text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 rounded-lg px-3 py-2 border border-hairline focus:outline-none focus:border-indigo-500 resize-none"
          />
          <div className="flex sm:flex-col gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!chatText.trim() || isSendingText}
              onClick={() => handleSendText(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
            <button
              type="button"
              disabled={!chatText.trim() || isSendingText}
              onClick={() => handleSendText(false)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-surface hover:bg-surfaceHover disabled:opacity-40 border border-hairline text-xs font-mono text-zinc-300 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          </div>
        </div>

        {lastAction && (
          <div className="text-[10px] font-mono text-cyan-300 flex items-center gap-1.5">
            <MousePointer className="w-3 h-3" />
            <span>{lastAction}</span>
          </div>
        )}
      </div>

      {/* IDE SHORTCUT KEYS */}
      <div className="hairline-card rounded-xl p-3 border border-hairline bg-surface/30 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Quick Keyboard Shortcuts
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shortcuts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => handleShortcut(s.key, s.label)}
              className="px-2.5 py-1.5 rounded-lg bg-obsidian hover:bg-surface border border-hairline text-[11px] font-mono text-zinc-200 transition active:scale-95"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RemoteDesktopView;
