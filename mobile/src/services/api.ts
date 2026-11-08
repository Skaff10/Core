import { QuickAction, ForegroundTelemetry } from "../store/useConnectionStore";

export interface WhitelistedRoot {
  name: string;
  path: string;
  exists: boolean;
}

export interface RemoteFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_at: string;
  category: "folder" | "image" | "video" | "pdf" | "code" | "binary";
  extension: string;
}

export interface DirectoryBrowseResponse {
  current_path: string;
  parent_path: string | null;
  entries: RemoteFileEntry[];
}

export class CoreApiClient {
  static buildBaseUrl(ip: string, port: string): string {
    let cleanIp = (ip || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    let cleanPort = (port || "8000").trim();
    if (cleanIp.includes(":")) {
      const parts = cleanIp.split(":");
      cleanIp = parts[0];
      if (!cleanPort || cleanPort === "8000") {
        cleanPort = parts[1];
      }
    }
    return `http://${cleanIp || "192.168.0.120"}:${cleanPort || "8000"}`;
  }

  private static headers(token: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.trim()}`,
      "X-Core-Token": token.trim(),
    };
  }

  static async checkHealth(
    ip: string,
    port: string,
    timeoutMs: number = 3500
  ): Promise<{ ok: boolean; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/system/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return { ok: true, message: "Host reachable" };
      }
      return { ok: false, message: `Server HTTP ${res.status}` };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        return { ok: false, message: "Connection timed out. Check IP and Windows Firewall." };
      }
      return { ok: false, message: err?.message || "Host unreachable" };
    }
  }

  static async ping(
    ip: string,
    port: string,
    token: string,
    timeoutMs: number = 5000
  ): Promise<{ status: string; telemetry?: ForegroundTelemetry }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/system/ping`, {
        method: "GET",
        headers: this.headers(token),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 401) {
        throw new Error("HTTP 401: Invalid PIN / Token. Check Web Control Panel (http://localhost:8000)");
      }
      if (res.status === 403) {
        throw new Error("HTTP 403: Forbidden - Access restricted");
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Host error`);
      }
      return res.json();
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error("Connection timed out. Check PC IP, Wi-Fi link, and Windows Firewall port 8000");
      }
      throw err;
    }
  }

  static async fetchQuickActions(
    ip: string,
    port: string,
    token: string
  ): Promise<QuickAction[]> {
    const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/system/actions`, {
      method: "GET",
      headers: this.headers(token),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed loading Quick Actions`);
    }
    const data = await res.json();
    return data.actions || [];
  }

  static async executeQuickAction(
    ip: string,
    port: string,
    token: string,
    actionId: string
  ): Promise<{ status: string; action: QuickAction }> {
    const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/system/actions/execute`, {
      method: "POST",
      headers: this.headers(token),
      body: JSON.stringify({ action_id: actionId }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Action execution failed`);
    }
    return res.json();
  }

  static async shutdownPc(
    ip: string,
    port: string,
    token: string
  ): Promise<{ status: string }> {
    const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/system/shutdown`, {
      method: "POST",
      headers: this.headers(token),
      body: JSON.stringify({ confirm: true }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Shutdown command rejected`);
    }
    return res.json();
  }

  static async fetchSyncStatus(
    ip: string,
    port: string,
    token: string
  ): Promise<{ sync_dir: string; file_count: number; total_mb: number }> {
    const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/sync/status`, {
      method: "GET",
      headers: this.headers(token),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Unable to fetch sync status`);
    }
    return res.json();
  }

  static async fetchWhitelistedRoots(
    ip: string,
    port: string,
    token: string
  ): Promise<WhitelistedRoot[]> {
    const res = await fetch(`${this.buildBaseUrl(ip, port)}/api/files/roots`, {
      method: "GET",
      headers: this.headers(token),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed fetching whitelisted roots`);
    }
    const data = await res.json();
    return data.roots || [];
  }

  static async browseDirectory(
    ip: string,
    port: string,
    token: string,
    dirPath: string
  ): Promise<DirectoryBrowseResponse> {
    const url = `${this.buildBaseUrl(ip, port)}/api/files/browse?path=${encodeURIComponent(
      dirPath
    )}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(token),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Access denied or folder missing`);
    }
    return res.json();
  }

  static buildFileStreamUrl(
    ip: string,
    port: string,
    token: string,
    filePath: string
  ): string {
    return `${this.buildBaseUrl(ip, port)}/api/files/download?path=${encodeURIComponent(
      filePath
    )}&token=${encodeURIComponent(token.trim())}`;
  }
}
