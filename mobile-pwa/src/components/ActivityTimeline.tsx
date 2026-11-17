'use client';

import React, { useState } from 'react';
import {
  Activity,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  FileText,
  RotateCw,
} from 'lucide-react';
import { ActivityEvent } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface ActivityTimelineProps {
  events: ActivityEvent[];
  csvExportUrl: string;
  onRefresh: () => void;
}

export function ActivityTimeline({
  events,
  csvExportUrl,
  onRefresh,
}: ActivityTimelineProps) {
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'system', label: 'System' },
    { id: 'task', label: 'Agent Tasks' },
    { id: 'terminal_command', label: 'Terminal' },
    { id: 'git', label: 'Git' },
    { id: 'security', label: 'Security' },
    { id: 'permission_request', label: 'Approvals' },
    { id: 'ide_event', label: 'IDE Telemetry' },
  ];

  const filteredEvents = events.filter((evt) => {
    if (categoryFilter !== 'all' && evt.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && evt.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = evt.description?.toLowerCase().includes(q);
      const matchProj = evt.project?.toLowerCase().includes(q);
      const matchAgent = evt.agentName?.toLowerCase().includes(q) || evt.agentId?.toLowerCase().includes(q);
      if (!matchDesc && !matchProj && !matchAgent) return false;
    }
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'pending_approval':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `antigravity-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-4xl mx-auto">
      {/* HEADER & EXPORT ACTIONS */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="font-display font-semibold text-sm sm:text-base text-white">
              Persistent Activity Audit Trail
            </h2>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            Real-time WAL SQLite stream with automatic credential redaction and multi-step agent traces.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 text-xs min-h-[36px] flex items-center justify-center active:scale-95"
            title="Refresh Timeline"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={csvExportUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-200 flex items-center gap-1.5 transition active:scale-95 min-h-[36px]"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV Export</span>
          </a>
          <button
            onClick={handleDownloadJson}
            className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-200 flex items-center gap-1.5 transition active:scale-95 min-h-[36px]"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search descriptions, projects, agents..."
              className="w-full bg-obsidian text-xs text-zinc-200 placeholder-zinc-500 rounded-lg pl-8 pr-3 py-2 border border-hairline focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-obsidian text-xs text-zinc-300 font-mono rounded-lg px-2.5 py-2 border border-hairline focus:outline-none focus:border-indigo-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-obsidian text-xs text-zinc-300 font-mono rounded-lg px-2.5 py-2 border border-hairline focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="pending_approval">Pending Approval</option>
            </select>
          </div>
        </div>
      </div>

      {/* TIMELINE LIST */}
      <div className="hairline-card rounded-xl p-4 border border-hairline bg-surface/30">
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center justify-between">
          <span>Events Stream ({filteredEvents.length})</span>
          <span>SQLite WAL Persistence</span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-lg">
            No activity events matched the selected filters.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline">
            {filteredEvents.map((evt) => {
              const isExpanded = expandedId === evt.id;
              const hasDetails = evt.details && Object.keys(evt.details).length > 0;
              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline bullet node */}
                  <div className="absolute -left-6 top-1.5 w-4 h-4 rounded-full bg-carbon border border-hairline flex items-center justify-center">
                    {getStatusIcon(evt.status)}
                  </div>

                  <div className="rounded-lg border border-hairline bg-obsidian/70 p-3 hover:border-zinc-700 transition space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-surface border border-hairline text-zinc-300">
                          {evt.category}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300 font-medium">
                          {evt.project}
                        </span>
                        {evt.agentName && (
                          <span className="text-[10px] font-mono text-cyan-300">
                            • {evt.agentName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-200 leading-relaxed font-sans font-medium">
                      {evt.description}
                    </p>

                    {hasDetails && (
                      <div className="pt-1">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                          className="text-[10px] font-mono text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <span>{isExpanded ? 'Hide Raw Details' : 'View Payload & Details'}</span>
                        </button>

                        {isExpanded && (
                          <pre className="mt-2 p-2.5 rounded bg-carbon border border-hairline text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
                            {JSON.stringify(evt.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityTimeline;
