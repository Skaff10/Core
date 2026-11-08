import { Platform } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import { Asset } from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoreApiClient, PendingTransfer } from "./api";

export const ANDROID_SAVE_DIR_KEY = "@core/android_download_dir_uri";

export interface ReceivedFileResult {
  ok: boolean;
  filename: string;
  destination: string;
  error?: string;
}

export type IncomingFileCallback = (result: ReceivedFileResult) => void;

const listeners: Set<IncomingFileCallback> = new Set();

export function onIncomingFileReceived(callback: IncomingFileCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners(result: ReceivedFileResult) {
  listeners.forEach((cb) => {
    try {
      cb(result);
    } catch {}
  });
}

async function saveToDocumentFolder(localFile: File): Promise<string> {
  const dirUri = await AsyncStorage.getItem(ANDROID_SAVE_DIR_KEY);
  if (dirUri) {
    try {
      const destDir = new Directory(dirUri);
      await localFile.copy(destDir, { overwrite: true });
      return "Phone Folder";
    } catch {}
  }
  return "App Storage";
}

export async function processIncomingTransfer(
  transfer: PendingTransfer,
  ip: string,
  port: string,
  token: string
): Promise<ReceivedFileResult> {
  const baseUrl = CoreApiClient.buildBaseUrl(ip, port);
  const downloadUrl = `${baseUrl}${transfer.download_url}?token=${encodeURIComponent(token.trim())}`;

  if (Platform.OS === "web" && typeof document !== "undefined") {
    try {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = transfer.filename;
      a.click();
      await CoreApiClient.acknowledgeTransfer(ip, port, token, transfer.transfer_id);
      const res: ReceivedFileResult = {
        ok: true,
        filename: transfer.filename,
        destination: "Browser Downloads",
      };
      notifyListeners(res);
      return res;
    } catch (err: any) {
      const res: ReceivedFileResult = {
        ok: false,
        filename: transfer.filename,
        destination: "Browser",
        error: err?.message,
      };
      notifyListeners(res);
      return res;
    }
  }

  try {
    const encodedSafeName = encodeURIComponent(transfer.filename.replace(/[\\/]/g, "_"));
    const cacheTarget = new File(Paths.cache, encodedSafeName);
    const downloaded = await File.downloadFileAsync(downloadUrl, cacheTarget, {
      idempotent: true,
      headers: CoreApiClient.authOnlyHeaders(token),
    });
    const normalizedUri = downloaded.uri.startsWith("file:///")
      ? downloaded.uri
      : downloaded.uri.replace(/^file:\/*/, "file:///");
    const localFile = new File(normalizedUri);

    let destination = "Phone Storage";
    if (transfer.category === "photo" || transfer.category === "video") {
      try {
        await Asset.create(localFile.uri);
        destination = "Android Gallery";
      } catch (galleryErr) {
        destination = await saveToDocumentFolder(localFile);
      }
    } else {
      destination = await saveToDocumentFolder(localFile);
    }

    await CoreApiClient.acknowledgeTransfer(ip, port, token, transfer.transfer_id);
    const res: ReceivedFileResult = {
      ok: true,
      filename: transfer.filename,
      destination,
    };
    notifyListeners(res);
    return res;
  } catch (err: any) {
    const res: ReceivedFileResult = {
      ok: false,
      filename: transfer.filename,
      destination: "Failed",
      error: err?.message,
    };
    notifyListeners(res);
    return res;
  }
}

export async function checkAndFetchPendingTransfers(
  ip: string,
  port: string,
  token: string
): Promise<ReceivedFileResult[]> {
  try {
    const pending = await CoreApiClient.getPendingTransfers(ip, port, token);
    const results: ReceivedFileResult[] = [];
    for (const item of pending) {
      const result = await processIncomingTransfer(item, ip, port, token);
      results.push(result);
    }
    return results;
  } catch {
    return [];
  }
}

