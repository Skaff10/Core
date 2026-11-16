import { AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useAgentStore } from "../store/agentStore";
import { fetchSessionHistory } from "./agentApi";

class AgentSocketManager {
  private ws: WebSocket | null = null;
  private currentIp = "";
  private currentPort = "";
  private currentToken = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private appStateSubscription: any = null;
  private appState: AppStateStatus = "active";
  private subscribedSessionId: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  init(ip: string, port: string, token: string) {
    if (
      this.currentIp === ip &&
      this.currentPort === port &&
      this.currentToken === token &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.currentIp = ip;
    this.currentPort = port;
    this.currentToken = token;
    this.reconnectAttempt = 0;

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        "change",
        (state: AppStateStatus) => {
          this.appState = state;
          if (state === "active") {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              this.reconnectAttempt = 0;
              this.connect();
            } else if (this.subscribedSessionId) {
              const lastSeq =
                useAgentStore.getState().lastSeqBySession[this.subscribedSessionId] || 0;
              this.subscribeSession(this.subscribedSessionId, lastSeq);
            }
          }
        }
      );
    }

    this.connect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    const baseMs = Math.min(30000, 1500 * Math.pow(1.6, this.reconnectAttempt));
    const jitter = Math.floor(Math.random() * 500);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), baseMs + jitter);
  }

  private connect() {
    this.cleanup();
    if (!this.currentIp || !this.currentToken) return;

    const url = `ws://${this.currentIp}:${this.currentPort}/ws/agent?token=${encodeURIComponent(
      this.currentToken.trim()
    )}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        useAgentStore.getState().setSocketConnected(true);
        if (this.subscribedSessionId) {
          const lastSeq =
            useAgentStore.getState().lastSeqBySession[this.subscribedSessionId] || 0;
          this.subscribeSession(this.subscribedSessionId, lastSeq);
        }
        this.startHeartbeat();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "event" && msg.data) {
            const event = msg.data;
            useAgentStore.getState().handleSocketEvent(event);
            this.maybeNotify(event);
          } else if (msg.type === "session_state" && msg.data) {
            useAgentStore
              .getState()
              .handleSessionState(msg.data.session_id, msg.data);
          } else if (msg.type === "history_synced" && msg.data?.session_id) {
            const sid = msg.data.session_id;
            const store = useAgentStore.getState();
            if (Array.isArray(msg.data.config_options) && msg.data.config_options.length > 0) {
              store.setSessionConfigOptions(sid, msg.data.config_options);
            }
            if (Array.isArray(msg.data.commands) && msg.data.commands.length > 0) {
              store.setSessionCommands(sid, msg.data.commands);
            }
            if (this.currentIp && this.currentToken) {
              fetchSessionHistory(
                this.currentIp,
                this.currentPort,
                this.currentToken,
                sid,
                store.activeSessionCwd
              )
                .then((res) => {
                  const st = useAgentStore.getState();
                  st.setHistory(sid, res.messages);
                  if (res.configOptions.length > 0) {
                    st.setSessionConfigOptions(sid, res.configOptions);
                  }
                })
                .catch(() => {});
            }
          } else if (msg.type === "error" && msg.message && this.subscribedSessionId) {
            useAgentStore.getState().handleSocketEvent({
              session_id: this.subscribedSessionId,
              kind: "error",
              payload: { message: msg.message },
            });
          }
        } catch {}
      };

      this.ws.onclose = () => {
        useAgentStore.getState().setSocketConnected(false);
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose will fire
      };
    } catch {
      useAgentStore.getState().setSocketConnected(false);
      this.scheduleReconnect();
    }
  }

  private maybeNotify(event: any) {
    const kind = event?.kind;
    if (kind !== "permission_request" && kind !== "turn_ended" && kind !== "warning") {
      return;
    }
    if (kind === "turn_ended" && this.appState === "active") {
      return;
    }

    let title = "Antigravity Agent";
    let body = "";
    if (kind === "permission_request") {
      title = "Approval Required on PC";
      body = event.payload?.tool_call?.title || event.payload?.tool_call?.name || "Agent requested tool approval.";
    } else if (kind === "turn_ended") {
      title = "Antigravity Finished";
      body = "Agent completed the turn.";
    } else if (kind === "warning") {
      title = "Antigravity Warning";
      body = event.payload?.message || "Check session status.";
    }

    Notifications.scheduleNotificationAsync({
      content: { title, body, data: { sessionId: event.session_id } },
      trigger: null,
    }).catch(() => {});
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendJson(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  subscribeSession(sessionId: string, sinceSeq?: number) {
    this.subscribedSessionId = sessionId;
    const seq =
      sinceSeq !== undefined
        ? sinceSeq
        : useAgentStore.getState().lastSeqBySession[sessionId] || 0;
    this.sendJson({
      type: "subscribe",
      session_id: sessionId,
      since_seq: seq,
    });
  }

  unsubscribeSession(sessionId: string) {
    if (this.subscribedSessionId === sessionId) {
      this.subscribedSessionId = null;
    }
    this.sendJson({
      type: "unsubscribe",
      session_id: sessionId,
    });
  }

  sendPrompt(
    sessionId: string,
    text: string,
    cwd: string,
    images?: Array<{ data: string; mimeType: string }>
  ): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      useAgentStore.getState().handleSocketEvent({
        session_id: sessionId,
        kind: "error",
        payload: { message: "Agent socket offline. Reconnecting to PC..." },
      });
      this.connect();
      return false;
    }

    const clientMsgId = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    useAgentStore.getState().appendUserMessage(sessionId, {
      id: `user-${clientMsgId}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    });

    return this.sendJson({
      type: "prompt",
      session_id: sessionId,
      client_msg_id: clientMsgId,
      text,
      cwd,
      images,
    });
  }

  cancelSession(sessionId: string) {
    this.sendJson({
      type: "cancel",
      session_id: sessionId,
    });
  }

  respondPermission(sessionId: string, requestId: string, optionId?: string) {
    this.sendJson({
      type: "permission_response",
      session_id: sessionId,
      request_id: requestId,
      option_id: optionId,
    });
  }

  setOption(sessionId: string, configId: string, value: string) {
    this.sendJson({
      type: "set_option",
      session_id: sessionId,
      config_id: configId,
      value,
    });
  }

  cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    useAgentStore.getState().setSocketConnected(false);
  }
}

export const agentSocket = new AgentSocketManager();
