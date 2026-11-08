import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ForegroundTelemetry {
  window_title: string;
  process_name: string;
  pid: number;
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  timestamp: string;
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  command: string;
}

interface ConnectionContextValue {
  pcIp: string;
  pcPort: string;
  authToken: string;
  isConnected: boolean;
  lastError: string | null;
  telemetry: ForegroundTelemetry | null;
  quickActions: QuickAction[];
  saveCredentials: (ip: string, port: string, token: string) => Promise<void>;
  setConnectedState: (connected: boolean, err?: string | null) => void;
  setTelemetry: (data: ForegroundTelemetry) => void;
  setQuickActions: (actions: QuickAction[]) => void;
}

const STORAGE_KEYS = {
  IP: "@core/pc_ip",
  PORT: "@core/pc_port",
  TOKEN: "@core/auth_token",
};

export function sanitizeHostAndPort(ip: string, port?: string): { cleanIp: string; cleanPort: string } {
  let cleanIp = (ip || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  let cleanPort = (port || "8000").trim();
  if (cleanIp.includes(":")) {
    const parts = cleanIp.split(":");
    cleanIp = parts[0];
    if (!cleanPort || cleanPort === "8000") {
      cleanPort = parts[1];
    }
  }
  return { cleanIp: cleanIp || "192.168.0.120", cleanPort: cleanPort || "8000" };
}

const getInitialHost = (): string => {
  if (process.env.EXPO_PUBLIC_DEFAULT_HOST) {
    return process.env.EXPO_PUBLIC_DEFAULT_HOST.trim();
  }
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    return window.location.hostname;
  }
  return "192.168.0.120";
};

const DEFAULT_IP = getInitialHost();
const DEFAULT_PORT = process.env.EXPO_PUBLIC_DEFAULT_PORT || "8000";
const DEFAULT_TOKEN = process.env.EXPO_PUBLIC_DEFAULT_PIN || "610105";

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pcIp, setPcIp] = useState<string>(DEFAULT_IP);
  const [pcPort, setPcPort] = useState<string>(DEFAULT_PORT);
  const [authToken, setAuthToken] = useState<string>(DEFAULT_TOKEN);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [telemetry, setTelemetryState] = useState<ForegroundTelemetry | null>(null);
  const [quickActions, setQuickActionsState] = useState<QuickAction[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [savedIp, savedPort, savedToken] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.IP),
          AsyncStorage.getItem(STORAGE_KEYS.PORT),
          AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        ]);
        if (savedIp) {
          const { cleanIp, cleanPort } = sanitizeHostAndPort(savedIp, savedPort || DEFAULT_PORT);
          setPcIp(cleanIp);
          setPcPort(cleanPort);
        } else if (savedPort) {
          setPcPort(savedPort.trim());
        }
        if (savedToken) {
          setAuthToken(savedToken.trim());
        }
      } catch {
        // Fallback to defaults
      }
    })();
  }, []);

  const saveCredentials = useCallback(async (ip: string, port: string, token: string) => {
    const { cleanIp, cleanPort } = sanitizeHostAndPort(ip, port);
    const cleanToken = token.trim();

    setPcIp(cleanIp);
    setPcPort(cleanPort);
    setAuthToken(cleanToken);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.IP, cleanIp),
      AsyncStorage.setItem(STORAGE_KEYS.PORT, cleanPort),
      AsyncStorage.setItem(STORAGE_KEYS.TOKEN, cleanToken),
    ]);
  }, []);

  const setConnectedState = useCallback((connected: boolean, err: string | null = null) => {
    setIsConnected(connected);
    setLastError(err);
  }, []);

  const setTelemetry = useCallback((data: ForegroundTelemetry) => {
    setTelemetryState(data);
  }, []);

  const setQuickActions = useCallback((actions: QuickAction[]) => {
    setQuickActionsState(actions);
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        pcIp,
        pcPort,
        authToken,
        isConnected,
        lastError,
        telemetry,
        quickActions,
        saveCredentials,
        setConnectedState,
        setTelemetry,
        setQuickActions,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export function useConnectionStore(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnectionStore must be used inside ConnectionProvider");
  }
  return ctx;
}

