export interface CompanionClientOptions {
  baseUrl: string;
  token?: string;
  onEvent?: (event: CompanionWsEvent) => void;
  onStatusChange?: (online: boolean) => void;
}

export interface HealthInfo {
  status: string;
  alwaysReadyMode: boolean;
  uptimeSeconds: number;
  ideConnected: boolean;
  activeWorkspace: string;
  timestamp: string;
}

export interface QrPairingPayload {
  pairingCode: string;
  expiresAt: string;
  qrDataUrl: string;
  loopbackUrl: string;
}

export interface PairingResponse {
  token: string;
  session: {
    sessionId: string;
    deviceName: string;
    createdAt: string;
    expiresAt: string;
  };
}

export interface ModelParameterConfig {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  family?: string;
  version?: string;
  contextWindow?: number | null;
  available: boolean;
  source: string;
  description?: string;
}

export interface ModelsResponse {
  models: ModelInfo[];
  currentModel: string;
  source: string;
  parameters?: ModelParameterConfig;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: 'native_ide' | 'acp' | 'cli';
  classification: string;
  description: string;
  capabilities: string[];
  active?: boolean;
}

export interface AgentsResponse {
  agents: AgentInfo[];
  activeAgent: string;
}

export interface TaskTraceStep {
  step: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface TaskItem {
  id: string;
  prompt: string;
  modelId: string;
  agentId: string;
  executionMode: 'autonomous' | 'supervised_approval' | 'plan_only';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  trace: TaskTraceStep[];
  result?: Record<string, unknown>;
  error?: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  project: string;
  agentId?: string | null;
  agentName?: string | null;
  modelId?: string | null;
  category: string;
  description: string;
  status: 'completed' | 'warning' | 'error' | 'pending_approval' | 'info';
  durationMs?: number | null;
  taskId?: string | null;
  details?: Record<string, unknown>;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  origin?: 'agent' | 'manual';
  agentId?: string | null;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
  origin?: 'agent' | 'manual';
  agentId?: string | null;
}

export interface FileDiff {
  path: string;
  diff: string;
}

export interface GitChangedFile {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
  staged: boolean;
}

export interface GitStatusInfo {
  isRepo: boolean;
  workspace: string;
  branch: string;
  branches: string[];
  changedFiles: GitChangedFile[];
  hasConflicts: boolean;
  error?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  pid: number;
  createdAt: string;
  status: 'running' | 'exited';
  history: Array<{ command: string; timestamp: string }>;
  recentOutput: string;
}

export interface ApprovalItem {
  id: string;
  createdAt: string;
  resolvedAt?: string | null;
  project: string;
  taskId?: string | null;
  agentId?: string | null;
  category: string;
  operation: string;
  commandOrPath: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected';
  resolutionNote?: string;
}

export interface DiscoveredProject {
  path: string;
  name: string;
  parentName?: string;
  isGitRepo: boolean;
  marker?: string;
  active?: boolean;
}

export interface BrowseDirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  marker: string;
  isProject: boolean;
  active: boolean;
}

export interface BrowseDirectoryResponse {
  currentDir: string;
  parentDir: string | null;
  homeDir: string;
  quickRoots: Array<{ label: string; path: string }>;
  directories: BrowseDirectoryEntry[];
}

export interface DesktopWindow {
  hwnd: number;
  title: string;
  active: boolean;
  isAntigravity: boolean;
}

export interface DesktopStatus {
  supported: boolean;
  mode: string;
  tools: Record<string, boolean>;
  screenResolution: { width: number; height: number };
  activeWindow: string;
  windows?: DesktopWindow[];
  lastError?: string | null;
}

export type CompanionWsEvent =
  | { type: 'connected'; timestamp: string }
  | { type: 'terminal_output'; sessionId: string; data: string; timestamp: string }
  | { type: 'approval_requested'; approval: ApprovalItem }
  | { type: 'approval_resolved'; approval: ApprovalItem }
  | { type: 'model_selected'; selectedModelId: string; parameters?: ModelParameterConfig; scope?: string }
  | { type: 'agent_selected'; activeAgent: string }
  | { type: 'file_changed'; path: string; origin: string; agentId?: string }
  | { type: 'ide_telemetry'; data: Record<string, unknown> }
  | { type: string; [key: string]: unknown };

export class AntigravityCompanionClient {
  public baseUrl: string;
  private token: string | null;
  private ws: WebSocket | null = null;
  private onEvent?: (event: CompanionWsEvent) => void;
  private onStatusChange?: (online: boolean) => void;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor(options: CompanionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token || (typeof window !== 'undefined' ? localStorage.getItem('agm_token') : null);
    this.onEvent = options.onEvent;
    this.onStatusChange = options.onStatusChange;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('agm_token', token);
      else localStorage.removeItem('agm_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(init.headers as Record<string, string>),
    };
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TypeError' && err.message.includes('fetch')) {
        this.onStatusChange?.(false);
      }
      throw err;
    }
  }

  setBaseUrl(newUrl: string) {
    this.baseUrl = newUrl.replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem('agm_companion_url', this.baseUrl);
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connectWebSocket();
  }

  connectWebSocket() {
    if (this.isDestroyed || typeof window === 'undefined') return;
    try {
      const isHttps = this.baseUrl.startsWith('https://');
      const wsUrl = (isHttps
        ? this.baseUrl.replace(/^https:\/\//i, 'wss://')
        : this.baseUrl.replace(/^http:\/\//i, 'ws://')) + '/ws/mobile';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.onStatusChange?.(true);
      };

      this.ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          this.onEvent?.(parsed);
        } catch {
          // Ignore non-json frames
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange?.(false);
        if (!this.isDestroyed) {
          this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.onStatusChange?.(false);
      };
    } catch {
      this.onStatusChange?.(false);
    }
  }

  disconnect() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // --- API Methods ---

  async getHealth(): Promise<HealthInfo> {
    return this.request<HealthInfo>('/api/health');
  }

  async getQrCode(): Promise<QrPairingPayload> {
    return this.request<QrPairingPayload>('/api/auth/qr');
  }

  async pairDevice(pairingCode: string, deviceName = 'Antigravity Mobile Client'): Promise<PairingResponse> {
    const res = await this.request<PairingResponse>('/api/auth/pair', {
      method: 'POST',
      body: JSON.stringify({ pairingCode, deviceName }),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  async getDiscovery(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/api/discovery');
  }

  async getModels(): Promise<ModelsResponse> {
    const data = await this.request<any>('/api/models');
    return {
      models: Array.isArray(data.models) ? data.models : [],
      currentModel: data.selectedModelId || data.currentModel || 'gemini-2.5-pro-antigravity',
      source: data.source || 'acp_registry',
      parameters: data.modelConfig || data.parameters,
    };
  }

  async selectModel(modelId: string, parameters?: ModelParameterConfig, scope = 'acp_session'): Promise<{ selectedModelId: string; parameters?: ModelParameterConfig; scope: string }> {
    return this.request('/api/models/select', {
      method: 'POST',
      body: JSON.stringify({ modelId, parameters, scope }),
    });
  }

  async getAgents(): Promise<AgentsResponse> {
    const data = await this.request<any>('/api/agents');
    const rawAgents = Array.isArray(data.agents) ? data.agents : [];
    const agents: AgentInfo[] = rawAgents.map((a: any) => ({
      id: a.id || 'unknown',
      name: a.name || a.id || 'Agent',
      type: a.type || (a.origin === 'external_cli' ? 'cli' : a.origin || 'acp'),
      classification: a.classification || a.originLabel || 'ACP Agent',
      description: a.description || '',
      capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
      active: typeof a.active === 'boolean' ? a.active : a.status === 'ready' || Boolean(a.isSelected),
    }));
    return {
      agents,
      activeAgent: data.selectedAgentId || data.activeAgent || 'acp-antigravity-coder',
    };
  }

  async selectAgent(agentId: string): Promise<{ activeAgent: string }> {
    return this.request('/api/agents/select', {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    });
  }

  async listTasks(project?: string): Promise<{ tasks: TaskItem[] }> {
    const q = project ? `?project=${encodeURIComponent(project)}` : '';
    const data = await this.request<any>(`/api/tasks${q}`);
    const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
    const tasks: TaskItem[] = rawTasks.map((t: any) => ({
      ...t,
      trace: Array.isArray(t.trace)
        ? t.trace.map((s: any) => ({
            step: typeof s.step === 'string' ? s.step : `${s.event || 'Step'}${s.detail ? ': ' + s.detail : ''}`,
            timestamp: s.timestamp || t.createdAt || new Date().toISOString(),
            details: s.details || (s.detail ? { detail: s.detail } : undefined),
          }))
        : [],
    }));
    return { tasks };
  }

  async createTask(params: {
    prompt: string;
    modelId?: string;
    agentId?: string;
    executionMode?: 'autonomous' | 'supervised_approval' | 'plan_only';
    targetFile?: string;
    fileContent?: string;
  }): Promise<{ task: TaskItem }> {
    return this.request<{ task: TaskItem }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async cancelTask(taskId: string): Promise<{ task: TaskItem }> {
    return this.request<{ task: TaskItem }>('/api/tasks/cancel', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    });
  }

  async getActivity(filters: {
    project?: string;
    agentId?: string;
    modelId?: string;
    category?: string;
    status?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<{ events: ActivityEvent[] }> {
    const params = new URLSearchParams();
    if (filters.project) params.set('project', filters.project);
    if (filters.agentId) params.set('agentId', filters.agentId);
    if (filters.modelId) params.set('modelId', filters.modelId);
    if (filters.category) params.set('category', filters.category);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ events: ActivityEvent[] }>(`/api/activity${qs}`);
  }

  getActivityCsvUrl(filters: Record<string, string> = {}): string {
    const params = new URLSearchParams({ format: 'csv', ...filters });
    return `${this.baseUrl}/api/activity?${params.toString()}`;
  }

  async getWorkspaces(): Promise<{
    activeWorkspace: string;
    workspaces: string[];
    discoveredProjects: DiscoveredProject[];
    homeDir?: string;
  }> {
    const data = await this.request<any>('/api/workspaces');
    const rawList = Array.isArray(data.workspaces) ? data.workspaces : [];
    const workspaces: string[] = rawList.map((w: any) => {
      if (typeof w === 'string') return w;
      if (w && typeof w === 'object') return w.path || w.name || String(w);
      return String(w || '');
    }).filter(Boolean);

    const activeWorkspace = typeof data.activeWorkspace === 'string'
      ? data.activeWorkspace
      : data.activeWorkspace?.path || workspaces[0] || '';

    const discoveredProjects: DiscoveredProject[] = Array.isArray(data.discoveredProjects)
      ? data.discoveredProjects
      : [];

    return {
      activeWorkspace,
      workspaces: workspaces.length > 0 ? workspaces : (activeWorkspace ? [activeWorkspace] : []),
      discoveredProjects,
      homeDir: data.homeDir,
    };
  }

  async browseWorkspaces(dir?: string): Promise<BrowseDirectoryResponse> {
    const q = dir ? `?dir=${encodeURIComponent(dir)}` : '';
    return this.request<BrowseDirectoryResponse>(`/api/workspaces/browse${q}`);
  }

  async selectWorkspace(workspace: string): Promise<{ activeWorkspace: string }> {
    return this.request('/api/workspaces/select', {
      method: 'POST',
      body: JSON.stringify({ workspace }),
    });
  }

  async listFiles(dir = '.'): Promise<{ directory: string; files: FileEntry[] }> {
    const data = await this.request<any>(`/api/files?dir=${encodeURIComponent(dir)}`);
    const rawList = Array.isArray(data.items) ? data.items : Array.isArray(data.files) ? data.files : [];
    const files: FileEntry[] = rawList.map((item: any) => ({
      name: item.name || '',
      path: item.path || '',
      isDirectory: item.type === 'directory' || item.isDirectory === true,
      size: typeof item.size === 'number' ? item.size : 0,
      modifiedAt: item.modifiedAt || new Date().toISOString(),
      origin: item.lastModifiedOrigin || item.origin || 'manual',
      agentId: item.lastModifiedByAgent || item.agentId || null,
    }));
    return {
      directory: data.directory || dir,
      files,
    };
  }

  async readFile(file: string): Promise<FileContent> {
    return this.request(`/api/files?file=${encodeURIComponent(file)}`);
  }

  async writeFile(path: string, content: string, origin: 'agent' | 'manual' = 'manual', agentId?: string): Promise<{ status: string; path: string }> {
    return this.request('/api/files', {
      method: 'POST',
      body: JSON.stringify({ path, content, origin, agentId }),
    });
  }

  async getFileDiff(path: string): Promise<FileDiff> {
    return this.request(`/api/files/diff?path=${encodeURIComponent(path)}`);
  }

  async getGitStatus(): Promise<{ status: GitStatusInfo; commits: GitCommit[] }> {
    return this.request('/api/git/status');
  }

  async getGitDiff(file?: string, staged = false): Promise<{ diff: string }> {
    const p = new URLSearchParams();
    if (file) p.set('file', file);
    if (staged) p.set('staged', 'true');
    const qs = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/api/git/diff${qs}`);
  }

  async gitAction(action: 'stage' | 'unstage' | 'commit' | 'checkout', payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.request('/api/git/action', {
      method: 'POST',
      body: JSON.stringify({ action, ...payload }),
    });
  }

  async listTerminalSessions(): Promise<{ sessions: TerminalSession[] }> {
    return this.request('/api/terminal/sessions');
  }

  async createTerminalSession(name = 'zsh-main'): Promise<TerminalSession> {
    return this.request('/api/terminal/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async execTerminalCommand(sessionId: string, command: string, approved = false): Promise<{ status: string; approvalId?: string; reason?: string }> {
    return this.request('/api/terminal/exec', {
      method: 'POST',
      body: JSON.stringify({ sessionId, command, approved }),
    });
  }

  async sendTerminalSignal(sessionId: string, signal = 'SIGINT'): Promise<{ sessionId: string; signalSent: string }> {
    return this.request('/api/terminal/signal', {
      method: 'POST',
      body: JSON.stringify({ sessionId, signal }),
    });
  }

  async listApprovals(status?: string): Promise<{ approvals: ApprovalItem[] }> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/api/approvals${q}`);
  }

  async resolveApproval(approvalId: string, decision: 'approve' | 'reject', note?: string): Promise<{ approval: ApprovalItem }> {
    return this.request('/api/approvals/resolve', {
      method: 'POST',
      body: JSON.stringify({ approvalId, decision, note }),
    });
  }

  async getDesktopStatus(): Promise<DesktopStatus> {
    const data = await this.request<any>('/api/desktop');
    const width = data.resolution?.width || data.screenResolution?.width || 1920;
    const height = data.resolution?.height || data.screenResolution?.height || 1080;
    return {
      supported: typeof data.supported === 'boolean' ? data.supported : Boolean(data.available),
      mode: data.mode || data.transport || 'Live Windows Screen Capture',
      tools: data.tools || {},
      screenResolution: { width, height },
      activeWindow: data.activeWindow || 'Google Antigravity IDE',
      windows: Array.isArray(data.windows) ? data.windows : [],
      lastError: data.lastError || null,
    };
  }

  async sendDesktopInput(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('/api/desktop/input', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
