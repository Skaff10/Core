import { create } from "zustand";
import {
  AgentProject,
  AgentMessage,
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
  appendUserMessage: (sessionId: string, message: AgentMessage) => void;
  setSocketConnected: (connected: boolean) => void;
  setSelectedModel: (model: string) => void;
  setSelectedMode: (mode: string) => void;
  handleSessionState: (sessionId: string, data: Partial<SessionTurnState>) => void;
  handleSocketEvent: (event: any) => void;
  clearSessionHistory: (sessionId: string) => void;
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeSessionId: null,
  activeSessionCwd: null,
  activeSessionTitle: null,
  messagesBySession: {},
  sessionStates: {},
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
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    })),

  appendUserMessage: (sessionId, message) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] || [];
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
      return {
        sessionStates: {
          ...state.sessionStates,
          [sessionId]: { ...current, ...data },
        },
      };
    }),

  handleSocketEvent: (event) => {
    const sid = event.session_id;
    if (!sid) return;

    const kind = event.kind;
    const payload = event.payload || {};

    set((state) => {
      const msgs = [...(state.messagesBySession[sid] || [])];
      const curTurnState = state.sessionStates[sid] || {
        state: "idle",
        pendingPermission: null,
        queueDepth: 0,
      };

      if (kind === "agent_chunk") {
        const text = payload.text || "";
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.streaming) {
          lastMsg.content += text;
        } else {
          msgs.push({
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: text,
            timestamp: new Date().toLocaleTimeString(),
            streaming: true,
          });
        }
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "running" },
          },
        };
      }

      if (kind === "thought_chunk") {
        const text = payload.text || "";
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.streaming) {
          lastMsg.thoughts = (lastMsg.thoughts || "") + text;
        }
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "tool_call") {
        const lastMsg = msgs[msgs.length - 1];
        const newTool: ToolCallItem = {
          tool_call_id: payload.tool_call_id,
          name: payload.name,
          title: payload.title || payload.name,
          kind: payload.kind,
          args: payload.args,
          status: payload.status || "in_progress",
        };

        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.tools = [...(lastMsg.tools || []), newTool];
        } else {
          msgs.push({
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: "",
            timestamp: new Date().toLocaleTimeString(),
            streaming: true,
            tools: [newTool],
          });
        }
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "tool_update") {
        const tid = payload.tool_call_id;
        const status = payload.status;
        const preview = payload.preview;

        msgs.forEach((m) => {
          if (m.tools) {
            m.tools.forEach((t) => {
              if (t.tool_call_id === tid) {
                t.status = status;
                if (preview !== undefined) t.preview = preview;
              }
            });
          }
        });
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "permission_request") {
        return {
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
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "running" },
          },
        };
      }

      if (kind === "turn_ended") {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.streaming = false;
          lastMsg.stop_reason = payload.stop_reason;
        }
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: {
              ...curTurnState,
              state: "idle",
              pendingPermission: null,
            },
          },
        };
      }

      if (kind === "title") {
        const newTitle = payload.title;
        // Update session title in projects list
        const updatedProjs = state.projects.map((p) => ({
          ...p,
          sessions: p.sessions.map((s) =>
            s.sessionId === sid ? { ...s, title: newTitle } : s
          ),
        }));
        return {
          activeSessionTitle:
            state.activeSessionId === sid ? newTitle : state.activeSessionTitle,
          projects: updatedProjs,
        };
      }

      if (kind === "commands") {
        return { availableCommands: payload.commands || [] };
      }

      if (kind === "warning") {
        msgs.push({
          id: `warn-${Date.now()}`,
          role: "system",
          content: `⚠ [${payload.kind?.toUpperCase() || "WARNING"}] ${payload.message}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
        };
      }

      if (kind === "error") {
        msgs.push({
          id: `err-${Date.now()}`,
          role: "system",
          content: `ERR // ${payload.message}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return {
          messagesBySession: { ...state.messagesBySession, [sid]: msgs },
          sessionStates: {
            ...state.sessionStates,
            [sid]: { ...curTurnState, state: "idle" },
          },
        };
      }

      if (kind === "queued") {
        const lastUser = msgs[msgs.length - 1];
        if (lastUser && lastUser.role === "user") {
          lastUser.queue_position = payload.queue_position;
        }
        return {
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

      return state;
    });
  },
}));

