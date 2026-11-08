import { Platform } from "react-native";
import { File, UploadType } from "expo-file-system";
import { QuickAction, ForegroundTelemetry } from "../store/useConnectionStore";

export interface WhitelistedRoot {
  name: string;
  path: string;
  exists: boolean;
  is_vault?: boolean;
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

export interface SyncStatusResponse {
  sync_dir: string;
  auto_sort?: boolean;
  file_count: number;
  photos_count?: number;
  videos_count?: number;
  files_count?: number;
  total_mb: number;
}

export interface UploadedFileResponse {
  status: string;
  filename: string;
  path: string;
  folder?: string;
  category?: string;
  size_kb: number;
  timestamp: string;
}

export interface PendingTransfer {
  transfer_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  category: "photo" | "video" | "file";
  created_at: string;
  status: string;
  download_url: string;
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

  static authOnlyHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token.trim()}`,
      "X-Core-Token": token.trim(),
    };
  }

  private static headers(token: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...this.authOnlyHeaders(token),
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
  ): Promise<SyncStatusResponse> {
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

  static async uploadNativeFileToPc(
    ip: string,
    port: string,
    token: string,
    endpointPath: "/api/sync/upload" | "/api/files/upload",
    fileObj: File,
    parameters?: Record<string, string>,
    mimeType?: string,
    onProgress?: (bytesSent: number, totalBytes: number) => void
  ): Promise<UploadedFileResponse> {
    const url = `${this.buildBaseUrl(ip, port)}${endpointPath}`;
    const result = await fileObj.upload(url, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      headers: this.authOnlyHeaders(token),
      parameters,
      onProgress: onProgress
        ? ({ bytesSent, totalBytes }) => onProgress(bytesSent, totalBytes)
        : undefined,
    });

    if (result.status < 200 || result.status >= 300) {
      let detail = `HTTP ${result.status}`;
      try {
        const parsed = JSON.parse(result.body);
        if (parsed?.detail) detail = `${detail}: ${parsed.detail}`;
      } catch {
        if (result.body) detail = `${detail}: ${result.body.slice(0, 120)}`;
      }
      throw new Error(detail);
    }

    return JSON.parse(result.body) as UploadedFileResponse;
  }

  static async uploadWebFileToPc(
    ip: string,
    port: string,
    token: string,
    endpointPath: "/api/sync/upload" | "/api/files/upload",
    webFile: any,
    parameters?: Record<string, string>
  ): Promise<UploadedFileResponse> {
    const url = `${this.buildBaseUrl(ip, port)}${endpointPath}`;
    const formData = new FormData();
    formData.append("file", webFile);
    if (parameters) {
      for (const [k, v] of Object.entries(parameters)) {
        formData.append(k, v);
      }
    }
    const res = await fetch(url, {
      method: "POST",
      headers: this.authOnlyHeaders(token),
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    return res.json();
  }

  static pickWebFiles(accept: string = "*/*", multiple: boolean = true): Promise<any[]> {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return Promise.resolve([]);
    }
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => {
        const list = input.files ? Array.from(input.files) : [];
        resolve(list);
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  static async getPendingTransfers(
    ip: string,
    port: string,
    token: string
  ): Promise<PendingTransfer[]> {
    const url = `${this.buildBaseUrl(ip, port)}/api/files/transfers/pending`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(token),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.transfers || []) as PendingTransfer[];
  }

  static async acknowledgeTransfer(
    ip: string,
    port: string,
    token: string,
    transferId: string
  ): Promise<void> {
    const url = `${this.buildBaseUrl(ip, port)}/api/files/transfers/${encodeURIComponent(transferId)}/ack`;
    await fetch(url, {
      method: "POST",
      headers: this.headers(token),
    });
  }
}
