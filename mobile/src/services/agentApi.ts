import { AgentProject, AgentSession, AgentMessage, AgentConfigOption } from "../types/agent";

function buildHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.trim()}`,
  };
}

export interface SessionHistoryPayload {
  messages: AgentMessage[];
  configOptions: AgentConfigOption[];
  commands: Array<{ name: string; description: string }>;
  session?: any;
  syncError?: string | null;
}

export function mapBackendMessages(rawList: any[]): AgentMessage[] {
  return (rawList || []).map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content || "",
    thoughts: m.thoughts || "",
    timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString() : "",
    stop_reason: m.stop_reason || "",
    tools: (m.tools || []).map((t: any) => ({
      tool_call_id: t.tool_call_id,
      name: t.name,
      title: t.title || t.name,
      kind: t.kind,
      args: t.args,
      status: t.status,
      preview: t.raw_output || t.preview || "",
    })),
  }));
}

export async function fetchAgentStatus(
  ip: string,
  port: string,
  token: string
): Promise<any> {
  const url = `http://${ip}:${port}/api/agent/status`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
  return res.json();
}

export async function fetchAgentProjects(
  ip: string,
  port: string,
  token: string
): Promise<AgentProject[]> {
  const url = `http://${ip}:${port}/api/agent/projects`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Projects HTTP ${res.status}`);
  const data = await res.json();
  return data.projects || [];
}

export async function fetchProjectSessions(
  ip: string,
  port: string,
  token: string,
  projectId: string
): Promise<{ project: AgentProject; sessions: AgentSession[] }> {
  const url = `http://${ip}:${port}/api/agent/projects/${projectId}/sessions`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Sessions HTTP ${res.status}`);
  return res.json();
}

export async function createNewSession(
  ip: string,
  port: string,
  token: string,
  cwd: string,
  model?: string,
  mode?: string,
  thoughtLevel?: string
): Promise<any> {
  const url = `http://${ip}:${port}/api/agent/sessions`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ cwd, model, mode, thought_level: thoughtLevel }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Create session HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSessionHistory(
  ip: string,
  port: string,
  token: string,
  sessionId: string,
  cwd?: string | null,
  limit = 50,
  before?: string
): Promise<SessionHistoryPayload> {
  let url = `http://${ip}:${port}/api/agent/sessions/${encodeURIComponent(sessionId)}/history?limit=${limit}`;
  if (cwd) url += `&cwd=${encodeURIComponent(cwd)}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;

  const res = await fetch(url, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`History HTTP ${res.status}`);
  const data = await res.json();

  return {
    messages: mapBackendMessages(data.messages || []),
    configOptions: data.config_options || [],
    commands: data.commands || [],
    session: data.session,
    syncError: data.sync_error || null,
  };
}

export async function syncSessionFromPc(
  ip: string,
  port: string,
  token: string,
  sessionId: string,
  cwd?: string | null,
  force = true
): Promise<SessionHistoryPayload> {
  const url = `http://${ip}:${port}/api/agent/sessions/${encodeURIComponent(sessionId)}/sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ cwd: cwd || undefined, force }),
  });
  if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
  const data = await res.json();

  return {
    messages: mapBackendMessages(data.messages || []),
    configOptions: data.config_options || [],
    commands: [],
  };
}

export async function cancelTurn(
  ip: string,
  port: string,
  token: string,
  sessionId: string
): Promise<void> {
  const url = `http://${ip}:${port}/api/agent/sessions/${encodeURIComponent(sessionId)}/cancel`;
  await fetch(url, { method: "POST", headers: buildHeaders(token) });
}

export async function respondPermission(
  ip: string,
  port: string,
  token: string,
  sessionId: string,
  requestId: string,
  optionId?: string
): Promise<void> {
  const url = `http://${ip}:${port}/api/agent/sessions/${encodeURIComponent(sessionId)}/permission`;
  await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ request_id: requestId, option_id: optionId }),
  });
}

export async function setSessionOption(
  ip: string,
  port: string,
  token: string,
  sessionId: string,
  configId: string,
  value: string
): Promise<{ configOptions: AgentConfigOption[] }> {
  const url = `http://${ip}:${port}/api/agent/sessions/${encodeURIComponent(sessionId)}/options`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ config_id: configId, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Set option HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    configOptions: data.config_options || data.result?.configOptions || [],
  };
}
