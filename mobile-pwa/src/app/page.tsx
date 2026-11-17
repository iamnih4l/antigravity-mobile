'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AntigravityCompanionClient,
  HealthInfo,
  ModelInfo,
  AgentInfo,
  TaskItem,
  ActivityEvent,
  FileEntry,
  FileContent,
  FileDiff,
  GitStatusInfo,
  GitCommit,
  TerminalSession,
  ApprovalItem,
  DesktopStatus,
  CompanionWsEvent,
  ModelParameterConfig,
  DiscoveredProject,
} from '@/lib/companion-client';
import { BottomNav, MainView } from '@/components/BottomNav';
import { CommandHeader } from '@/components/CommandHeader';
import { OverviewDashboard } from '@/components/OverviewDashboard';
import { ModelManager } from '@/components/ModelManager';
import { AgentManager } from '@/components/AgentManager';
import { TaskComposerModal } from '@/components/TaskComposerModal';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { ProjectFileExplorer } from '@/components/ProjectFileExplorer';
import { RemoteTerminal } from '@/components/RemoteTerminal';
import { GitManager } from '@/components/GitManager';
import { ApprovalCentre } from '@/components/ApprovalCentre';
import { RemoteDesktopView } from '@/components/RemoteDesktopView';
import { DiscoveryView } from '@/components/DiscoveryView';
import { QrPairingModal } from '@/components/QrPairingModal';
import { ConnectionSettingsModal } from '@/components/ConnectionSettingsModal';
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal';

export default function Home() {
  const [activeView, setActiveView] = useState<MainView>('overview');
  const [isOnline, setIsOnline] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string>('');

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('gemini-2.5-pro-antigravity');

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgent, setActiveAgent] = useState<string>('acp-antigravity-coder');

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileEntry[]>([]);

  const [gitStatus, setGitStatus] = useState<GitStatusInfo>({
    isRepo: true,
    workspace: '',
    branch: 'main',
    branches: ['main'],
    changedFiles: [],
    hasConflicts: false,
  });
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});

  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [discoveryData, setDiscoveryData] = useState<Record<string, unknown> | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [liveRevision, setLiveRevision] = useState(0);
  const [token, setToken] = useState<string | null>(null);

  const clientRef = useRef<AntigravityCompanionClient | null>(null);

  const handleWsEvent = useCallback((event: CompanionWsEvent) => {
    if (event.type === 'connected') {
      setIsOnline(true);
    } else if (event.type === 'terminal_output') {
      const { sessionId, data } = event as { sessionId: string; data: string };
      setTerminalOutputs((prev) => ({
        ...prev,
        [sessionId]: ((prev[sessionId] || '') + data).slice(-65536),
      }));
    } else if (event.type === 'approval_requested') {
      const appr = (event as { approval: ApprovalItem }).approval;
      setApprovals((prev) => [appr, ...prev.filter((a) => a.id !== appr.id)]);
    } else if (event.type === 'approval_resolved') {
      const appr = (event as { approval: ApprovalItem }).approval;
      setApprovals((prev) => prev.map((a) => (a.id === appr.id ? appr : a)));
    } else if (event.type === 'model_selected') {
      const { selectedModelId } = event as { selectedModelId: string };
      setCurrentModel(selectedModelId);
    } else if (event.type === 'agent_selected') {
      const { activeAgent: newAgent } = event as { activeAgent: string };
      setActiveAgent(newAgent);
    } else if (event.type === 'file_changed') {
      fetchFiles();
      fetchGitStatus();
      fetchActivity();
      setLiveRevision((r) => r + 1);
    } else if (event.type === 'git_changed') {
      fetchGitStatus();
      fetchActivity();
    } else if (event.type === 'workspace_selected') {
      fetchWorkspaces();
      fetchFiles();
      fetchGitStatus();
      fetchActivity();
      setLiveRevision((r) => r + 1);
    } else if (event.type === 'ide_telemetry') {
      fetchHealth();
      fetchActivity();
      fetchGitStatus();
    }
  }, []);

  const getCompanionUrl = () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('agm_companion_url');
      if (stored) return stored;
      if (process.env.NEXT_PUBLIC_COMPANION_URL) return process.env.NEXT_PUBLIC_COMPANION_URL;
      const hostname = window.location.hostname;
      // If accessing directly from raw local IP
      const isLocalIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      if (isLocalIp) {
        return `http://${hostname}:8787`;
      }
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8787';
      }
    }
    return process.env.NEXT_PUBLIC_COMPANION_URL || 'http://127.0.0.1:8787';
  };

  const handleSaveCompanionUrl = async (rawUrl: string): Promise<{ ok: boolean; message?: string }> => {
    let cleanUrl = rawUrl.trim();
    if (!cleanUrl) return { ok: false, message: 'URL cannot be empty' };

    // Strip trailing slashes and /api/health
    cleanUrl = cleanUrl.replace(/\/+$/, '').replace(/\/api\/health$/, '');

    // Add https:// prefix if protocol is omitted
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Check mixed content when hosted on https:
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      cleanUrl.startsWith('http://') &&
      !cleanUrl.includes('localhost') &&
      !cleanUrl.includes('127.0.0.1')
    ) {
      return {
        ok: false,
        message: 'Mixed Content Error: HTTPS web apps cannot call insecure http:// URLs. Use https:// (Tailscale / Cloudflare tunnel).',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${cleanUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, message: `Server responded with HTTP ${res.status}` };
      }
      const data = await res.json();
      if (data.status === 'online') {
        localStorage.setItem('agm_companion_url', cleanUrl);
        getClient().setBaseUrl(cleanUrl);
        refreshAll();
        return { ok: true };
      }
      return { ok: false, message: 'Unexpected response from companion service.' };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, message: 'Connection timed out after 6 seconds. Verify your tunnel or Tailscale status.' };
      }
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Network request failed',
      };
    }
  };

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new AntigravityCompanionClient({
        baseUrl: getCompanionUrl(),
        onEvent: handleWsEvent,
        onStatusChange: (online) => setIsOnline(online),
      });
      setToken(clientRef.current.getToken());
    }
    return clientRef.current;
  }, [handleWsEvent]);

  // Initial Data Fetch
  const fetchHealth = async () => {
    try {
      const data = await getClient().getHealth();
      setHealth(data);
      setActiveWorkspace(data.activeWorkspace);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await getClient().getWorkspaces();
      const stringWorkspaces = Array.isArray(res.workspaces)
        ? res.workspaces.map((w: any) => (typeof w === 'string' ? w : w?.path || w?.name || String(w))).filter(Boolean)
        : [];
      const active = typeof res.activeWorkspace === 'string' ? res.activeWorkspace : stringWorkspaces[0] || '';
      setWorkspaces(stringWorkspaces.length > 0 ? stringWorkspaces : [active]);
      if (Array.isArray(res.discoveredProjects)) {
        setDiscoveredProjects(res.discoveredProjects);
      }
      if (active) setActiveWorkspace(active);
    } catch {}
  };

  const fetchModels = async () => {
    try {
      const res = await getClient().getModels();
      setModels(Array.isArray(res.models) ? res.models : []);
      if (res.currentModel) setCurrentModel(res.currentModel);
    } catch {}
  };

  const fetchAgents = async () => {
    try {
      const res = await getClient().getAgents();
      setAgents(Array.isArray(res.agents) ? res.agents : []);
      if (res.activeAgent) setActiveAgent(res.activeAgent);
    } catch {}
  };

  const fetchTasks = async () => {
    try {
      const res = await getClient().listTasks();
      setTasks(Array.isArray(res.tasks) ? res.tasks : []);
    } catch {}
  };

  const fetchActivity = async () => {
    try {
      const res = await getClient().getActivity({ limit: 100 });
      setActivityEvents(Array.isArray(res.events) ? res.events : []);
    } catch {}
  };

  const fetchApprovals = async () => {
    try {
      const res = await getClient().listApprovals();
      setApprovals(Array.isArray(res.approvals) ? res.approvals : []);
    } catch {}
  };

  const fetchGitStatus = async () => {
    try {
      const res = await getClient().getGitStatus();
      if (res.status) {
        setGitStatus({
          isRepo: Boolean(res.status.isRepo),
          workspace: res.status.workspace || '',
          branch: res.status.branch || 'main',
          branches: Array.isArray(res.status.branches) ? res.status.branches : ['main'],
          changedFiles: Array.isArray(res.status.changedFiles) ? res.status.changedFiles : [],
          hasConflicts: Boolean(res.status.hasConflicts),
        });
      }
      setGitCommits(Array.isArray(res.commits) ? res.commits : []);
    } catch {}
  };

  const fetchFiles = async (dir = '.') => {
    try {
      const res = await getClient().listFiles(dir);
      const safeFiles = Array.isArray(res.files) ? res.files : [];
      setRecentFiles(safeFiles);
      return { directory: res.directory || dir, files: safeFiles };
    } catch {
      return { directory: dir, files: [] };
    }
  };

  const fetchTerminalSessions = async () => {
    try {
      const res = await getClient().listTerminalSessions();
      setTerminalSessions(res.sessions);
      if (res.sessions.length > 0 && !activeTerminalId) {
        setActiveTerminalId(res.sessions[0].id);
      }
    } catch {}
  };

  const fetchDesktop = async () => {
    try {
      const res = await getClient().getDesktopStatus();
      setDesktopStatus(res);
    } catch {}
  };

  const fetchDiscovery = async () => {
    try {
      const res = await getClient().getDiscovery();
      setDiscoveryData(res);
    } catch {}
  };

  const refreshAll = () => {
    fetchHealth();
    fetchWorkspaces();
    fetchModels();
    fetchAgents();
    fetchTasks();
    fetchActivity();
    fetchApprovals();
    fetchGitStatus();
    fetchFiles();
    fetchTerminalSessions();
    fetchDesktop();
    fetchDiscovery();
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const endpoint = params.get('endpoint');
      const code = params.get('code');
      const tokenParam = params.get('token');

      if (endpoint) {
        const clean = endpoint.replace(/\/+$/, '');
        localStorage.setItem('agm_companion_url', clean);
        getClient().setBaseUrl(clean);
      }
      if (tokenParam) {
        getClient().setToken(tokenParam);
        setToken(tokenParam);
      }
      if (code) {
        getClient().pairDevice(code, 'Mobile Browser').then((res) => {
          setToken(res.token);
          refreshAll();
        }).catch(() => {});
      }
    }

    const client = getClient();
    client.connectWebSocket();
    refreshAll();

    const interval = setInterval(() => {
      fetchHealth();
      fetchApprovals();
      fetchTasks();
      fetchGitStatus();
      fetchActivity();
      fetchFiles();
    }, 5000);

    return () => {
      clearInterval(interval);
      client.disconnect();
    };
  }, [getClient]);

  // Actions
  const handleSelectWorkspace = async (ws: string) => {
    try {
      await getClient().selectWorkspace(ws);
      setActiveWorkspace(ws);
      refreshAll();
    } catch {}
  };

  const handleSelectModel = async (
    modelId: string,
    params: ModelParameterConfig,
    scope: 'acp_session' | 'native_ide'
  ) => {
    await getClient().selectModel(modelId, params, scope);
    setCurrentModel(modelId);
  };

  const handleSelectAgent = async (agentId: string) => {
    await getClient().selectAgent(agentId);
    setActiveAgent(agentId);
  };

  const handleCreateTask = async (taskData: {
    prompt: string;
    modelId: string;
    agentId: string;
    executionMode: 'autonomous' | 'supervised_approval' | 'plan_only';
    targetFile?: string;
    fileContent?: string;
  }) => {
    const res = await getClient().createTask(taskData);
    setTasks((prev) => [res.task, ...prev]);
    fetchActivity();
    fetchFiles();
  };

  const handleCancelTask = async (taskId: string) => {
    await getClient().cancelTask(taskId);
    fetchTasks();
    fetchActivity();
  };

  const handleResolveApproval = async (
    id: string,
    decision: 'approve' | 'reject',
    note?: string
  ) => {
    await getClient().resolveApproval(id, decision, note);
    fetchApprovals();
    fetchActivity();
  };

  const handleCreateTerminalSession = async (name = 'zsh-pty') => {
    const res = await getClient().createTerminalSession(name);
    setTerminalSessions((prev) => [...prev, res]);
    setActiveTerminalId(res.id);
  };

  const handleExecuteTerminalCommand = async (sessionId: string, cmd: string) => {
    const res = await getClient().execTerminalCommand(sessionId, cmd);
    fetchApprovals();
    return res;
  };

  const handleSendTerminalSignal = (sessionId: string, signal: string) => {
    getClient().sendTerminalSignal(sessionId, signal);
  };

  const handleStageFile = async (file: string) => {
    await getClient().gitAction('stage', { file });
    fetchGitStatus();
  };

  const handleUnstageFile = async (file: string) => {
    await getClient().gitAction('unstage', { file });
    fetchGitStatus();
  };

  const handleCommit = async (message: string) => {
    await getClient().gitAction('commit', { message });
    fetchGitStatus();
    fetchActivity();
  };

  const handleSwitchBranch = async (branch: string, create = false) => {
    await getClient().gitAction('checkout', { branch, create });
    fetchGitStatus();
  };

  const handleWriteFile = async (path: string, content: string, origin: 'agent' | 'manual') => {
    await getClient().writeFile(path, content, origin);
    fetchFiles();
    fetchGitStatus();
    fetchActivity();
  };

  const handleQuickSubmitTask = async (prompt: string) => {
    await handleCreateTask({
      prompt,
      modelId: currentModel,
      agentId: activeAgent,
      executionMode: 'autonomous',
    });
  };

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  const activeTaskCount = tasks.filter((t) => t.status === 'running').length;

  return (
    <div className="min-h-screen bg-obsidian text-zinc-100 flex flex-col md:flex-row selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* DESKTOP SIDEBAR & MOBILE NAVIGATION BARS */}
      <BottomNav
        activeView={activeView}
        onSelectView={setActiveView}
        pendingApprovalsCount={pendingCount}
        activeTasksCount={activeTaskCount}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        isOnline={isOnline}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        currentModelId={currentModel}
      />

      {/* MAIN APPLICATION COLUMN */}
      <main className="flex-1 flex flex-col min-w-0 pb-28 md:pb-6">
        <CommandHeader
          activeView={activeView}
          onOpenTaskModal={() => setIsTaskModalOpen(true)}
          onSelectView={setActiveView}
          pendingApprovalsCount={pendingCount}
          isOnline={isOnline}
          ideConnected={Boolean(health?.ideConnected)}
          activeWorkspace={activeWorkspace}
          onOpenConnectionModal={() => setIsConnectionModalOpen(true)}
          onOpenProjectSwitcher={() => {
            fetchWorkspaces();
            setIsProjectSwitcherOpen(true);
          }}
        />

        {/* ACTIVE VIEW CONTENT ROUTER */}
        <div className="flex-1 overflow-y-auto">
          {activeView === 'overview' && (
            <OverviewDashboard
              onSelectView={setActiveView}
              onOpenTaskModal={() => setIsTaskModalOpen(true)}
              activeWorkspace={activeWorkspace}
              workspaces={workspaces}
              onSelectWorkspace={handleSelectWorkspace}
              pendingApprovals={approvals.filter((a) => a.status === 'pending')}
              onResolveApproval={handleResolveApproval}
              tasks={tasks}
              recentFiles={recentFiles}
              currentModel={currentModel}
              activeAgent={activeAgent}
              isOnline={isOnline}
              ideConnected={Boolean(health?.ideConnected)}
              onQuickSubmitTask={handleQuickSubmitTask}
              onOpenFileDiff={(p) => {
                setActiveView('files');
              }}
              onRefresh={refreshAll}
            />
          )}

          {activeView === 'agents' && (
            <AgentManager
              agents={agents}
              activeAgentId={activeAgent}
              onSelectAgent={handleSelectAgent}
              runningTasks={tasks.filter((t) => t.status === 'running')}
              onCancelTask={handleCancelTask}
              onOpenTaskModal={() => setIsTaskModalOpen(true)}
            />
          )}

          {activeView === 'models' && (
            <ModelManager
              models={models}
              currentModelId={currentModel}
              onSelectModel={handleSelectModel}
              onNavigateToDesktop={() => setActiveView('desktop')}
            />
          )}

          {activeView === 'files' && (
            <ProjectFileExplorer
              activeWorkspace={activeWorkspace}
              liveRevision={liveRevision}
              onListDirectory={(dir) => fetchFiles(dir)}
              onReadFile={(path) => getClient().readFile(path)}
              onWriteFile={handleWriteFile}
              onGetDiff={(path) => getClient().getFileDiff(path)}
              onOpenProjectSwitcher={() => {
                fetchWorkspaces();
                setIsProjectSwitcherOpen(true);
              }}
            />
          )}

          {activeView === 'activity' && (
            <ActivityTimeline
              events={activityEvents}
              csvExportUrl={getClient().getActivityCsvUrl()}
              onRefresh={fetchActivity}
            />
          )}

          {activeView === 'terminal' && (
            <RemoteTerminal
              sessions={terminalSessions}
              activeSessionId={activeTerminalId}
              onSelectSession={setActiveTerminalId}
              onCreateSession={handleCreateTerminalSession}
              onExecuteCommand={handleExecuteTerminalCommand}
              terminalOutputs={terminalOutputs}
              onClearOutput={(sid) =>
                setTerminalOutputs((prev) => ({ ...prev, [sid]: '' }))
              }
              onSendSignal={handleSendTerminalSignal}
            />
          )}

          {activeView === 'git' && (
            <GitManager
              status={gitStatus}
              commits={gitCommits}
              onStageFile={handleStageFile}
              onUnstageFile={handleUnstageFile}
              onCommit={handleCommit}
              onSwitchBranch={handleSwitchBranch}
              onRefresh={fetchGitStatus}
              onViewDiff={(f, staged) => getClient().getGitDiff(f, staged).then((d) => alert(d.diff))}
            />
          )}

          {activeView === 'approvals' && (
            <ApprovalCentre
              approvals={approvals}
              onResolve={handleResolveApproval}
              onRefresh={fetchApprovals}
            />
          )}

          {activeView === 'desktop' && (
            <RemoteDesktopView
              status={desktopStatus}
              onSendInput={(payload) => getClient().sendDesktopInput(payload)}
              onRefresh={fetchDesktop}
            />
          )}

          {activeView === 'discovery' && (
            <DiscoveryView
              discoveryData={discoveryData}
              onRefresh={fetchDiscovery}
            />
          )}
        </div>
      </main>

      {/* TASK COMPOSER MODAL */}
      <TaskComposerModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        models={models}
        agents={agents}
        currentModelId={currentModel}
        activeAgentId={activeAgent}
        onSubmit={handleCreateTask}
      />

      {/* QR PAIRING MODAL */}
      <QrPairingModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onFetchQr={() => getClient().getQrCode()}
        onPairDevice={(code, name) => getClient().pairDevice(code, name)}
        currentToken={token}
      />

      {/* CONNECTION / TUNNEL SETTINGS MODAL */}
      <ConnectionSettingsModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        currentUrl={getClient().baseUrl}
        onSaveUrl={handleSaveCompanionUrl}
        isOnline={isOnline}
        onOpenQrModal={() => setIsQrModalOpen(true)}
      />

      {/* PROJECT / FOLDER SWITCHER MODAL */}
      <ProjectSwitcherModal
        isOpen={isProjectSwitcherOpen}
        onClose={() => setIsProjectSwitcherOpen(false)}
        activeWorkspace={activeWorkspace}
        discoveredProjects={discoveredProjects}
        onSelectWorkspace={handleSelectWorkspace}
        onBrowseDirectory={(dir) => getClient().browseWorkspaces(dir)}
      />
    </div>
  );
}
