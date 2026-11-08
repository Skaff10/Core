import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import {
  Query,
  AssetField,
  MediaType,
  requestPermissionsAsync,
  type AssetInfo,
} from "expo-media-library";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncLedger } from "./db";
import { CoreApiClient } from "./api";

export const CAMERA_ROLL_SYNC_TASK = "CORE_CAMERA_ROLL_SYNC_TASK";
const SIX_HOURS_SECONDS = 6 * 60 * 60;

export interface SyncRunSummary {
  scanned: number;
  uploaded: number;
  skipped: number;
  failed: number;
  timestamp: string;
}

async function computeAssetFingerprint(info: AssetInfo): Promise<string> {
  const rawIdentity = `${info.filename}|${info.width}x${info.height}|${info.duration ?? 0}|${info.creationTime ?? 0}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawIdentity);
}

export async function executeCameraRollSync(
  overrideIp?: string,
  overridePort?: string,
  overrideToken?: string,
  maxAssets: number = 25
): Promise<SyncRunSummary> {
  const ip = overrideIp || (await AsyncStorage.getItem("@core/pc_ip")) || "192.168.0.120";
  const port = overridePort || (await AsyncStorage.getItem("@core/pc_port")) || "8000";
  const token = overrideToken || (await AsyncStorage.getItem("@core/auth_token")) || "";

  const perm = await requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Android MediaLibrary permission denied.");
  }

  const assets = await new Query()
    .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(maxAssets)
    .exe();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      const info = await asset.getInfo();
      const hash = await computeAssetFingerprint(info);
      const alreadyDone = await syncLedger.isAlreadySynced(asset.id, hash);
      if (alreadyDone) {
        skipped += 1;
        continue;
      }

      const localUri = info.uri;
      const isVideo = info.mediaType === MediaType.VIDEO;
      const filename =
        info.filename || `core_${Date.now()}.${isVideo ? "mp4" : "jpg"}`;

      const formData = new FormData();
      formData.append("file", {
        uri: localUri,
        name: filename,
        type: isVideo ? "video/mp4" : "image/jpeg",
      } as any);
      formData.append("asset_id", asset.id);
      formData.append("file_hash", hash);
      formData.append("created_at", String(info.creationTime || Date.now()));

      const uploadUrl = `${CoreApiClient.buildBaseUrl(ip, port)}/api/sync/upload`;
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "X-Core-Token": token.trim(),
        },
        body: formData,
      });

      if (res.ok) {
        await syncLedger.recordSyncedAsset(asset.id, filename, hash);
        uploaded += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  const summary: SyncRunSummary = {
    scanned: assets.length,
    uploaded,
    skipped,
    failed,
    timestamp: new Date().toLocaleTimeString(),
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
