'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FolderGit2,
  Folder,
  FolderOpen,
  Search,
  ChevronRight,
  ArrowUp,
  Check,
  RotateCw,
  HardDrive,
} from 'lucide-react';
import { DiscoveredProject, BrowseDirectoryResponse } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface ProjectSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspace: string;
  discoveredProjects: DiscoveredProject[];
  onSelectWorkspace: (wsPath: string) => Promise<void>;
  onBrowseDirectory: (dir?: string) => Promise<BrowseDirectoryResponse>;
}

export function ProjectSwitcherModal({
  isOpen,
  onClose,
  activeWorkspace,
  discoveredProjects,
  onSelectWorkspace,
  onBrowseDirectory,
}: ProjectSwitcherModalProps) {
  const [tab, setTab] = useState<'projects' | 'browse'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [browseData, setBrowseData] = useState<BrowseDirectoryResponse | null>(null);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFolder = async (dir?: string) => {
    setIsLoadingBrowse(true);
    setErrorMsg(null);
    try {
      const res = await onBrowseDirectory(dir);
      setBrowseData(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to browse folder');
    } finally {
      setIsLoadingBrowse(false);
    }
  };

  useEffect(() => {
    if (isOpen && tab === 'browse' && !browseData) {
      loadFolder();
    }
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const handleOpenProject = async (targetPath: string) => {
    setIsOpening(targetPath);
    setErrorMsg(null);
    try {
      await onSelectWorkspace(targetPath);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to open project');
    } finally {
      setIsOpening(null);
    }
  };

  const normalizedActive = activeWorkspace.toLowerCase();
  const filteredProjects = (discoveredProjects || []).filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-obsidian/85 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div
        className="w-full sm:max-w-lg bg-carbon border border-hairline rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[88vh] shadow-2xl safe-bottom overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-switcher-title"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-hairline shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 id="project-switcher-title" className="font-display font-semibold text-sm sm:text-base text-white">
                Open Project Folder
              </h3>
              <p className="text-[11px] text-zinc-400">
                Switch workspace across any folder on your PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface min-w-[40px] min-h-[40px] flex items-center justify-center active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS */}
        <div className="px-4 pt-3 pb-2 border-b border-hairline shrink-0 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-medium transition border',
              tab === 'projects'
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-surface/40 text-zinc-400 border-hairline hover:text-zinc-200'
            )}
          >
            My Projects ({discoveredProjects.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('browse');
              if (!browseData) loadFolder();
            }}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-medium transition border flex items-center justify-center gap-1.5',
              tab === 'browse'
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-surface/40 text-zinc-400 border-hairline hover:text-zinc-200'
            )}
          >
            <HardDrive className="w-3.5 h-3.5" />
            Browse PC Folders
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        {/* TAB 1: DISCOVERED PROJECTS */}
        {tab === 'projects' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full bg-obsidian text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 pl-9 pr-3 py-2.5 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500"
              />
            </div>

            {filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 space-y-2">
                <p>No matching projects found.</p>
                <button
                  type="button"
                  onClick={() => setTab('browse')}
                  className="text-indigo-400 hover:underline font-medium"
                >
                  Browse all folders on your PC →
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredProjects.map((proj) => {
                  const isActive = proj.path.toLowerCase() === normalizedActive;
                  const busy = isOpening === proj.path;
                  return (
                    <button
                      key={proj.path}
                      type="button"
                      disabled={Boolean(isOpening)}
                      onClick={() => handleOpenProject(proj.path)}
                      className={cn(
                        'w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition active:scale-[0.99]',
                        isActive
                          ? 'bg-indigo-500/15 border-indigo-500/50'
                          : 'bg-obsidian/70 border-hairline hover:border-zinc-700 hover:bg-surface/40'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0',
                            proj.isGitRepo
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-surface border-hairline text-zinc-400'
                          )}
                        >
                          {proj.isGitRepo ? <FolderGit2 className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-semibold text-sm text-white truncate">
                              {proj.name}
                            </span>
                            {proj.isGitRepo && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                                Git
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 truncate">
                            {proj.parentName ? `${proj.parentName} / ${proj.name}` : proj.path}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {busy ? (
                          <RotateCw className="w-4 h-4 text-indigo-400 animate-spin" />
                        ) : isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-500/20 px-2 py-1 rounded-md border border-indigo-500/40">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-indigo-400">Open</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FULL FOLDER BROWSER */}
        {tab === 'browse' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {/* Quick jump roots */}
            {browseData?.quickRoots && browseData.quickRoots.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {browseData.quickRoots.map((root) => (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() => loadFolder(root.path)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-mono border whitespace-nowrap transition shrink-0',
                      browseData.currentDir.toLowerCase() === root.path.toLowerCase()
                        ? 'bg-indigo-600/25 border-indigo-500/50 text-indigo-200'
                        : 'bg-surface/60 border-hairline text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    {root.label}
                  </button>
                ))}
              </div>
            )}

            {/* Current path bar + Open Here */}
            <div className="p-2.5 rounded-xl bg-obsidian border border-hairline flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {browseData?.parentDir && (
                  <button
                    type="button"
                    onClick={() => loadFolder(browseData.parentDir!)}
                    className="p-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 shrink-0 active:scale-95"
                    title="Go up one folder"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                )}
                <span className="text-[11px] font-mono text-zinc-300 truncate">
                  {browseData?.currentDir || 'Loading...'}
                </span>
              </div>
              {browseData?.currentDir && (
                <button
                  type="button"
                  disabled={Boolean(isOpening)}
                  onClick={() => handleOpenProject(browseData.currentDir)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-medium text-white shrink-0 active:scale-95"
                >
                  Open Here
                </button>
              )}
            </div>

            {isLoadingBrowse ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400 font-mono">
                <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                Scanning folders...
              </div>
            ) : !browseData || browseData.directories.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                No subfolders inside this directory.
              </div>
            ) : (
              <div className="space-y-1.5">
                {browseData.directories.map((dir) => {
                  const isActive = dir.path.toLowerCase() === normalizedActive;
                  const busy = isOpening === dir.path;
                  return (
                    <div
                      key={dir.path}
                      className={cn(
                        'p-2.5 rounded-xl border flex items-center justify-between gap-2 transition',
                        isActive
                          ? 'bg-indigo-500/15 border-indigo-500/50'
                          : 'bg-obsidian/70 border-hairline hover:border-zinc-700'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => loadFolder(dir.path)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        {dir.isGitRepo ? (
                          <FolderGit2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                        )}
                        <span className="text-xs sm:text-sm font-medium text-zinc-100 truncate">
                          {dir.name}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(isOpening)}
                        onClick={() => handleOpenProject(dir.path)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shrink-0 transition active:scale-95',
                          isActive
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            : 'bg-surface hover:bg-indigo-600 hover:text-white hover:border-indigo-500 text-zinc-200 border-hairline'
                        )}
                      >
                        {busy ? 'Opening...' : isActive ? 'Active' : 'Open'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectSwitcherModal;
