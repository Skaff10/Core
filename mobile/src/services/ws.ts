import { useEffect, useRef } from "react";
import { useConnectionStore, ForegroundTelemetry, sanitizeHostAndPort } from "../store/useConnectionStore";

export interface LaunchNotificationEvent {
  title: string;
  body: string;
  command?: string;
}

export function useForegroundWebSocket(
  onNotificationEvent?: (event: LaunchNotificationEvent) => void
) {
  const { pcIp, pcPort, authToken, setConnectedState, setTelemetry } = useConnectionStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    function cleanupSocket() {
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    }

    function connect() {
      if (!isMounted || !pcIp || !authToken) return;

      cleanupSocket();

      const { cleanIp, cleanPort } = sanitizeHostAndPort(pcIp, pcPort);
      const wsUrl = `ws://${cleanIp}:${cleanPort}/ws/monitor?token=${encodeURIComponent(
        authToken.trim()
      )}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnectedState(true, null);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "foreground" && payload.data) {
              setTelemetry(payload.data as ForegroundTelemetry);
            } else if (payload.type === "notification" && payload.data && onNotificationEvent) {
              onNotificationEvent(payload.data as LaunchNotificationEvent);
            }
          } catch {
            // Ignore malformed frame
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
        };

        ws.onclose = (ev) => {
          if (!isMounted) return;
          const reason = ev.code === 1008 ? "Rejected: Invalid Auth Token / PIN" : "Offline";
          setConnectedState(false, reason);
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(connect, 3000);
        };
      } catch (err: any) {
        if (!isMounted) return;
        setConnectedState(false, err?.message || "Connection error");
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      cleanupSocket();
    };
  }, [pcIp, pcPort, authToken, setConnectedState, setTelemetry]);
}

