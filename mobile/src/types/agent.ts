export interface AgentProject {
  id: string;
  name: string;
  path: string;
  exists: boolean;
  openOnPc: boolean;
  sessionCount: number;
  lastActivity: string;
  hasRunningTurn: boolean;
  hasPendingPermission: boolean;
  sessions: AgentSession[];
}

export interface AgentSession {
  sessionId: string;
  title: string;
  cwd: string;
  updatedAt: string;
  isRunning: boolean;
  isAwaitingPermission: boolean;
  activeOnPc?: boolean;
}

export interface AgentConfigOptionItem {
  value: string;
  name: string;
  description?: string;
}

export interface AgentConfigOption {
  id: string;
  name: string;
  category?: string;
  type?: string;
  currentValue: string;
  options: AgentConfigOptionItem[];
}

export interface ToolCallItem {
  tool_call_id: string;
  name: string;
  title: string;
  kind: string;
  args?: any;
  status: "in_progress" | "pending" | "completed" | "failed";
  preview?: string;
  has_more?: boolean;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind?: string;
}

export interface PermissionRequestPayload {
  request_id: string;
  tool_call: any;
  options: PermissionOption[];
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thoughts?: string;
  timestamp: string;
  streaming?: boolean;
  stop_reason?: string;
  tools?: ToolCallItem[];
  queue_position?: number;
}

export interface SessionTurnState {
  state: "idle" | "running" | "awaiting_permission";
  pendingPermission: PermissionRequestPayload | null;
  queueDepth: number;
}
