import { Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import {
  Query,
  AssetField,
  MediaType,
  requestPermissionsAsync,
  type AssetInfo,
} from "expo-media-library";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncLedger } from "./db";
import { CoreApiClient } from "./api";

export const CAMERA_ROLL_SYNC_TASK = "CORE_CAMERA_ROLL_SYNC_TASK";
const SIX_HOURS_SECONDS = 6 * 60 * 60;
const MAX_DIGEST_BYTES = 50 * 1024 * 1024; // 50 MB threshold for full content SHA-256

export interface SyncRunSummary {
  scanned: number;
  uploaded: number;
  skipped: number;
  failed: number;
  timestamp: string;
  mode?: "auto_mediastore" | "picker";
  canceled?: boolean;
  lastError?: string;
}

export interface SyncOptions {
  interactiveFallback?: boolean;
  onProgress?: (status: string) => void;
}

async function computeAssetFingerprint(info: AssetInfo): Promise<string> {
  const rawIdentity = `${info.filename}|${info.width}x${info.height}|${info.duration ?? 0}|${info.creationTime ?? 0}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawIdentity);
}

async function computePickedFileFingerprint(fileObj: File): Promise<string> {
  try {
    const size = fileObj.size ?? 0;
    if (size > 0 && size <= MAX_DIGEST_BYTES) {
      return await fileObj.digest("SHA-256");
    }
    const raw = `${fileObj.uri}|${size}|${fileObj.modificationTime ?? 0}`;
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  } catch {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${fileObj.uri}|${Date.now()}`
    );
  }
}

export async function pickAndSendToPcVault(
  overrideIp?: string,
  overridePort?: string,
  overrideToken?: string,
  options?: {
    mediaOnly?: boolean;
    useLedger?: boolean;
    targetDir?: string;
    onProgress?: (status: string) => void;
  }
): Promise<SyncRunSummary> {
  const ip = overrideIp || (await AsyncStorage.getItem("@core/pc_ip")) || "192.168.0.120";
  const port = overridePort || (await AsyncStorage.getItem("@core/pc_port")) || "8000";
  const token = overrideToken || (await AsyncStorage.getItem("@core/auth_token")) || "";
  const useLedger = options?.useLedger ?? false;
  const endpoint = options?.targetDir ? "/api/files/upload" : "/api/sync/upload";

  if (Platform.OS === "web") {
    const accept = options?.mediaOnly ? "image/*,video/*" : "*/*";
    const webFiles = await CoreApiClient.pickWebFiles(accept, true);
    if (!webFiles.length) {
      return {
        scanned: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        timestamp: new Date().toLocaleTimeString(),
        mode: "picker",
        canceled: true,
      };
    }

    let uploaded = 0;
    let failed = 0;
    let lastError: string | undefined;

    for (let i = 0; i < webFiles.length; i++) {
      const wf = webFiles[i];
      options?.onProgress?.(`UPLOADING ${i + 1} / ${webFiles.length}: ${wf.name}`);
      try {
        const params: Record<string, string> = { filename_hint: wf.name };
        if (options?.targetDir) params.target_dir = options.targetDir;
        await CoreApiClient.uploadWebFileToPc(ip, port, token, endpoint, wf, params);
        uploaded += 1;
      } catch (err: any) {
        failed += 1;
        lastError = err?.message || "Upload failed";
      }
    }

    return {
      scanned: webFiles.length,
      uploaded,
      skipped: 0,
      failed,
      timestamp: new Date().toLocaleTimeString(),
      mode: "picker",
      lastError,
    };
  }

  const picked = await File.pickFileAsync({
    multipleFiles: true,
    mimeTypes: options?.mediaOnly ? ["image/*", "video/*"] : ["*/*"],
  });

  if (picked.canceled || !picked.result?.length) {
    return {
      scanned: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      timestamp: new Date().toLocaleTimeString(),
      mode: "picker",
      canceled: true,
    };
  }

  const files = picked.result;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (let i = 0; i < files.length; i++) {
    const fileObj = files[i];
    try {
      options?.onProgress?.(`PROCESSING ${i + 1} / ${files.length}...`);
      const hash = await computePickedFileFingerprint(fileObj);

      if (useLedger) {
        const alreadyDone = await syncLedger.isAlreadySynced(fileObj.uri, hash);
        if (alreadyDone) {
          skipped += 1;
          continue;
        }
      }

      const params: Record<string, string> = {
        asset_id: fileObj.uri,
        file_hash: hash,
      };
      if (options?.targetDir) {
        params.target_dir = options.targetDir;
      }
      if (!fileObj.uri.startsWith("content://") && fileObj.name) {
        params.filename_hint = fileObj.name;
      }

      const res = await CoreApiClient.uploadNativeFileToPc(
        ip,
        port,
        token,
        endpoint,
        fileObj,
        params,
        undefined,
        (sent, total) => {
          if (total > 0) {
            const pct = Math.min(100, Math.round((sent / total) * 100));
            options?.onProgress?.(`UPLOADING ${i + 1} / ${files.length} (${pct}%)`);
          }
        }
      );

      if (useLedger) {
        await syncLedger.recordSyncedAsset(fileObj.uri, res.filename, hash);
      }
      uploaded += 1;
    } catch (err: any) {
      failed += 1;
      lastError = err?.message || "Upload failed";
    }
  }

  const summary: SyncRunSummary = {
    scanned: files.length,
    uploaded,
    skipped,
    failed,
    timestamp: new Date().toLocaleTimeString(),
    mode: "picker",
    lastError,
  };

  if (useLedger) {
    await AsyncStorage.setItem("@core/last_sync_summary", JSON.stringify(summary));
  }
  return summary;
}

export async function executeCameraRollSync(
  overrideIp?: string,
  overridePort?: string,
  overrideToken?: string,
  maxAssets: number = 50,
  options?: SyncOptions
): Promise<SyncRunSummary> {
  const ip = overrideIp || (await AsyncStorage.getItem("@core/pc_ip")) || "192.168.0.120";
  const port = overridePort || (await AsyncStorage.getItem("@core/pc_port")) || "8000";
  const token = overrideToken || (await AsyncStorage.getItem("@core/auth_token")) || "";

  if (Platform.OS === "web") {
    if (options?.interactiveFallback) {
      return pickAndSendToPcVault(ip, port, token, {
        mediaOnly: true,
        useLedger: true,
        onProgress: options.onProgress,
      });
    }
    throw new Error("Background MediaLibrary scan is only supported on native Android/iOS.");
  }

  try {
    const perm = await requestPermissionsAsync(false, ["photo", "video"]);
    if (!perm.granted) {
      throw new Error("Photo & Video library permission denied.");
    }
  } catch (permErr: any) {
    const msg = String(permErr?.message || permErr || "");
    // Expo Go on Android cannot request READ_MEDIA_IMAGES / READ_MEDIA_VIDEO due to Play Store policy;
    // seamlessly open multi-select Photo/Video picker when triggered interactively by the user.
    if (options?.interactiveFallback && msg.toLowerCase().includes("expo go")) {
      options.onProgress?.("SELECT PHOTOS & VIDEOS TO SYNC TO F:\\From_phone...");
      return pickAndSendToPcVault(ip, port, token, {
        mediaOnly: true,
        useLedger: true,
        onProgress: options.onProgress,
      });
    }
    throw permErr;
  }

  options?.onProgress?.("SCANNING ANDROID CAMERA ROLL...");
  const assets = await new Query()
    .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(maxAssets)
    .exe();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    try {
      const info = await asset.getInfo();
      const hash = await computeAssetFingerprint(info);
      const alreadyDone = await syncLedger.isAlreadySynced(asset.id, hash);
      if (alreadyDone) {
        skipped += 1;
        continue;
      }

      const isVideo = info.mediaType === MediaType.VIDEO;
      const filename =
        info.filename || `core_${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
      const uploadUri =
        Platform.OS === "android" && asset.id.startsWith("content://")
          ? asset.id
          : info.uri;

      options?.onProgress?.(`UPLOADING ${i + 1} / ${assets.length}: ${filename}`);
      const fileObj = new File(uploadUri);

      await CoreApiClient.uploadNativeFileToPc(
        ip,
        port,
        token,
        "/api/sync/upload",
        fileObj,
        {
          asset_id: asset.id,
          file_hash: hash,
          created_at: String(info.creationTime || Date.now()),
          filename_hint: filename,
        },
        isVideo ? "video/mp4" : undefined
      );

      await syncLedger.recordSyncedAsset(asset.id, filename, hash);
      uploaded += 1;
    } catch (err: any) {
      failed += 1;
      lastError = err?.message || "Asset upload failed";
    }
  }

  const summary: SyncRunSummary = {
    scanned: assets.length,
    uploaded,
    skipped,
    failed,
    timestamp: new Date().toLocaleTimeString(),
    mode: "auto_mediastore",
    lastError,
  };
  await AsyncStorage.setItem("@core/last_sync_summary", JSON.stringify(summary));
  return summary;
}

// Define background task outside component tree
if (!TaskManager.isTaskDefined(CAMERA_ROLL_SYNC_TASK)) {
  TaskManager.defineTask(CAMERA_ROLL_SYNC_TASK, async () => {
    try {
      const result = await executeCameraRollSync();
      return result.uploaded > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerSixHourCameraSync(): Promise<boolean> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(CAMERA_ROLL_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(CAMERA_ROLL_SYNC_TASK, {
        minimumInterval: SIX_HOURS_SECONDS,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}
