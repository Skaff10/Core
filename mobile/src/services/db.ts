import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FALLBACK_KEY = "@core/synced_media_ledger";

export interface SyncedAssetRecord {
  asset_id: string;
  filename: string;
  file_hash: string;
  synced_at: string;
}

class SyncLedgerDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      this.db = await SQLite.openDatabaseAsync("core_sync_ledger.db");
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS synced_media (
          asset_id TEXT PRIMARY KEY NOT NULL,
          filename TEXT NOT NULL,
          file_hash TEXT NOT NULL,
          synced_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_synced_hash ON synced_media (file_hash);
      `);
      this.initialized = true;
    } catch {
      // Fallback to AsyncStorage if SQLite is unavailable on web/simulator
      this.initialized = true;
    }
  }

  async isAlreadySynced(assetId: string, fileHash: string): Promise<boolean> {
    await this.init();
    if (this.db) {
      const row = await this.db.getFirstAsync<{ asset_id: string }>(
        "SELECT asset_id FROM synced_media WHERE asset_id = ? OR file_hash = ? LIMIT 1",
        [assetId, fileHash]
      );
      return Boolean(row);
    }

    const raw = await AsyncStorage.getItem(FALLBACK_KEY);
    if (!raw) return false;
    const records: SyncedAssetRecord[] = JSON.parse(raw);
    return records.some((r) => r.asset_id === assetId || r.file_hash === fileHash);
  }

  async recordSyncedAsset(
    assetId: string,
    filename: string,
    fileHash: string
  ): Promise<void> {
    await this.init();
    const syncedAt = new Date().toISOString();
    if (this.db) {
      await this.db.runAsync(
        "INSERT OR REPLACE INTO synced_media (asset_id, filename, file_hash, synced_at) VALUES (?, ?, ?, ?)",
        [assetId, filename, fileHash, syncedAt]
      );
      return;
    }

    const raw = await AsyncStorage.getItem(FALLBACK_KEY);
    const records: SyncedAssetRecord[] = raw ? JSON.parse(raw) : [];
    const filtered = records.filter((r) => r.asset_id !== assetId);
    filtered.push({
      asset_id: assetId,
      filename,
      file_hash: fileHash,
      synced_at: syncedAt,
    });
    await AsyncStorage.setItem(FALLBACK_KEY, JSON.stringify(filtered));
  }

  async getSyncedCount(): Promise<number> {
    await this.init();
    if (this.db) {
      const row = await this.db.getFirstAsync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM synced_media"
      );
      return row?.cnt || 0;
    }
    const raw = await AsyncStorage.getItem(FALLBACK_KEY);
    const records: SyncedAssetRecord[] = raw ? JSON.parse(raw) : [];
    return records.length;
  }
}

export const syncLedger = new SyncLedgerDatabase();

