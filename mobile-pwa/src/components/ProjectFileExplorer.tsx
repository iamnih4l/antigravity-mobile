'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FilePlus,
  Trash2,
  Save,
  ChevronRight,
  ChevronDown,
  GitCompare,
  ArrowLeft,
  Bot,
  User,
  Check,
  RotateCw,
} from 'lucide-react';
import { FileEntry, FileContent, FileDiff } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface ProjectFileExplorerProps {
  activeWorkspace: string;
  liveRevision?: number;
  onListDirectory: (dir: string) => Promise<{ directory: string; files: FileEntry[] }>;
  onReadFile: (path: string) => Promise<FileContent>;
  onWriteFile: (path: string, content: string, origin: 'agent' | 'manual') => Promise<void>;
  onGetDiff: (path: string) => Promise<FileDiff>;
  onOpenProjectSwitcher?: () => void;
}

export function ProjectFileExplorer({
  activeWorkspace,
  liveRevision = 0,
  onListDirectory,
  onReadFile,
  onWriteFile,
  onGetDiff,
  onOpenProjectSwitcher,
}: ProjectFileExplorerProps) {
  const [currentDir, setCurrentDir] = useState<string>('.');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [diffView, setDiffView] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);

  const loadDirectory = async (dir: string) => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const res = await onListDirectory(dir);
      setCurrentDir(res.directory);
      setFiles(res.files);
    } catch (err: unknown) {
      setStatusMsg(`Error listing files: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSelectedFile(null);
    setDiffView(null);
    loadDirectory('.');
  }, [activeWorkspace]);

  // Live refresh current folder & non-editing open file whenever workspace changes on PC
  useEffect(() => {
    if (!liveRevision) return;
    onListDirectory(currentDir)
      .then((res) => {
        if (Array.isArray(res.files)) setFiles(res.files);
      })
      .catch(() => {});
    if (selectedFile && !isEditing) {
      onReadFile(selectedFile)
        .then((data) => {
          if (typeof data.content === 'string') setFileContent(data.content);
        })
        .catch(() => {});
    }
  }, [liveRevision]);

  const handleOpenFile = async (file: FileEntry) => {
    if (file.isDirectory) {
      loadDirectory(file.path);
      return;
    }
    setIsLoading(true);
    setStatusMsg(null);
    setDiffView(null);
    try {
      const data = await onReadFile(file.path);
      setSelectedFile(file.path);
      setFileContent(data.content);
      setIsEditing(false);
    } catch (err: unknown) {
      setStatusMsg(`Error opening file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile || isSaving) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await onWriteFile(selectedFile, fileContent, 'manual');
      setStatusMsg('File saved successfully.');
      setIsEditing(false);
    } catch (err: unknown) {
      setStatusMsg(`Save error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInspectDiff = async () => {
    if (!selectedFile) return;
    try {
      const res = await onGetDiff(selectedFile);
      setDiffView(res.diff);
    } catch (err: unknown) {
      setStatusMsg(`Diff error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const targetPath = currentDir === '.' ? newFileName.trim() : `${currentDir}/${newFileName.trim()}`;
    try {
      await onWriteFile(targetPath, '', 'manual');
      setShowNewFileModal(false);
      setNewFileName('');
      loadDirectory(currentDir);
      setStatusMsg(`Created file ${targetPath}`);
    } catch (err: unknown) {
      setStatusMsg(`Creation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currentFolderParts = currentDir === '.' ? [] : currentDir.split(/[/\\]/).filter((p) => p && p !== '.');
  const projectDisplayName = typeof activeWorkspace === 'string' && activeWorkspace
    ? activeWorkspace.split(/[/\\]/).filter(Boolean).pop() || 'Project'
    : 'Project';

  return (
    <div className="p-3.5 sm:p-5 space-y-4 max-w-5xl mx-auto">
      {/* HEADER & BREADCRUMBS */}
      <div className="hairline-card rounded-xl p-3.5 border border-hairline bg-surface/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => loadDirectory('.')}
            className="text-xs font-mono text-indigo-300 hover:text-white px-2 py-1 rounded bg-obsidian border border-indigo-500/30 shrink-0 flex items-center gap-1.5"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>{projectDisplayName}</span>
          </button>
          {currentFolderParts.map((part, idx) => (
            <React.Fragment key={idx}>
              <span className="text-zinc-600 text-xs">/</span>
              <button
                onClick={() => {
                  const target = currentFolderParts.slice(0, idx + 1).join('/');
                  loadDirectory(target);
                }}
                className="text-xs font-mono text-zinc-300 hover:text-white hover:underline px-1 shrink-0"
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onOpenProjectSwitcher && (
            <button
              onClick={onOpenProjectSwitcher}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-medium text-indigo-200 flex items-center gap-1.5 active:scale-95"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Switch Project</span>
            </button>
          )}
          <button
            onClick={() => setShowNewFileModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-200 flex items-center gap-1.5 active:scale-95"
          >
            <FilePlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>New File</span>
          </button>
          <button
            onClick={() => loadDirectory(currentDir)}
            className="p-1.5 rounded-lg bg-surface hover:bg-surfaceHover border border-hairline text-zinc-300 text-xs active:scale-95"
            title="Reload directory"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={cn(
            'p-2.5 rounded-lg text-xs font-mono border',
            statusMsg.includes('Error') || statusMsg.includes('error')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          )}
        >
          {statusMsg}
        </div>
      )}

      {/* NEW FILE MODAL */}
      {showNewFileModal && (
        <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-surface/70 space-y-2.5 animate-fadeIn">
          <div className="text-xs font-semibold text-white">Create New File in {currentDir}</div>
          <form onSubmit={handleCreateFile} className="flex gap-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="e.g. config.json or src/test.ts"
              className="flex-1 bg-obsidian text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowNewFileModal(false)}
              className="px-3 py-2 rounded-lg bg-surface border border-hairline text-xs text-zinc-400"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* FILE EXPLORER / EDITOR SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* LEFT / TREE VIEW (5 cols on lg) */}
        <div className="lg:col-span-5 hairline-card rounded-xl p-3 border border-hairline bg-surface/30 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1 flex items-center justify-between">
            <span>Workspace Tree</span>
            <span>{files.length} items</span>
          </div>

          {currentDir !== '.' && (
            <button
              onClick={() => {
                const parts = currentDir.split(/[/\\]/);
                parts.pop();
                loadDirectory(parts.length ? parts.join('/') : '.');
              }}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-mono text-indigo-400 hover:bg-surface border border-hairline/40 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>.. [Up one directory]</span>
            </button>
          )}

          <div className="space-y-1 max-h-[500px] overflow-y-auto no-scrollbar">
            {files.map((file) => {
              const isSelected = selectedFile === file.path;
              return (
                <div
                  key={file.path}
                  onClick={() => handleOpenFile(file)}
                  className={cn(
                    'p-2 rounded-lg border cursor-pointer flex items-center justify-between gap-2 transition text-xs font-mono',
                    isSelected
                      ? 'bg-indigo-600/15 border-indigo-500/40 text-white'
                      : 'bg-obsidian/40 border-hairline hover:bg-surface text-zinc-300'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {file.isDirectory ? (
                      <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                    ) : (
                      <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {file.origin && !file.isDirectory && (
                      <span
                        className={cn(
                          'text-[9px] uppercase px-1.5 py-0.2 rounded border',
                          file.origin === 'agent'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        )}
                      >
                        {file.origin}
                      </span>
                    )}
                    {!file.isDirectory && (
                      <span className="text-[10px] text-zinc-500">
                        {Math.round(file.size / 1024)}K
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT / CODE VIEWER & DIFF DRAWER (7 cols on lg) */}
        <div className="lg:col-span-7 hairline-card rounded-xl p-3.5 border border-hairline bg-surface/30 space-y-3">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-hairline flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs font-mono font-medium text-white truncate">
                    {selectedFile}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500">
                    {isEditing ? 'Editing Mode' : 'Read-Only Mode'} • {fileContent.length} chars
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleInspectDiff}
                    className="px-2.5 py-1 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-indigo-300 flex items-center gap-1 active:scale-95"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Diff</span>
                  </button>

                  {isEditing ? (
                    <button
                      onClick={handleSaveFile}
                      disabled={isSaving}
                      className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-mono text-white flex items-center gap-1 active:scale-95"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-2.5 py-1 rounded-md bg-surface hover:bg-surfaceHover border border-hairline text-xs font-mono text-zinc-300"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* UNIFIED DIFF VIEW */}
              {diffView !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span>Unified Git Diff</span>
                    <button
                      onClick={() => setDiffView(null)}
                      className="text-indigo-400 hover:underline"
                    >
                      Close Diff
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-obsidian border border-hairline text-[11px] font-mono text-zinc-200 overflow-x-auto max-h-96 whitespace-pre">
                    {diffView || 'No changes detected against HEAD.'}
                  </pre>
                </div>
              ) : isEditing ? (
                <textarea
                  rows={16}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full bg-obsidian text-xs font-mono text-zinc-200 p-3 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500 resize-y leading-relaxed"
                />
              ) : (
                <pre className="p-3 rounded-lg bg-obsidian border border-hairline text-xs font-mono text-zinc-200 overflow-x-auto max-h-[500px] whitespace-pre-wrap leading-relaxed select-text">
                  {fileContent || '(Empty file)'}
                </pre>
              )}
            </>
          ) : (
            <div className="py-24 text-center text-xs text-zinc-500 font-mono border border-dashed border-hairline rounded-lg">
              Select a file from the workspace tree on the left to inspect or edit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectFileExplorer;
