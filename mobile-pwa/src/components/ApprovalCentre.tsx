'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCode,
  Terminal,
  RotateCw,
} from 'lucide-react';
import { ApprovalItem } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface ApprovalCentreProps {
  approvals: ApprovalItem[];
  onResolve: (approvalId: string, decision: 'approve' | 'reject', note?: string) => Promise<void>;
  onRefresh: () => void;
}

export function ApprovalCentre({
  approvals,
  onResolve,
  onRefresh,
}: ApprovalCentreProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const resolvedApprovals = approvals.filter((a) => a.status !== 'pending');

  const handleAction = async (id: string, decision: 'approve' | 'reject') => {
    setResolvingId(id);
    try {
      const note = noteInputs[id] || (decision === 'approve' ? 'Approved via Approval Centre' : 'Rejected via Approval Centre');
      await onResolve(id, decision, note);
    } finally {
      setResolvingId(null);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'low':
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* HEADER BANNER */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="font-display font-semibold text-sm sm:text-base text-white">
              Tool Permission & Guarded Approval Centre
            </h2>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Zero-trust execution interceptor holding high-risk agent operations and terminal commands for human confirmation.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 active:scale-95 self-start sm:self-auto"
          title="Refresh Approvals"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 border-b border-hairline pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5',
            activeTab === 'pending'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <span>Pending Queue</span>
          {pendingApprovals.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-black font-bold">
              {pendingApprovals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('resolved')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5',
            activeTab === 'resolved'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          <span>Audit History ({resolvedApprovals.length})</span>
        </button>
      </div>

      {/* PENDING APPROVALS LIST */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          {pendingApprovals.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-xl">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-70" />
              All permission gates are clear. No pending tool or terminal approvals.
            </div>
          ) : (
            pendingApprovals.map((appr) => {
              const isResolving = resolvingId === appr.id;
              return (
                <div
                  key={appr.id}
                  className="hairline-card rounded-xl p-4 border border-amber-500/40 bg-surface/50 space-y-3 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold', getRiskBadge(appr.riskLevel))}>
                          {appr.riskLevel} RISK
                        </span>
                        <span className="text-xs font-mono text-zinc-400">
                          Category: {appr.category}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(appr.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <h4 className="text-sm font-display font-semibold text-white mt-1">
                        {appr.operation}
                      </h4>
                    </div>
                  </div>

                  {/* Exact Command / Path Inspection Box */}
                  <div className="rounded-lg bg-obsidian p-3 border border-hairline font-mono text-xs text-amber-200 break-all select-text">
                    <span className="text-zinc-500 select-none">$ </span>
                    {appr.commandOrPath}
                  </div>

                  {/* Resolution Note Input */}
                  <div>
                    <input
                      type="text"
                      value={noteInputs[appr.id] || ''}
                      onChange={(e) => setNoteInputs({ ...noteInputs, [appr.id]: e.target.value })}
                      placeholder="Optional audit justification or rejection note..."
                      className="w-full bg-obsidian text-xs font-mono text-zinc-200 placeholder-zinc-500 rounded-lg p-2 border border-hairline focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleAction(appr.id, 'reject')}
                      disabled={isResolving}
                      className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono flex items-center gap-1.5 transition active:scale-95 min-h-[44px]"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{isResolving ? 'Resolving...' : 'Reject & Block'}</span>
                    </button>
                    <button
                      onClick={() => handleAction(appr.id, 'approve')}
                      disabled={isResolving}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono flex items-center gap-1.5 transition active:scale-95 shadow-md min-h-[44px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isResolving ? 'Resolving...' : 'Authorize Execution'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* RESOLVED AUDIT LOG */}
      {activeTab === 'resolved' && (
        <div className="space-y-2.5">
          {resolvedApprovals.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-xl">
              No historical approvals recorded in SQLite database.
            </div>
          ) : (
            resolvedApprovals.map((appr) => (
              <div
                key={appr.id}
                className="p-3 rounded-xl border border-hairline bg-surface/30 flex items-start justify-between gap-2 text-xs font-mono"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-[10px] uppercase px-1.5 py-0.2 rounded border font-semibold',
                        appr.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      )}
                    >
                      {appr.status}
                    </span>
                    <span className="text-zinc-200 truncate">{appr.operation}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate mt-1">{appr.commandOrPath}</div>
                  {appr.resolutionNote && (
                    <div className="text-[10px] text-zinc-500 mt-0.5">Note: {appr.resolutionNote}</div>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {appr.resolvedAt ? new Date(appr.resolvedAt).toLocaleTimeString() : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ApprovalCentre;
