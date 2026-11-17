'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Antigravity Mobile UI Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearStorage = () => {
    try {
      localStorage.removeItem('agm_companion_url');
      localStorage.removeItem('agm_token');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-obsidian text-zinc-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-carbon border border-rose-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-base text-white">
                  Runtime Interface Exception
                </h2>
                <p className="text-xs text-zinc-400">
                  The mobile workspace recovered from an unexpected UI state.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-obsidian border border-hairline font-mono text-xs text-rose-300 overflow-x-auto break-words">
              {this.state.error?.message || 'Unknown client exception'}
            </div>

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Reload App
              </button>
              <button
                onClick={this.handleClearStorage}
                className="px-3 py-2.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-300 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Endpoint
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
