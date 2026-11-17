import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  Linking,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Directory, Paths } from "expo-file-system";
import { Asset } from "expo-media-library";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HardDrive,
  ArrowUpLeft,
  RefreshCw,
  Download,
  ExternalLink,
  Upload,
  FolderPlus,
  Camera,
  ChevronRight,
  FolderOpen,
} from "lucide-react-native";
import { HeaderStatus } from "../../components/HeaderStatus";
import { FileRow } from "../../components/FileRow";
import { useConnectionStore } from "../../store/useConnectionStore";
import {
  CoreApiClient,
  WhitelistedRoot,
  RemoteFileEntry,
} from "../../services/api";
import { pickAndSendToPcVault } from "../../services/syncTask";
import { CoreCard } from "../../components/ui/CoreCard";
import { TactilePressable } from "../../components/ui/TactilePressable";
import { GlassSurface } from "../../components/glassyui/glass-surface";
import { GlassButton } from "../../components/glassyui/glass-button";
import { GlassBadge } from "../../components/glassyui/glass-badge";
import { GlassAlert } from "../../components/glassyui/glass-alert";
import { GlassProgress } from "../../components/glassyui/glass-progress";
import { GlassSkeleton } from "../../components/glassyui/glass-skeleton";
import {
  GlassSheet,
  GlassSheetContent,
  GlassSheetDescription,
  GlassSheetTitle,
} from "../../components/glassyui/glass-sheet";
import { CORE_COLORS, CORE_RADIUS, CORE_SPACING } from "../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../theme/typography";

const ANDROID_SAVE_DIR_KEY = "@core/android_download_dir_uri";

interface UploadProgressState {
  statusText: string;
  percent: number | null;
  targetLabel: string;
}

function parseProgressFromStatus(msg: string): {
  label: string;
  percent: number | null;
} {
  const pctMatch = msg.match(/\((\d+)%\)/);
  const percent = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : null;
  const cleanLabel = msg.replace(/\s*\(\d+%\)/, "").trim();
  return { label: cleanLabel, percent };
}

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const [roots, setRoots] = useState<WhitelistedRoot[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mobile -> PC Upload State (driven exclusively by real callbacks)
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(
    null
  );
  const [uploadBanner, setUploadBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Preview / Download Sheet State
  const [selectedFile, setSelectedFile] = useState<RemoteFileEntry | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [savedPhoneDirUri, setSavedPhoneDirUri] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ANDROID_SAVE_DIR_KEY)
      .then((uri) => setSavedPhoneDirUri(uri))
      .catch(() => {});
  }, []);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await CoreApiClient.fetchWhitelistedRoots(
        pcIp,
        pcPort,
        authToken
      );
      setRoots(list);
      setCurrentPath(null);
      setParentPath(null);
      setEntries([]);
    } catch (err: any) {
      setErrorMsg(err?.message || "Unable to load whitelisted PC paths");
    } finally {
      setLoading(false);
    }
  }, [pcIp, pcPort, authToken]);

  const openDirectory = useCallback(
    async (dirPath: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await CoreApiClient.browseDirectory(
          pcIp,
          pcPort,
          authToken,
          dirPath
        );
        setCurrentPath(res.current_path);
        setParentPath(res.parent_path);
        setEntries(res.entries);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed reading directory");
      } finally {
        setLoading(false);
      }
    },
    [pcIp, pcPort, authToken]
  );

  useEffect(() => {
    loadRoots();
  }, [loadRoots]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (currentPath) {
      await openDirectory(currentPath);
    } else {
      await loadRoots();
    }
    setRefreshing(false);
  };

  const handlePressEntry = (item: RemoteFileEntry) => {
    if (item.is_dir) {
      openDirectory(item.path);
    } else {
      setDownloadStatus(null);
      setSelectedFile(item);
    }
  };

  // --- MOBILE -> PC UPLOAD HANDLERS ---
  const handleUploadFromPhone = async (targetDir?: string) => {
    const destLabel = targetDir || "F:\\From_phone";
    setUploading(true);
    setUploadBanner(null);
    setUploadProgress({
      statusText: "Opening file picker...",
      percent: null,
      targetLabel: destLabel,
    });
    try {
      const summary = await pickAndSendToPcVault(pcIp, pcPort, authToken, {
        mediaOnly: false,
        useLedger: false,
        targetDir,
        onProgress: (msg) => {
          const parsed = parseProgressFromStatus(msg);
          setUploadProgress({
            statusText: parsed.label,
            percent: parsed.percent,
            targetLabel: destLabel,
          });
        },
      });

      if (summary.canceled) {
        setUploadBanner(null);
        setUploadProgress(null);
        return;
      }

      if (summary.failed > 0 && summary.uploaded === 0) {
        setUploadBanner({
          ok: false,
          text: `Upload failed: ${summary.lastError || "Unable to send file"}`,
        });
      } else {
        setUploadBanner({
          ok: summary.failed === 0,
          text: `Sent ${summary.uploaded} file(s) to ${destLabel}${
            summary.failed > 0 ? ` (${summary.failed} failed)` : ""
          }`,
        });
        if (currentPath) {
          await openDirectory(currentPath);
        }
      }
    } catch (err: any) {
      setUploadBanner({
        ok: false,
        text: err?.message || "Failed sending to PC",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // --- PC -> MOBILE DOWNLOAD HELPERS ---
  const fetchPcFileToCache = async (file: RemoteFileEntry): Promise<File> => {
    const remoteUrl = CoreApiClient.buildFileStreamUrl(
      pcIp,
      pcPort,
      authToken,
      file.path
    );
    const encodedSafeName = encodeURIComponent(file.name.replace(/[\\/]/g, "_"));
    const cacheTarget = new File(Paths.cache, encodedSafeName);
    const downloaded = await File.downloadFileAsync(remoteUrl, cacheTarget, {
      idempotent: true,
    });
    const normalizedUri = downloaded.uri.startsWith("file:///")
      ? downloaded.uri
      : downloaded.uri.replace(/^file:\/*/, "file:///");
    return new File(normalizedUri);
  };

  const handleSaveToPhoneFolder = async (
    file: RemoteFileEntry,
    forcePickFolder: boolean = false
  ) => {
    const remoteUrl = CoreApiClient.buildFileStreamUrl(
      pcIp,
      pcPort,
      authToken,
      file.path
    );

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = remoteUrl;
      a.download = file.name;
      a.click();
      setDownloadStatus({ ok: true, text: `Browser download started: ${file.name}` });
      return;
    }

    setDownloading(true);
    setDownloadStatus({ ok: true, text: "Downloading from PC..." });
    try {
      const localFile = await fetchPcFileToCache(file);

      let dirUri = forcePickFolder ? null : savedPhoneDirUri;
      if (!dirUri) {
        setDownloadStatus({
          ok: true,
          text: "Select a destination folder on your phone (e.g. Downloads)...",
        });
        const pickedDir = await Directory.pickDirectoryAsync();
        dirUri = pickedDir.uri;
        await AsyncStorage.setItem(ANDROID_SAVE_DIR_KEY, dirUri);
        setSavedPhoneDirUri(dirUri);
      }

      try {
        const destDir = new Directory(dirUri);
        await localFile.copy(destDir, { overwrite: true });
      } catch {
        const pickedDir = await Directory.pickDirectoryAsync();
        dirUri = pickedDir.uri;
        await AsyncStorage.setItem(ANDROID_SAVE_DIR_KEY, dirUri);
        setSavedPhoneDirUri(dirUri);
        await localFile.copy(pickedDir, { overwrite: true });
      }

      setDownloadStatus({
        ok: true,
        text: `Saved to phone folder: ${file.name}`,
      });
    } catch (err: any) {
      const msg = String(err?.message || "Save failed");
      if (msg.toLowerCase().includes("cancel")) {
        setDownloadStatus({ ok: false, text: "Folder selection canceled" });
      } else {
        setDownloadStatus({ ok: false, text: `Save failed: ${msg}` });
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveMediaToGallery = async (file: RemoteFileEntry) => {
    setDownloading(true);
    setDownloadStatus({ ok: true, text: "Saving to phone gallery..." });
    try {
      const localFile = await fetchPcFileToCache(file);
      await Asset.create(localFile.uri);
      setDownloadStatus({
        ok: true,
        text: `Saved to gallery: ${file.name}`,
      });
    } catch (err: any) {
      setDownloadStatus({
        ok: false,
        text: `Gallery save failed: ${err?.message || "Error"}`,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleShareOrOpenApp = async (file: RemoteFileEntry) => {
    if (Platform.OS === "web") {
      handleStreamExternal(file);
      return;
    }
    setDownloading(true);
    setDownloadStatus({ ok: true, text: "Preparing file for share / open..." });
    try {
      const localFile = await fetchPcFileToCache(file);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localFile.uri);
        setDownloadStatus({ ok: true, text: `Shared ${file.name}` });
      } else {
        handleStreamExternal(file);
      }
    } catch (err: any) {
      setDownloadStatus({
        ok: false,
        text: `Share failed: ${err?.message || "Error"}`,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleStreamExternal = (file: RemoteFileEntry) => {
    const remoteUrl = CoreApiClient.buildFileStreamUrl(
      pcIp,
      pcPort,
      authToken,
      file.path
    );
    Linking.openURL(remoteUrl);
  };

  const isMediaFile =
    selectedFile?.category === "image" || selectedFile?.category === "video";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="Remote Files" subtitle="Explorer & Transfer" />

      {/* Glass Navigation & Path Bar */}
      <View style={styles.controlsSection}>
        <GlassSurface preset="control" elevation="base" style={styles.navBar}>
          <TactilePressable
            haptic
            onPress={loadRoots}
            accessibilityRole="button"
            accessibilityLabel="View whitelisted volumes"
            style={[styles.navChip, !currentPath && styles.navChipActive]}
          >
            <HardDrive
              size={14}
              color={!currentPath ? CORE_COLORS.cyan : CORE_COLORS.textSecondary}
            />
            <Text
              style={[
                styles.navChipText,
                !currentPath && { color: CORE_COLORS.cyan },
              ]}
            >
              Volumes
            </Text>
          </TactilePressable>

          {currentPath && (
            <TactilePressable
              haptic
              onPress={() =>
                parentPath ? openDirectory(parentPath) : loadRoots()
              }
              accessibilityRole="button"
              accessibilityLabel="Navigate up"
              style={styles.navChip}
            >
              <ArrowUpLeft size={14} color={CORE_COLORS.textPrimary} />
              <Text style={styles.navChipText}>Up</Text>
            </TactilePressable>
          )}

          <Text style={styles.pathText} numberOfLines={1}>
            {currentPath || "Select a PC volume"}
          </Text>

          <TactilePressable
            haptic
            onPress={() => (currentPath ? openDirectory(currentPath) : loadRoots())}
            accessibilityRole="button"
            accessibilityLabel="Refresh directory"
            style={styles.refreshIconBtn}
          >
            <RefreshCw size={15} color={CORE_COLORS.textSecondary} />
          </TactilePressable>
        </GlassSurface>

        {/* Quick Horizontal Volume Switcher when browsing inside a path */}
        {currentPath && roots.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRootsRow}
          >
            {roots.map((r) => {
              const active = currentPath.toLowerCase().startsWith(r.path.toLowerCase());
              return (
                <TactilePressable
                  key={r.path}
                  onPress={() => openDirectory(r.path)}
                  style={[styles.quickRootPill, active && styles.quickRootPillActive]}
                >
                  <HardDrive
                    size={12}
                    color={active ? CORE_COLORS.cyan : CORE_COLORS.textTertiary}
                  />
                  <Text
                    style={[
                      styles.quickRootText,
                      active && { color: CORE_COLORS.cyan },
                    ]}
                  >
                    {r.name}
                  </Text>
                </TactilePressable>
              );
            })}
          </ScrollView>
        )}

        {/* Transfer Action Row */}
        <View style={styles.transferRow}>
          <View style={currentPath ? styles.transferBtnHalf : styles.transferBtnFull}>
            <GlassButton
              variant="prominent"
              size="md"
              style={styles.fullWidthBtn}
              disabled={uploading}
              onPress={() => handleUploadFromPhone(undefined)}
            >
              <Upload size={15} color="#FFFFFF" />
              {uploading
                ? "Uploading..."
                : currentPath
                ? "Send to Vault"
                : "Send to PC (F:\\From_phone)"}
            </GlassButton>
          </View>

          {currentPath && (
            <View style={styles.transferBtnHalf}>
              <GlassButton
                variant="primary"
                size="md"
                style={styles.fullWidthBtn}
                disabled={uploading}
                onPress={() => handleUploadFromPhone(currentPath)}
              >
                <FolderPlus size={15} color={CORE_COLORS.cyan} />
                Upload Here
              </GlassButton>
            </View>
          )}
        </View>

        {/* Live Upload Progress Card */}
        {uploadProgress && (
          <CoreCard variant="panel" elevation="base" style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle} numberOfLines={1}>
                {uploadProgress.statusText}
              </Text>
              <GlassBadge tone="blue">
                {uploadProgress.percent !== null
                  ? `${uploadProgress.percent}%`
                  : "Sending"}
              </GlassBadge>
            </View>
            <GlassProgress value={uploadProgress.percent} size="md" />
            <Text style={styles.progressDest} numberOfLines={1}>
              Destination: {uploadProgress.targetLabel}
            </Text>
          </CoreCard>
        )}

        {uploadBanner && (
          <GlassAlert
            key={uploadBanner.text}
            tone={uploadBanner.ok ? "success" : "danger"}
            onDismiss={() => setUploadBanner(null)}
          >
            {uploadBanner.text}
          </GlassAlert>
        )}

        {errorMsg && (
          <GlassAlert tone="danger" title="File System Error">
            {errorMsg}
          </GlassAlert>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3].map((k) => (
            <CoreCard key={k} variant="subtle" style={styles.skeletonCard}>
              <GlassSkeleton variant="text" lines={2} />
            </CoreCard>
          ))}
        </View>
      ) : !currentPath ? (
        <FlatList
          data={roots}
          keyExtractor={(item) => item.path}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom:
                Math.max(insets.bottom, 12) + CORE_SPACING.floatingDockOffset,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CORE_COLORS.cyan}
              colors={[CORE_COLORS.cyan]}
            />
          }
          renderItem={({ item }) => (
            <TactilePressable
              haptic
              onPress={() => openDirectory(item.path)}
              accessibilityRole="button"
              accessibilityLabel={`Open volume ${item.name}`}
            >
              <CoreCard
                variant="panel"
                elevation="base"
                accentBorderColor={
                  item.is_vault ? CORE_COLORS.cyanBorder : undefined
                }
                style={styles.rootCard}
              >
                <View style={styles.rootCardRow}>
                  <View
                    style={[
                      styles.rootIconBox,
                      item.is_vault && styles.rootIconVault,
                    ]}
                  >
                    <HardDrive
                      size={20}
                      color={item.is_vault ? CORE_COLORS.cyan : CORE_COLORS.textSecondary}
                    />
                  </View>

                  <View style={styles.rootInfo}>
                    <View style={styles.rootTitleRow}>
                      <Text style={styles.rootCardTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.is_vault && <GlassBadge tone="blue">Vault</GlassBadge>}
                    </View>
                    <Text style={styles.rootCardPath} numberOfLines={1}>
                      {item.path}
                    </Text>
                  </View>

                  <View style={styles.rootRight}>
                    <GlassBadge dot tone={item.exists ? "green" : "orange"}>
                      {item.exists ? "Mounted" : "Offline"}
                    </GlassBadge>
                    <ChevronRight size={16} color={CORE_COLORS.textTertiary} />
                  </View>
                </View>
              </CoreCard>
            </TactilePressable>
          )}
          ListEmptyComponent={
            <CoreCard variant="subtle" style={styles.emptyBox}>
              <HardDrive size={30} color={CORE_COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No Whitelisted Volumes</Text>
              <Text style={styles.emptyDesc}>
                Verify your PC connection in Settings or pull to refresh.
              </Text>
            </CoreCard>
          }
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom:
                Math.max(insets.bottom, 12) + CORE_SPACING.floatingDockOffset,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CORE_COLORS.cyan}
              colors={[CORE_COLORS.cyan]}
            />
          }
          renderItem={({ item }) => (
            <FileRow item={item} onPress={handlePressEntry} />
          )}
          ListEmptyComponent={
            <CoreCard variant="subtle" style={styles.emptyBox}>
              <FolderOpen size={30} color={CORE_COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>Directory is Empty</Text>
              <Text style={styles.emptyDesc}>
                You can upload files directly into this folder using Upload Here above.
              </Text>
            </CoreCard>
          }
        />
      )}

      {/* File Preview & Download Glass Sheet */}
      <GlassSheet
        open={Boolean(selectedFile)}
        onOpenChange={(open) => {
          if (!open) setSelectedFile(null);
        }}
      >
        <GlassSheetContent side="bottom" closeLabel="Close file preview">
          {selectedFile && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetBody}
            >
              <GlassSheetTitle numberOfLines={2}>
                {selectedFile.name}
              </GlassSheetTitle>
              <GlassSheetDescription numberOfLines={2}>
                {selectedFile.path}
              </GlassSheetDescription>

              <View style={styles.sheetMetaPills}>
                <GlassBadge tone="blue">
                  {selectedFile.category.toUpperCase()}
                </GlassBadge>
                <GlassBadge tone="neutral">
                  {selectedFile.extension || "RAW"}
                </GlassBadge>
              </View>

              {selectedFile.category === "image" && (
                <View style={styles.imagePreviewBox}>
                  <Image
                    source={{
                      uri: CoreApiClient.buildFileStreamUrl(
                        pcIp,
                        pcPort,
                        authToken,
                        selectedFile.path
                      ),
                    }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {downloadStatus && (
                <GlassAlert
                  tone={downloadStatus.ok ? "success" : "danger"}
                >
                  {downloadStatus.text}
                </GlassAlert>
              )}

              {isMediaFile && Platform.OS !== "web" && (
                <GlassButton
                  variant="prominent"
                  style={styles.sheetFullBtn}
                  onPress={() => handleSaveMediaToGallery(selectedFile)}
                  disabled={downloading}
                >
                  <Camera size={16} color="#FFFFFF" />
                  {downloading ? "Working..." : "Save to Gallery"}
                </GlassButton>
              )}

              <View style={styles.sheetActionsRow}>
                <GlassButton
                  variant="prominent"
                  style={styles.sheetActionFlex}
                  onPress={() => handleSaveToPhoneFolder(selectedFile, false)}
                  disabled={downloading}
                >
                  <Download size={15} color="#FFFFFF" />
                  {downloading ? "Saving..." : "Save to Phone"}
                </GlassButton>

                <GlassButton
                  variant="primary"
                  style={styles.sheetActionFlex}
                  onPress={() => handleShareOrOpenApp(selectedFile)}
                  disabled={downloading}
                >
                  <ExternalLink size={15} color={CORE_COLORS.cyan} />
                  Share / Open
                </GlassButton>
              </View>

              {Platform.OS !== "web" && (
                <TactilePressable
                  onPress={() => handleSaveToPhoneFolder(selectedFile, true)}
                  disabled={downloading}
                  style={styles.folderChangeRow}
                >
                  <Text style={styles.folderChangeText}>
                    {savedPhoneDirUri
                      ? "Change destination folder"
                      : "First save will prompt for a phone folder (e.g. Downloads)"}
                  </Text>
                </TactilePressable>
              )}
            </ScrollView>
          )}
        </GlassSheetContent>
      </GlassSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  controlsSection: {
    paddingHorizontal: CORE_SPACING.screenX,
    gap: 11,
    marginBottom: 12,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: CORE_RADIUS.lg,
    gap: 8,
  },
  navChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 11,
    minHeight: 36,
    borderRadius: 11,
  },
  navChipActive: {
    backgroundColor: CORE_COLORS.cyanSoft,
    borderColor: CORE_COLORS.cyanBorder,
  },
  navChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  pathText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
    flex: 1,
    paddingHorizontal: 4,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRootsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  quickRootPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: CORE_COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: CORE_RADIUS.pill,
  },
  quickRootPillActive: {
    backgroundColor: CORE_COLORS.cyanSoft,
    borderColor: CORE_COLORS.cyanBorder,
  },
  quickRootText: {
    fontSize: 12,
    fontWeight: "600",
    color: CORE_COLORS.textSecondary,
  },
  transferRow: {
    flexDirection: "row",
    gap: 10,
  },
  transferBtnFull: {
    flex: 1,
  },
  transferBtnHalf: {
    flex: 1,
  },
  fullWidthBtn: {
    width: "100%",
    alignSelf: "stretch",
  },
  progressCard: {
    padding: 15,
    gap: 10,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  progressTitle: {
    fontSize: 13.5,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
    flex: 1,
  },
  progressDest: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  skeletonList: {
    paddingHorizontal: CORE_SPACING.screenX,
    gap: 12,
  },
  skeletonCard: {
    padding: 18,
  },
  listContent: {
    paddingHorizontal: CORE_SPACING.screenX,
    gap: 10,
  },
  rootCard: {
    padding: 16,
  },
  rootCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  rootIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  rootIconVault: {
    backgroundColor: CORE_COLORS.cyanSoft,
    borderColor: CORE_COLORS.cyanBorder,
  },
  rootInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rootTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rootCardTitle: {
    fontSize: 15.5,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
    flexShrink: 1,
  },
  rootCardPath: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  rootRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  emptyDesc: {
    fontSize: 13.5,
    color: CORE_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  sheetBody: {
    gap: 14,
    paddingBottom: 8,
  },
  sheetMetaPills: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  imagePreviewBox: {
    height: 220,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.lg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  sheetFullBtn: {
    width: "100%",
    alignSelf: "stretch",
  },
  sheetActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  sheetActionFlex: {
    flex: 1,
    alignSelf: "stretch",
  },
  folderChangeRow: {
    alignItems: "center",
    paddingVertical: 6,
  },
  folderChangeText: {
    fontSize: 12.5,
    color: CORE_COLORS.textSecondary,
    textDecorationLine: "underline",
    textAlign: "center",
  },
});
