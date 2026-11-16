import { create } from "zustand";
import {
  AgentProject,
  AgentMessage,
  AgentConfigOption,
  SessionTurnState,
  ToolCallItem,
} from "../types/agent";

interface AgentStoreState {
  projects: AgentProject[];
  activeProjectId: string | null;
  activeSessionId: string | null;
  activeSessionCwd: string | null;
  activeSessionTitle: string | null;
  messagesBySession: Record<string, AgentMessage[]>;
  sessionStates: Record<string, SessionTurnState>;
  lastSeqBySession: Record<string, number>;
  configOptionsBySession: Record<string, AgentConfigOption[]>;
  commandsBySession: Record<string, Array<{ name: string; description: string }>>;
  availableCommands: Array<{ name: string; description: string }>;
  selectedModel: string;
  selectedMode: string;
  socketConnected: boolean;

  setProjects: (projects: AgentProject[]) => void;
  setActiveSession: (
    sessionId: string | null,
    projectId?: string | null,
    cwd?: string | null,
    title?: string | null
  ) => void;
  setHistory: (sessionId: string, messages: AgentMessage[]) => void;
  setSessionConfigOptions: (sessionId: string, options: AgentConfigOption[]) => void;
  setSessionCommands: (sessionId: string, commands: Array<{ name: string; description: string }>) => void;
  appendUserMessage: (sessionId: string, message: AgentMessage) => void;
  setSocketConnected: (connected: boolean) => void;
  setSelectedModel: (model: string) => void;
  setSelectedMode: (mode: string) => void;
  handleSessionState: (sessionId: string, data: any) => void;
  handleSocketEvent: (event: any) => void;
  clearSessionHistory: (sessionId: string) => void;
}

function ensureStreamingAssistant(msgs: AgentMessage[]): { list: AgentMessage[]; last: AgentMessage } {
  const copy = [...msgs];
  const tail = copy[copy.length - 1];
  if (tail && tail.role === "assistant" && tail.streaming) {
    const cloned = { ...tail, tools: tail.tools ? [...tail.tools] : undefined };
    copy[copy.length - 1] = cloned;
    return { list: copy, last: cloned };
  }
  const created: AgentMessage = {
    id: `ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    role: "assistant",
    content: "",
    thoughts: "",
    timestamp: new Date().toLocaleTimeString(),
    streaming: true,
    tools: [],
  };
  copy.push(created);
  return { list: copy, last: created };
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeSessionId: null,
  activeSessionCwd: null,
  activeSessionTitle: null,
  messagesBySession: {},
  sessionStates: {},
  lastSeqBySession: {},
  configOptionsBySession: {},
  commandsBySession: {},
  availableCommands: [],
  selectedModel: "claude-sonnet-5-5",
  selectedMode: "default",
  socketConnected: false,

  setProjects: (projects) => set({ projects }),

  setActiveSession: (sessionId, projectId, cwd, title) =>
    set({
      activeSessionId: sessionId,
      activeProjectId: projectId ?? get().activeProjectId,
      activeSessionCwd: cwd ?? get().activeSessionCwd,
      activeSessionTitle: title ?? get().activeSessionTitle,
    }),

  setHistory: (sessionId, messages) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] || [];
      const streamingTail = existing.find((m) => m.role === "assistant" && m.streaming);
      const nextList = streamingTail ? [...messages, streamingTail] : messages;
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: nextList,
        },
      };
    }),

  setSessionConfigOptions: (sessionId, options) =>
    set((state) => {
      const modelOpt = options.find((o) => o.id === "model");
      const modeOpt = options.find((o) => o.id === "mode");
      return {
        configOptionsBySession: {
          ...state.configOptionsBySession,
          [sessionId]: options,
        },
        selectedModel:
          state.activeSessionId === sessionId && modelOpt?.currentValue
            ? modelOpt.currentValue
            : state.selectedModel,
        selectedMode:
          state.activeSessionId === sessionId && modeOpt?.currentValue
            ? modeOpt.currentValue
            : state.selectedMode,
      };
    }),

  setSessionCommands: (sessionId, commands) =>
    set((state) => ({
      commandsBySession: {
        ...state.commandsBySession,
        [sessionId]: commands,
      },
      availableCommands:
        state.activeSessionId === sessionId ? commands : state.availableCommands,
    })),

  appendUserMessage: (sessionId, message) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] || [];
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...existing, message],
        },
      };
    }),

  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedMode: (mode) => set({ selectedMode: mode }),

  clearSessionHistory: (sessionId) =>
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [],
      },
    })),

  handleSessionState: (sessionId, data) =>
    set((state) => {
      const current = state.sessionStates[sessionId] || {
        state: "idle",
        pendingPermission: null,
        queueDepth: 0,
      };
      const nextTurnState: SessionTurnState = {
        state: data.state ?? current.state,
        pendingPermission:
          data.pending_permission !== undefined
            ? data.pending_permission
            : data.pendingPermission !== undefined
            ? data.pendingPermission
            : current.pendingPermission,
        queueDepth:
          data.queue_depth !== undefined
            ? data.queue_depth
            : data.queueDepth !== undefined
            ? data.queueDepth
            : current.queueDepth,
      };

      const nextConfigs =
        Array.isArray(data.config_options) && data.config_options.length > 0
          ? { ...state.configOptionsBySession, [sessionId]: data.config_options }
          : state.configOptionsBySession;

      const nextCmds =
        Array.isArray(data.commands) && data.commands.length > 0
          ? { ...state.commandsBySession, [sessionId]: data.commands }
          : state.commandsBySession;

      return {
        sessionStates: {
          ...state.sessionStates,
          [sessionId]: nextTurnState,
        },
        configOptionsBySession: nextConfigs,
        commandsBySession: nextCmds,
        activeSessionTitle:
          state.activeSessionId === sessionId && data.title
            ? data.title
            : state.activeSessionTitle,
        activeSessionCwd:
          state.activeSessionId === sessionId && data.cwd
            ? data.cwd
            : state.activeSessionCwd,
      };
    }),

  handleSocketEvent: (event) => {
    const sid = event.session_id;
    if (!sid) return;

    const seq = typeof event.seq === "number" ? event.seq : 0;
    const kind = event.kind;
    const payload = event.payload || {};

    set((state) => {
      const prevSeq = state.lastSeqBySession[sid] || 0;
      if (seq > 0 && seq <= prevSeq) {
        return state;
      }

      const nextSeqMap =
        seq > 0 ? { ...state.lastSeqBySession, [sid]: seq } : state.lastSeqBySession;

      const msgs = [...(state.messagesBySession[sid] || [])];
      const curTurnState = state.sessionStates[sid] || {
        state: "idle",
        pendingPermission: null,
        queueDepth: 0,
      };

      if (kind === "user_message") {
        const msgId = payload.id || `user-${seq || Date.now()}`;
        if (!msgs.some((m) => m.id === msgId)) {
          msgs.push({
            id: msgId,
            role: "user",
            content: payload.text || "",
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "agent_chunk") {
        const text = payload.text || "";
        const { list, last } = ensureStreamingAssistant(msgs);
        last.content = (last.content || "") + text;
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: list },
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "running" },
          },
        };
      }

      if (kind === "thought_chunk") {
        const text = payload.text || "";
        const { list, last } = ensureStreamingAssistant(msgs);
        last.thoughts = (last.thoughts || "") + text;
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: list },
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "running" },
          },
        };
      }

      if (kind === "tool_call") {
        const { list, last } = ensureStreamingAssistant(msgs);
        const tools = [...(last.tools || [])];
        const existingIdx = tools.findIndex((t) => t.tool_call_id === payload.tool_call_id);
        const newTool: ToolCallItem = {
          tool_call_id: payload.tool_call_id,
          name: payload.name || "tool",
          title: payload.title || payload.name || "Tool Call",
          kind: payload.kind || "other",
          args: payload.args,
          status: payload.status || "in_progress",
          preview: payload.preview,
          has_more: payload.has_more,
        };
        if (existingIdx >= 0) {
          tools[existingIdx] = { ...tools[existingIdx], ...newTool };
        } else {
          tools.push(newTool);
        }
        last.tools = tools;
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: list },
        };
      }

      if (kind === "tool_update") {
        const tid = payload.tool_call_id;
        const status = payload.status;
        const preview = payload.preview;
        const updatedMsgs = msgs.map((m) => {
          if (!m.tools || !m.tools.some((t) => t.tool_call_id === tid)) {
            return m;
          }
          return {
            ...m,
            tools: m.tools.map((t) =>
              t.tool_call_id === tid
                ? {
                    ...t,
                    status: status || t.status,
                    preview: preview !== undefined ? preview : t.preview,
                    has_more: payload.has_more !== undefined ? payload.has_more : t.has_more,
                  }
                : t
            ),
          };
        });
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: updatedMsgs },
        };
      }

      if (kind === "permission_request") {
        return {
          lastSeqBySession: nextSeqMap,
          sessionStates: {
            ...state.sessionStates,
            [sid]: {
              ...curTurnState,
              state: "awaiting_permission",
              pendingPermission: {
                request_id: payload.request_id,
                tool_call: payload.tool_call,
                options: payload.options || [],
              },
            },
          },
        };
      }

      if (kind === "permission_resolved") {
        return {
          lastSeqBySession: nextSeqMap,
          sessionStates: {
            ...state.sessionStates,
            [sid]: {
              ...curTurnState,
              state: "running",
              pendingPermission: null,
            },
          },
        };
      }

      if (kind === "turn_started") {
        return {
          lastSeqBySession: nextSeqMap,
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "running" },
          },
        };
      }

      if (kind === "turn_ended") {
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            streaming: false,
            stop_reason: payload.stop_reason,
          };
        }
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: {
              ...curTurnState,
              state: "idle",
              pendingPermission: null,
              queueDepth: Math.max(0, (curTurnState.queueDepth || 0) - 1),
            },
          },
        };
      }

      if (kind === "title") {
        const newTitle = payload.title;
        const updatedProjs = state.projects.map((p) => ({
          ...p,
          sessions: p.sessions.map((s) =>
            s.sessionId === sid ? { ...s, title: newTitle } : s
          ),
        }));
        return {
          lastSeqBySession: nextSeqMap,
          activeSessionTitle:
            state.activeSessionId === sid ? newTitle : state.activeSessionTitle,
          projects: updatedProjs,
        };
      }

      if (kind === "commands") {
        const cmds = payload.commands || [];
        return {
          lastSeqBySession: nextSeqMap,
          commandsBySession: { ...state.commandsBySession, [sid]: cmds },
          availableCommands: state.activeSessionId === sid ? cmds : state.availableCommands,
        };
      }

      if (kind === "config") {
        const opts: AgentConfigOption[] =
          payload.configOptions || state.configOptionsBySession[sid] || [];
        const updatedOpts = payload.configOptions
          ? payload.configOptions
          : opts.map((o) =>
              o.id === payload.configId ? { ...o, currentValue: payload.value } : o
            );
        return {
          lastSeqBySession: nextSeqMap,
          configOptionsBySession: {
            ...state.configOptionsBySession,
            [sid]: updatedOpts,
          },
          selectedModel:
            payload.configId === "model" && state.activeSessionId === sid
              ? payload.value
              : state.selectedModel,
          selectedMode:
            payload.configId === "mode" && state.activeSessionId === sid
              ? payload.value
              : state.selectedMode,
        };
      }

      if (kind === "warning") {
        msgs.push({
          id: `warn-${seq || Date.now()}`,
          role: "system",
          content: `⚠ [${payload.kind?.toUpperCase() || "WARNING"}] ${payload.message}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "error") {
        msgs.push({
          id: `err-${seq || Date.now()}`,
          role: "system",
          content: `ERR // ${payload.message}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "idle" },
          },
        };
      }

      if (kind === "queued") {
        const lastUserIdx = msgs.length - 1;
        if (lastUserIdx >= 0 && msgs[lastUserIdx].role === "user") {
          msgs[lastUserIdx] = {
            ...msgs[lastUserIdx],
            queue_position: payload.queue_position,
          };
        }
        return {
          lastSeqBySession: nextSeqMap,
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: {
              ...curTurnState,
              queueDepth: payload.queue_position || 1,
            },
          },
        };
      }

      return { ...state, lastSeqBySession: nextSeqMap };
    });
  },
}));
