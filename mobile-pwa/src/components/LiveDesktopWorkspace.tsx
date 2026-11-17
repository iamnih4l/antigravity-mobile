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
  Bell,
  BellOff,
  Mic,
  MicOff,
  MessageSquare,
  Code2,
  Check,
  OctagonX,
  Sparkles,
  PanelLeft,
  PanelRight,
  Lock,
} from 'lucide-react';
import { DesktopStatus, DesktopWindow } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface LiveDesktopWorkspaceProps {
  baseUrl: string;
  authToken: string | null;
  isOnline: boolean;
  isUnauthorized: boolean;
  status: DesktopStatus | null;
  onSendInput: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRefreshStatus: () => void;
  onOpenConnectionModal: () => void;
}

type TapMode = 'click' | 'double_click' | 'right_click';
type ZoomLevel = 1 | 2 | 3;
type ViewMode = 'chat_right' | 'chat_left' | 'ide' | 'full';
type AgentState = 'idle' | 'working' | 'waiting';

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [587.33, 880.0]; // D5 -> A5 crisp pleasant chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.38);
    });
  } catch {
    // Ignore autoplay restriction before user gesture
  }
}

export function LiveDesktopWorkspace({
  baseUrl,
  authToken,
  isOnline,
  isUnauthorized,
  status,
  onSendInput,
  onRefreshStatus,
  onOpenConnectionModal,
}: LiveDesktopWorkspaceProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('chat_right');
  const [chatPct, setChatPct] = useState<number>(38);
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [tapMode, setTapMode] = useState<TapMode>('click');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [showDoneBanner, setShowDoneBanner] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number } | null>(null);

  const [cropRect, setCropRect] = useState<CropRect>({
    left: 0,
    top: 0,
    width: status?.screenResolution?.width || 1920,
    height: status?.screenResolution?.height || 1080,
  });
  const [activeWinTitle, setActiveWinTitle] = useState<string>(status?.activeWindow || 'Antigravity IDE');

  const imgRef = useRef<HTMLImageElement>(null);
  const prevBlobRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const prevAgentStateRef = useRef<AgentState>('idle');
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const fetchFrame = useCallback(async () => {
    if (!baseUrl || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const maxWidth = viewMode.startsWith('chat') ? 960 : zoom === 1 ? 1280 : 1920;
      const quality = viewMode.startsWith('chat') ? 82 : zoom === 1 ? 74 : 84;
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/desktop/frame?mode=${viewMode}&chatPct=${chatPct}&maxWidth=${maxWidth}&quality=${quality}&t=${Date.now()}`,
        { cache: 'no-store', headers }
      );

      if (res.status === 401) {
        setAuthError(true);
        setFrameError('Session token required. Scan the QR code from Antigravity IDE.');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setAuthError(false);

      const cl = Number(res.headers.get('X-Crop-Left') || 0);
      const ct = Number(res.headers.get('X-Crop-Top') || 0);
      const cw = Number(res.headers.get('X-Crop-Width') || res.headers.get('X-Screen-Width') || 1920);
      const ch = Number(res.headers.get('X-Crop-Height') || res.headers.get('X-Screen-Height') || 1080);
      const win = res.headers.get('X-Active-Window');
      const nextAgent = (res.headers.get('X-Agent-State') || 'idle') as AgentState;

      if (cw > 0 && ch > 0) {
        setCropRect({ left: cl, top: ct, width: cw, height: ch });
      }
      if (win) {
        try {
          setActiveWinTitle(decodeURIComponent(win));
        } catch {
          setActiveWinTitle(win);
        }
      }

      // Trigger alert when agent finishes a working burst!
      if (prevAgentStateRef.current === 'working' && nextAgent === 'waiting') {
        setShowDoneBanner(true);
        if (alertsEnabled) {
          playCompletionChime();
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate([120, 60, 120]);
          }
        }
      } else if (nextAgent === 'working') {
        setShowDoneBanner(false);
      }
      prevAgentStateRef.current = nextAgent;
      setAgentState(nextAgent);

      const blob = await res.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = nextUrl;
      setFrameUrl(nextUrl);
      setFrameError(null);
    } catch (err: unknown) {
      setFrameError(err instanceof Error ? err.message : 'Unable to capture IDE screen');
    } finally {
      inFlightRef.current = false;
    }
  }, [baseUrl, authToken, viewMode, chatPct, zoom, alertsEnabled]);

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
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  const quickRefresh = () => {
    setTimeout(() => fetchFrame(), 180);
    setTimeout(() => fetchFrame(), 650);
  };

  // Exact crop-aware tap-to-screen coordinate mapping!
  const handleScreenTap = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const x = Math.round(cropRect.left + (relX / rect.width) * cropRect.width);
    const y = Math.round(cropRect.top + (relY / rect.height) * cropRect.height);

    setClickRipple({ x: relX, y: relY });
    setTimeout(() => setClickRipple(null), 550);
    setShowDoneBanner(false);

    try {
      await onSendInput({
        action: tapMode,
        x,
        y,
        button: tapMode === 'right_click' ? 'right' : 'left',
      });
      showToast(
        `${tapMode === 'click' ? 'Tapped' : tapMode === 'double_click' ? 'Double-clicked' : 'Right-clicked'} (${x}, ${y})`
      );
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Tap failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Scroll right inside the center of the active crop (chat sidebar when in Chat Focus!)
  const handleScroll = async (delta: number) => {
    try {
      await onSendInput({
        action: 'scroll',
        x: Math.round(cropRect.left + cropRect.width * 0.5),
        y: Math.round(cropRect.top + cropRect.height * 0.5),
        delta,
      });
      showToast(delta > 0 ? 'Scrolled up' : 'Scrolled down');
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Scroll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShortcut = async (combo: string, label: string) => {
    setShowDoneBanner(false);
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
    setShowDoneBanner(false);
    try {
      await onSendInput({
        action: 'type_text',
        text: promptText,
        submit,
      });
      showToast(submit ? 'Sent to Antigravity chat' : 'Pasted into IDE');
      setPromptText('');
      quickRefresh();
    } catch (err: unknown) {
      showToast(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Voice dictation unsupported in this browser — use iPhone keyboard mic.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onstart = () => {
        setIsListening(true);
        showToast('Listening... speak your prompt');
      };
      rec.onresult = (evt: any) => {
        const transcript = Array.from(evt.results)
          .map((r: any) => r[0]?.transcript || '')
          .join('');
        setPromptText(transcript);
      };
      rec.onerror = () => {
        setIsListening(false);
      };
      rec.onend = () => {
        setIsListening(false);
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
      showToast('Could not start voice dictation.');
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

  const cycleZoom = () => setZoom((z) => (z === 1 ? 2 : z === 2 ? 3 : 1));
  const isChatMode = viewMode === 'chat_right' || viewMode === 'chat_left';

  const windows = Array.isArray(status?.windows) ? status!.windows! : [];
  const shortcuts = [
    { label: 'Enter', key: 'enter' },
    { label: 'Esc', key: 'escape' },
    { label: 'Backspace', key: 'backspace' },
    { label: 'Tab', key: 'tab' },
    { label: 'Ctrl+Enter', key: 'ctrl+enter' },
    { label: 'Ctrl+L (Chat)', key: 'ctrl+l' },
    { label: 'Ctrl+I (Inline)', key: 'ctrl+i' },
    { label: 'Ctrl+Shift+P', key: 'ctrl+shift+p' },
    { label: 'Ctrl+S', key: 'ctrl+s' },
    { label: 'Alt+Tab', key: 'alt+tab' },
  ];

  const zoomWidthClass = zoom === 1 ? 'w-full' : zoom === 2 ? 'w-[180%]' : 'w-[260%]';
  const needsAuth = authError || isUnauthorized;

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#09090B] text-zinc-100 overflow-hidden select-none">
      {/* 1. COMPACT TOP HEADER BAR */}
      <header className="shrink-0 px-3 py-2 bg-[#111116]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-semibold text-sm text-white tracking-tight">
                Antigravity
              </span>

              {/* LIVE AGENT STATE PILL */}
              {isOnline && !needsAuth && !frameError ? (
                <button
                  type="button"
                  onClick={onOpenConnectionModal}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition active:scale-95',
                    agentState === 'working'
                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50'
                      : agentState === 'waiting'
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      agentState === 'working'
                        ? 'bg-indigo-400 animate-ping'
                        : 'bg-emerald-400 animate-pulse'
                    )}
                  />
                  {agentState === 'working'
                    ? 'Working…'
                    : agentState === 'waiting'
                    ? 'Ready!'
                    : 'Live'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenConnectionModal}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border bg-rose-500/15 text-rose-300 border-rose-500/35"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {needsAuth ? 'Locked' : 'Offline'}
                </button>
              )}
            </div>
            <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[155px] sm:max-w-xs">
              {activeWinTitle.replace(/\s*-\s*Antigravity IDE$/i, '')}
            </p>
          </div>
        </div>

        {/* TOP RIGHT CONTROLS */}
        <div className="flex items-center gap-1 shrink-0">
          {/* ALERT BELL */}
          <button
            type="button"
            onClick={() => {
              const next = !alertsEnabled;
              setAlertsEnabled(next);
              if (next) playCompletionChime();
              showToast(next ? 'Agent finish alerts ON' : 'Agent finish alerts muted');
            }}
            className={cn(
              'p-2 rounded-lg border text-xs transition active:scale-95',
              alertsEnabled
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35'
                : 'bg-zinc-900 text-zinc-500 border-white/10'
            )}
            title={alertsEnabled ? 'Alerts ON: chime when agent finishes' : 'Alerts muted'}
          >
            {alertsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>

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
              'px-2 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-0.5 transition active:scale-95',
              zoom > 1
                ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/45'
                : 'bg-zinc-900 text-zinc-300 border-white/10'
            )}
            title="Cycle zoom"
          >
            {zoom > 1 ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
            <span>{zoom === 1 ? '1×' : `${zoom}×`}</span>
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

      {/* 2. VIEW MODE + IDE WINDOW SWITCHER BAR */}
      {!isCinemaMode && (
        <div className="shrink-0 px-3 py-1.5 bg-[#0D0D12] border-b border-white/[0.06] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* VIEW MODE PILLS: CHAT FOCUS / IDE ONLY / FULL */}
          <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode(viewMode === 'chat_left' ? 'chat_left' : 'chat_right');
                setZoom(1);
              }}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition',
                isChatMode
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('ide');
                setZoom(1);
              }}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition',
                viewMode === 'ide'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Code2 className="w-3 h-3" />
              <span>IDE</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('full');
                setZoom(1);
              }}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition',
                viewMode === 'full'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Monitor className="w-3 h-3" />
              <span>Full</span>
            </button>
          </div>

          {/* CHAT SIDE & WIDTH ADJUSTER (only in Chat Focus mode) */}
          {isChatMode && (
            <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'chat_right' ? 'chat_left' : 'chat_right')}
                className="p-1 rounded-md bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white active:scale-95"
                title="Switch Chat Sidebar Left / Right"
              >
                {viewMode === 'chat_right' ? (
                  <PanelRight className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <PanelLeft className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setChatPct((p) => Math.max(24, p - 4))}
                className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300"
                title="Narrower chat crop"
              >
                −
              </button>
              <span className="text-zinc-400 w-7 text-center">{chatPct}%</span>
              <button
                type="button"
                onClick={() => setChatPct((p) => Math.min(62, p + 4))}
                className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300"
                title="Wider chat crop"
              >
                +
              </button>
            </div>
          )}

          {/* 1-TAP IDE WINDOW PILLS */}
          {windows.length > 0 && (
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <AppWindow className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              {windows
                .filter((w) => w.isAntigravity || viewMode === 'full')
                .slice(0, 6)
                .map((win) => {
                  const shortLabel =
                    win.title.replace(/\s*-\s*Antigravity IDE$/i, '').split(' - ').pop()?.trim() ||
                    win.title;
                  return (
                    <button
                      key={win.hwnd}
                      type="button"
                      onClick={() => handleFocusWindow(win)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-mono border whitespace-nowrap transition active:scale-95 max-w-[120px] truncate',
                        win.active
                          ? 'bg-indigo-600/25 text-indigo-100 border-indigo-500/60 font-medium'
                          : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/20'
                      )}
                      title={win.title}
                    >
                      {shortLabel}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* AGENT FINISHED NOTIFICATION BANNER */}
      {showDoneBanner && (
        <div className="shrink-0 px-3 py-2 bg-emerald-500/15 border-b border-emerald-500/35 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-200 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Antigravity finished — ready for your review!</span>
          </div>
          <button
            type="button"
            onClick={() => setShowDoneBanner(false)}
            className="text-[10px] font-mono text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. CENTRAL HERO: CHAT FOCUS / IDE / FULL LIVE VIEWPORT */}
      <main className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-auto">
        {frameUrl && !needsAuth ? (
          <div
            className={cn(
              'relative inline-block m-auto',
              isChatMode && zoom === 1 ? 'max-w-[540px] w-full' : zoomWidthClass
            )}
          >
            <img
              ref={imgRef}
              src={frameUrl}
              alt="Live Antigravity IDE Viewport"
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
            {needsAuth ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/35 flex items-center justify-center text-indigo-400 mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="font-display font-semibold text-sm text-white">
                  Session Protected
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Click <strong className="text-white">AG Mobile QR</strong> in the bottom-right corner of Antigravity IDE and scan the QR code to connect securely.
                </p>
                <button
                  type="button"
                  onClick={onOpenConnectionModal}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white active:scale-95"
                >
                  Enter Link / Token
                </button>
              </>
            ) : frameError || !isOnline ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="font-display font-semibold text-sm text-white">
                  {!isOnline ? 'Companion Service Offline' : 'Waiting for Antigravity Window'}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {!isOnline
                    ? 'Open Antigravity IDE on your PC, click "AG Mobile QR" in the bottom-right status bar, and scan.'
                    : `${frameError}. Keep your laptop unlocked and reload Antigravity IDE once if needed.`}
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
                    Connection
                  </button>
                </div>
              </>
            ) : (
              <>
                <RotateCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto" />
                <div className="text-xs font-mono text-zinc-400">Connecting to Antigravity IDE...</div>
              </>
            )}
          </div>
        )}

        {/* FLOATING TOAST FEEDBACK */}
        {toastMsg && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-[#121218]/92 backdrop-blur-md border border-indigo-500/40 text-[11px] font-mono text-indigo-200 shadow-lg pointer-events-none flex items-center gap-1.5">
            <MousePointerClick className="w-3 h-3 text-indigo-400" />
            <span>{toastMsg}</span>
          </div>
        )}
      </main>

      {/* 4. BOTTOM AI-CODING DOCK: QUICK CODING ACTIONS + VOICE & PROMPT COMPOSER */}
      {!isCinemaMode && (
        <footer className="shrink-0 bg-[#111116]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 pt-2 pb-3 safe-bottom space-y-2">
          {/* CODING QUICK ACTIONS + SCROLL + TAP MODE */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px] font-mono">
            <button
              type="button"
              onClick={() => handleShortcut('alt+enter', 'Accept')}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 flex items-center gap-1 shrink-0 active:scale-95"
            >
              <Check className="w-3 h-3" />
              <span>Accept</span>
            </button>

            <button
              type="button"
              onClick={() => handleShortcut('escape', 'Stop / Esc')}
              className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 flex items-center gap-1 shrink-0 active:scale-95"
            >
              <OctagonX className="w-3 h-3" />
              <span>Stop</span>
            </button>

            <button
              type="button"
              onClick={() => handleShortcut('ctrl+l', 'Focus Chat')}
              className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-indigo-200 shrink-0 active:scale-95"
            >
              Chat
            </button>

            <button
              type="button"
              onClick={() => handleScroll(450)}
              className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 flex items-center gap-0.5 shrink-0 active:scale-95"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleScroll(-450)}
              className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 flex items-center gap-0.5 shrink-0 active:scale-95"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Tap mode cycle pill */}
            <button
              type="button"
              onClick={() =>
                setTapMode((m) => (m === 'click' ? 'double_click' : m === 'double_click' ? 'right_click' : 'click'))
              }
              className="px-2 py-1 rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 text-[10px] shrink-0 active:scale-95"
              title="Tap mode: Click / Double / Right"
            >
              {tapMode === 'click' ? 'Tap: 1×' : tapMode === 'double_click' ? 'Tap: 2×' : 'Tap: Right'}
            </button>

            <button
              type="button"
              onClick={() => setShowShortcuts((s) => !s)}
              className={cn(
                'px-2 py-1 rounded-lg border flex items-center gap-1 shrink-0 active:scale-95 transition ml-auto',
                showShortcuts
                  ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                  : 'bg-zinc-900 text-zinc-300 border-white/10'
              )}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="text-[10px]">Keys</span>
            </button>
          </div>

          {/* COLLAPSIBLE EXTRA SHORTCUTS */}
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

          {/* VOICE + LIQUID-GLASS PROMPT COMPOSER BAR */}
          <div className="flex items-end gap-1.5 bg-[#09090B] border border-white/[0.12] focus-within:border-indigo-500/70 rounded-2xl p-1.5 shadow-inner transition-colors">
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={cn(
                'p-2.5 rounded-xl border transition active:scale-95 shrink-0',
                isListening
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
              )}
              title="Voice dictation"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

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
              placeholder="Speak or type prompt for Antigravity..."
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-2 py-2 focus:outline-none resize-none max-h-24 select-text"
            />

            <button
              type="button"
              disabled={!promptText.trim() || isSending}
              onClick={() => handleSendPrompt(false)}
              className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-white/10 text-zinc-300 transition active:scale-95 shrink-0"
              title="Paste only"
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
