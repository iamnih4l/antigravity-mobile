'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Monitor,
  Send,
  ClipboardPaste,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  RotateCw,
  ZoomIn,
  ZoomOut,
  AppWindow,
  Settings2,
  Keyboard,
  AlertTriangle,
  Maximize2,
  Minimize2,
  MousePointerClick,
} from 'lucide-react';
import { DesktopStatus, DesktopWindow } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface LiveDesktopWorkspaceProps {
  baseUrl: string;
  isOnline: boolean;
  status: DesktopStatus | null;
  onSendInput: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefreshStatus: () => void;
  onOpenConnectionModal: () => void;
}

type TapMode = 'click' | 'double_click' | 'right_click';
type ZoomLevel = 1 | 2 | 3;

export function LiveDesktopWorkspace({
  baseUrl,
  isOnline,
  status,
  onSendInput,
  onRefreshStatus,
  onOpenConnectionModal,
}: LiveDesktopWorkspaceProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [tapMode, setTapMode] = useState<TapMode>('click');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number } | null>(null);
  const [screenRes, setScreenRes] = useState<{ width: number; height: number }>({
    width: status?.screenResolution?.width || 1920,
    height: status?.screenResolution?.height || 1080,
  });
  const [activeWinTitle, setActiveWinTitle] = useState<string>(status?.activeWindow || 'PC Desktop');

  const imgRef = useRef<HTMLImageElement>(null);
  const prevBlobRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const fetchFrame = useCallback(async () => {
    if (!baseUrl || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const maxWidth = zoom === 1 ? 1280 : 1920;
      const quality = zoom === 1 ? 72 : 84;
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/desktop/frame?maxWidth=${maxWidth}&quality=${quality}&t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const w = Number(res.headers.get('X-Screen-Width'));
      const h = Number(res.headers.get('X-Screen-Height'));
      const win = res.headers.get('X-Active-Window');
      if (w > 0 && h > 0) setScreenRes({ width: w, height: h });
      if (win) {
        try {
          setActiveWinTitle(decodeURIComponent(win));
        } catch {
          setActiveWinTitle(win);
        }
      }

      const blob = await res.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = nextUrl;
      setFrameUrl(nextUrl);
      setFrameError(null);
    } catch (err: unknown) {
      setFrameError(err instanceof Error ? err.message : 'Unable to capture PC screen');
    } finally {
      inFlightRef.current = false;
    }
  }, [baseUrl, zoom]);

  useEffect(() => {
    fetchFrame();
    if (!isLive) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchFrame();
    }, 600);
    return () => clearInterval(timer);
  }, [isLive, fetchFrame]);

  useEffect(() => {
    return () => {
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const quickRefresh = () => {
    setTimeout(() => fetchFrame(), 180);
    setTimeout(() => fetchFrame(), 650);
  };

  const handleScreenTap = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const x = Math.round((relX / rect.width) * screenRes.width);
    const y = Math.round((relY / rect.height) * screenRes.height);

    setClickRipple({ x: relX, y: relY });
    setTimeout(() => setClickRipple(null), 550);

    try {
      await onSendInput({
        action: tapMode,
        x,
        y,
        button: tapMode === 'right_click' ? 'right' : 'left',
      });
      showToast(`${tapMode === 'click' ? 'Clicked' : tapMode === 'double_click' ? 'Double-clicked' : 'Right-clicked'} (${x}, ${y})`);
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Tap failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleScroll = async (delta: number) => {
    try {
      await onSendInput({
        action: 'scroll',
        x: Math.round(screenRes.width * 0.78),
        y: Math.round(screenRes.height * 0.5),
        delta,
      });
      showToast(delta > 0 ? 'Scrolled up' : 'Scrolled down');
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Scroll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShortcut = async (combo: string, label: string) => {
    try {
      await onSendInput({ action: 'shortcut', shortcut: combo });
      showToast(`Sent ${label}`);
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Shortcut error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSendPrompt = async (submit: boolean) => {
    if (!promptText.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendInput({
        action: 'type_text',
        text: promptText,
        submit,
      });
      showToast(submit ? 'Sent to Antigravity chat' : 'Pasted on PC');
      setPromptText('');
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleFocusWindow = async (win: DesktopWindow) => {
    try {
      await onSendInput({ action: 'focus_window', hwnd: win.hwnd, windowTitle: win.title });
      setActiveWinTitle(win.title);
      showToast(`Switched to ${win.title.split(' - ')[0]}`);
      quickRefresh();
      onRefreshStatus();
    } catch (err: unknown) {
      showToast(`Switch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const cycleZoom = () => {
    setZoom((z) => (z === 1 ? 2 : z === 2 ? 3 : 1));
  };

  const windows = Array.isArray(status?.windows) ? status!.windows! : [];
  const shortcuts = [
    { label: 'Enter', key: 'enter' },
    { label: 'Esc', key: 'escape' },
    { label: 'Backspace', key: 'backspace' },
    { label: 'Tab', key: 'tab' },
    { label: 'Ctrl+L (Chat)', key: 'ctrl+l' },
    { label: 'Ctrl+I (Inline)', key: 'ctrl+i' },
    { label: 'Ctrl+Shift+P', key: 'ctrl+shift+p' },
    { label: 'Ctrl+S', key: 'ctrl+s' },
    { label: 'Alt+Tab', key: 'alt+tab' },
  ];

  const zoomWidthClass = zoom === 1 ? 'w-full' : zoom === 2 ? 'w-[200%]' : 'w-[300%]';

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#09090B] text-zinc-100 overflow-hidden select-none">
      {/* 1. COMPACT TOP HEADER BAR */}
      <header className="shrink-0 px-3 py-2 bg-[#111116]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Monitor className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-semibold text-sm text-white tracking-tight">
                Antigravity
              </span>
              <button
                type="button"
                onClick={onOpenConnectionModal}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition active:scale-95',
                  isOnline && !frameError
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : isOnline
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    isOnline && !frameError
                      ? 'bg-emerald-400 animate-pulse'
                      : isOnline
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  )}
                />
                {isOnline && !frameError ? 'Live' : isOnline ? 'Standby' : 'Offline'}
              </button>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[165px] sm:max-w-xs">
              {activeWinTitle}
            </p>
          </div>
        </div>

        {/* TOP RIGHT CONTROLS */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsLive((v) => !v)}
            className={cn(
              'p-2 rounded-lg border text-xs transition active:scale-95',
              isLive
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : 'bg-zinc-900 text-zinc-400 border-white/10'
            )}
            title={isLive ? 'Pause live stream' : 'Resume live stream'}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={cycleZoom}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1 transition active:scale-95',
              zoom > 1
                ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/45'
                : 'bg-zinc-900 text-zinc-300 border-white/10'
            )}
            title="Cycle zoom: Fit / 2x / 3x"
          >
            {zoom > 1 ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
            <span>{zoom === 1 ? 'Fit' : `${zoom}×`}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCinemaMode((c) => !c)}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 transition active:scale-95"
            title={isCinemaMode ? 'Show controls' : 'Expand screen'}
          >
            {isCinemaMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onOpenConnectionModal}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 transition active:scale-95"
            title="Connection settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. 1-TAP PC WINDOW SWITCHER STRIP */}
      {!isCinemaMode && windows.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 bg-[#0D0D12] border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <AppWindow className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          {windows.slice(0, 12).map((win) => {
            const shortLabel = win.title.replace(/\s*-\s*Antigravity IDE$/i, '').trim() || win.title;
            return (
              <button
                key={win.hwnd}
                type="button"
                onClick={() => handleFocusWindow(win)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-mono border whitespace-nowrap transition active:scale-95 shrink-0 max-w-[175px] truncate',
                  win.active
                    ? 'bg-indigo-600/25 text-indigo-100 border-indigo-500/60 font-medium'
                    : win.isAntigravity
                    ? 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/20'
                    : 'bg-zinc-900/80 text-zinc-400 border-white/10 hover:text-zinc-200'
                )}
                title={win.title}
              >
                {shortLabel}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onRefreshStatus();
              fetchFrame();
            }}
            className="p-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white shrink-0 active:scale-95 ml-auto"
            title="Refresh windows"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 3. CENTRAL HERO: EDGE-TO-EDGE LIVE PC SCREEN VIEWPORT */}
      <main className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-auto">
        {frameUrl ? (
          <div className={cn('relative inline-block m-auto', zoomWidthClass)}>
            <img
              ref={imgRef}
              src={frameUrl}
              alt="Live Antigravity PC Screen"
              onClick={handleScreenTap}
              draggable={false}
              className="w-full h-auto block cursor-crosshair"
            />
            {clickRipple && (
              <div
                className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-indigo-400 bg-indigo-400/25 pointer-events-none animate-ping"
                style={{ left: clickRipple.x, top: clickRipple.y }}
              />
            )}
          </div>
        ) : (
          <div className="p-6 text-center max-w-sm space-y-3">
            {frameError || !isOnline ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="font-display font-semibold text-sm text-white">
                  {!isOnline ? 'Companion Service Offline' : 'Waiting for PC Screen'}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {!isOnline
                    ? 'Scan the QR code from "AG Mobile QR" in Antigravity IDE or tap Configure below to update your tunnel URL.'
                    : `${frameError}. Make sure your laptop screen is unlocked and reload Antigravity IDE once if needed.`}
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshStatus();
                      fetchFrame();
                    }}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white flex items-center gap-1.5 active:scale-95"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={onOpenConnectionModal}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white active:scale-95"
                  >
                    Connection Settings
                  </button>
                </div>
              </>
            ) : (
              <>
                <RotateCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto" />
                <div className="text-xs font-mono text-zinc-400">Connecting to live PC screen...</div>
              </>
            )}
          </div>
        )}

        {/* FLOATING TOAST FEEDBACK */}
        {toastMsg && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-[#121218]/90 backdrop-blur-md border border-indigo-500/40 text-[11px] font-mono text-indigo-200 shadow-lg pointer-events-none flex items-center gap-1.5">
            <MousePointerClick className="w-3 h-3 text-indigo-400" />
            <span>{toastMsg}</span>
          </div>
        )}
      </main>

      {/* 4. BOTTOM INTERACTION DOCK: TAP CONTROLS + KEYBOARD + PROMPT COMPOSER */}
      {!isCinemaMode && (
        <footer className="shrink-0 bg-[#111116]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 pt-2 pb-3 safe-bottom space-y-2">
          {/* ACTION TOOLBAR: Click mode, Scroll, Shortcuts toggle */}
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-white/[0.08]">
              {(['click', 'double_click', 'right_click'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTapMode(m)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[10px] transition',
                    tapMode === m
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  {m === 'click' ? 'Click' : m === 'double_click' ? '2×' : 'Right'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleScroll(450)}
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 flex items-center gap-0.5 active:scale-95"
                title="Scroll up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span className="text-[10px]">Up</span>
              </button>
              <button
                type="button"
                onClick={() => handleScroll(-450)}
                className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 flex items-center gap-0.5 active:scale-95"
                title="Scroll down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="text-[10px]">Down</span>
              </button>
              <button
                type="button"
                onClick={() => setShowShortcuts((s) => !s)}
                className={cn(
                  'px-2 py-1 rounded-lg border flex items-center gap-1 active:scale-95 transition',
                  showShortcuts
                    ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                    : 'bg-zinc-900 text-zinc-300 border-white/10'
                )}
                title="Toggle keyboard shortcuts"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span className="text-[10px]">Keys</span>
              </button>
            </div>
          </div>

          {/* COLLAPSIBLE IDE SHORTCUTS STRIP */}
          {showShortcuts && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {shortcuts.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleShortcut(s.key, s.label)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-[11px] font-mono text-zinc-200 whitespace-nowrap shrink-0 active:scale-95"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* LIQUID-GLASS PROMPT COMPOSER BAR */}
          <div className="flex items-end gap-2 bg-[#09090B] border border-white/[0.12] focus-within:border-indigo-500/70 rounded-2xl p-1.5 shadow-inner transition-colors">
            <textarea
              rows={1}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendPrompt(true);
                }
              }}
              placeholder="Tap chat box above, then type & send..."
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-2.5 py-2 focus:outline-none resize-none max-h-24 select-text"
            />
            <button
              type="button"
              disabled={!promptText.trim() || isSending}
              onClick={() => handleSendPrompt(false)}
              className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-white/10 text-zinc-300 transition active:scale-95 shrink-0"
              title="Paste only (without pressing Enter)"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!promptText.trim() || isSending}
              onClick={() => handleSendPrompt(true)}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-35 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-500/20 transition active:scale-95 shrink-0"
              title="Paste & press Enter"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

export default LiveDesktopWorkspace;
