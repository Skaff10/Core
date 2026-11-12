import { AppState, AppStateStatus } from "react-native";
import { useAgentStore } from "../store/agentStore";

class AgentSocketManager {
  private ws: WebSocket | null = null;
  private currentIp = "";
  private currentPort = "";
  private currentToken = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: any = null;
  private subscribedSessionId: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  init(ip: string, port: string, token: string) {
    if (
      this.currentIp === ip &&
      this.currentPort === port &&
      this.currentToken === token &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      return;
    }

    this.currentIp = ip;
    this.currentPort = port;
    this.currentToken = token;

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        "change",
        (state: AppStateStatus) => {
          if (state === "active") {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              this.connect();
            }
          }
        }
      );
    }

    this.connect();
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
        useAgentStore.getState().setSocketConnected(true);
        if (this.subscribedSessionId) {
          this.subscribeSession(this.subscribedSessionId, 0);
        }
        this.startHeartbeat();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "event" && msg.data) {
            useAgentStore.getState().handleSocketEvent(msg.data);
          } else if (msg.type === "session_state" && msg.data) {
            useAgentStore
              .getState()
              .handleSessionState(msg.data.session_id, msg.data);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        useAgentStore.getState().setSocketConnected(false);
        this.stopHeartbeat();
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        // onclose will fire
      };
    } catch {
      useAgentStore.getState().setSocketConnected(false);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
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

  private sendJson(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribeSession(sessionId: string, sinceSeq = 0) {
    this.subscribedSessionId = sessionId;
    this.sendJson({
      type: "subscribe",
      session_id: sessionId,
      since_seq: sinceSeq,
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
  ) {
    const clientMsgId = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Optimistically append user message to local store
    useAgentStore.getState().appendUserMessage(sessionId, {
      id: `user-${clientMsgId}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    });

    this.sendJson({
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

