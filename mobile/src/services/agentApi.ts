import { AgentProject, AgentSession, AgentMessage } from "../types/agent";

function buildHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.trim()}`,
  };
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
  mode?: string
): Promise<any> {
  const url = `http://${ip}:${port}/api/agent/sessions`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ cwd, model, mode }),
  });
  if (!res.ok) throw new Error(`Create session HTTP ${res.status}`);
  return res.json();
}

export async function fetchSessionHistory(
  ip: string,
  port: string,
  token: string,
  sessionId: string,
  limit = 50,
  before?: string
): Promise<AgentMessage[]> {
  let url = `http://${ip}:${port}/api/agent/sessions/${sessionId}/history?limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`History HTTP ${res.status}`);
  const data = await res.json();
  const rawList = data.messages || [];

  return rawList.map((m: any) => ({
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
      preview: t.raw_output || "",
    })),
  }));
}

export async function cancelTurn(
  ip: string,
  port: string,
  token: string,
  sessionId: string
): Promise<void> {
  const url = `http://${ip}:${port}/api/agent/sessions/${sessionId}/cancel`;
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
  const url = `http://${ip}:${port}/api/agent/sessions/${sessionId}/permission`;
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
): Promise<void> {
  const url = `http://${ip}:${port}/api/agent/sessions/${sessionId}/options`;
  await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ config_id: configId, value }),
  });
}

