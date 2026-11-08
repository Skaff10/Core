import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File, Directory, Paths } from "expo-file-system";
import { Asset } from "expo-media-library";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HardDrive,
  ArrowUpLeft,
  RefreshCw,
  X,
  Download,
  ExternalLink,
  Upload,
  Folder,
  Camera,
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

const ANDROID_SAVE_DIR_KEY = "@core/android_download_dir_uri";

export default function FilesScreen() {
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const [roots, setRoots] = useState<WhitelistedRoot[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mobile -> PC Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Preview / Download Modal State
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
      const list = await CoreApiClient.fetchWhitelistedRoots(pcIp, pcPort, authToken);
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
    setUploading(true);
    setUploadBanner({ ok: true, text: "OPENING FILE PICKER..." });
    try {
      const summary = await pickAndSendToPcVault(pcIp, pcPort, authToken, {
        mediaOnly: false,
        useLedger: false,
        targetDir,
        onProgress: (msg) => setUploadBanner({ ok: true, text: msg }),
      });

      if (summary.canceled) {
        setUploadBanner(null);
        return;
      }

      if (summary.failed > 0 && summary.uploaded === 0) {
        setUploadBanner({
          ok: false,
          text: `UPLOAD FAILED // ${summary.lastError || "Unable to send file"}`,
        });
      } else {
        const destLabel = targetDir || "F:\\From_phone (Photos/Videos/Files)";
        setUploadBanner({
          ok: summary.failed === 0,
          text: `SENT ${summary.uploaded} FILE(S) TO PC -> ${destLabel}${
            summary.failed > 0 ? ` (${summary.failed} FAILED)` : ""
          }`,
        });
        if (currentPath) {
          await openDirectory(currentPath);
        }
      }
    } catch (err: any) {
      setUploadBanner({
        ok: false,
        text: `UPLOAD ERR // ${err?.message || "Failed sending to PC"}`,
      });
    } finally {
      setUploading(false);
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
      setDownloadStatus({ ok: true, text: `BROWSER DOWNLOAD STARTED // ${file.name}` });
      return;
    }

    setDownloading(true);
    setDownloadStatus({ ok: true, text: "DOWNLOADING FROM PC..." });
    try {
      const localFile = await fetchPcFileToCache(file);

      let dirUri = forcePickFolder ? null : savedPhoneDirUri;
      if (!dirUri) {
        setDownloadStatus({
          ok: true,
          text: "SELECT A DESTINATION FOLDER ON YOUR PHONE (E.G. DOWNLOADS)...",
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
        // Saved SAF folder permission expired or folder moved — re-prompt once
        const pickedDir = await Directory.pickDirectoryAsync();
        dirUri = pickedDir.uri;
        await AsyncStorage.setItem(ANDROID_SAVE_DIR_KEY, dirUri);
        setSavedPhoneDirUri(dirUri);
        await localFile.copy(pickedDir, { overwrite: true });
      }

      setDownloadStatus({
        ok: true,
        text: `SAVED TO PHONE FOLDER // ${file.name}`,
      });
    } catch (err: any) {
      const msg = String(err?.message || "Save failed");
      if (msg.toLowerCase().includes("cancel")) {
        setDownloadStatus({ ok: false, text: "FOLDER SELECTION CANCELED" });
      } else {
        setDownloadStatus({ ok: false, text: `SAVE FAILED // ${msg}` });
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveMediaToGallery = async (file: RemoteFileEntry) => {
    setDownloading(true);
    setDownloadStatus({ ok: true, text: "DOWNLOADING TO PHONE GALLERY..." });
    try {
      const localFile = await fetchPcFileToCache(file);
      await Asset.create(localFile.uri);
      setDownloadStatus({
        ok: true,
        text: `SAVED TO ANDROID GALLERY // ${file.name}`,
      });
    } catch (err: any) {
      setDownloadStatus({
        ok: false,
        text: `GALLERY SAVE FAILED // ${err?.message || "Error"}`,
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
    setDownloadStatus({ ok: true, text: "PREPARING FILE FOR SHARE / OPEN..." });
    try {
      const localFile = await fetchPcFileToCache(file);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localFile.uri);
        setDownloadStatus({ ok: true, text: `SHARED // ${file.name}` });
      } else {
        handleStreamExternal(file);
      }
    } catch (err: any) {
      setDownloadStatus({
        ok: false,
        text: `SHARE FAILED // ${err?.message || "Error"}`,
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
      <HeaderStatus title="REMOTE FILE EXPLORER" />

      {/* BREADCRUMB NAVIGATION BAR */}
      <View style={styles.breadcrumbBar}>
        <TouchableOpacity style={styles.rootPill} onPress={loadRoots}>
          <HardDrive size={13} color="#06B6D4" />
          <Text style={styles.rootPillText}>ROOTS</Text>
        </TouchableOpacity>

        {currentPath && (
          <TouchableOpacity
            style={styles.upPill}
            onPress={() => (parentPath ? openDirectory(parentPath) : loadRoots())}
          >
            <ArrowUpLeft size={13} color="#E2E8F0" />
            <Text style={styles.upPillText}>UP</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.currentPathText} numberOfLines={1}>
          {currentPath || "SELECT WHITELISTED VOLUME"}
        </Text>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => (currentPath ? openDirectory(currentPath) : loadRoots())}
        >
          <RefreshCw size={13} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* MOBILE -> PC TRANSFER ACTION BAR */}
      <View style={styles.transferBar}>
        <TouchableOpacity
          style={styles.sendVaultBtn}
          onPress={() => handleUploadFromPhone(undefined)}
          disabled={uploading}
        >
          <Upload size={13} color="#090D16" />
          <Text style={styles.sendVaultBtnText}>
            {uploading ? "TRANSFERRING..." : "SEND TO PC (F:\\From_phone)"}
          </Text>
        </TouchableOpacity>

        {currentPath && (
          <TouchableOpacity
            style={styles.uploadHereBtn}
            onPress={() => handleUploadFromPhone(currentPath)}
            disabled={uploading}
          >
            <Folder size={13} color="#06B6D4" />
            <Text style={styles.uploadHereBtnText}>UPLOAD HERE</Text>
          </TouchableOpacity>
        )}
      </View>

      {uploadBanner && (
        <View
          style={[
            styles.transferBanner,
            uploadBanner.ok ? styles.transferBannerOk : styles.transferBannerErr,
          ]}
        >
          <Text
            style={[
              styles.transferBannerText,
              { color: uploadBanner.ok ? "#10B981" : "#EF4444" },
            ]}
          >
            {uploadBanner.text}
          </Text>
          {!uploading && (
            <TouchableOpacity onPress={() => setUploadBanner(null)}>
              <X size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>ERR // {errorMsg}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color="#06B6D4" />
          <Text style={styles.loadingText}>QUERYING PC FILE SYSTEM...</Text>
        </View>
      ) : !currentPath ? (
        /* WHITELISTED ROOTS VIEW */
        <FlatList
          data={roots}
          keyExtractor={(item) => item.path}
          contentContainerStyle={styles.rootsContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.rootCard,
                item.is_vault && { borderColor: "#06B6D4" },
              ]}
              activeOpacity={0.75}
              onPress={() => openDirectory(item.path)}
            >
              <View style={styles.rootCardLeft}>
                <HardDrive size={18} color="#06B6D4" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rootCardTitle}>{item.name}</Text>
                  <Text style={styles.rootCardPath}>{item.path}</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.rootStatusTag,
                  { color: item.exists ? "#10B981" : "#F59E0B" },
                ]}
              >
                {item.exists ? "MOUNTED" : "OFFLINE"}
              </Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        /* DIRECTORY ENTRIES TABLE */
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <FileRow item={item} onPress={handlePressEntry} />
          )}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.loadingText}>DIRECTORY IS EMPTY</Text>
            </View>
          }
        />
      )}

      {/* FILE PREVIEW & PC -> MOBILE DOWNLOAD MODAL */}
      <Modal
        visible={Boolean(selectedFile)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFile(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedFile?.name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedFile(null)}>
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {selectedFile && (
              <View style={styles.modalBody}>
                <Text style={styles.modalMeta}>PATH: {selectedFile.path}</Text>
                <Text style={styles.modalMeta}>
                  TYPE: {selectedFile.category.toUpperCase()} (
                  {selectedFile.extension || "RAW"})
                </Text>

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
                  <View
                    style={[
                      styles.statusBox,
                      !downloadStatus.ok && { borderColor: "#EF4444" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBoxText,
                        !downloadStatus.ok && { color: "#EF4444" },
                      ]}
                    >
                      {downloadStatus.text}
                    </Text>
                  </View>
                )}

                {isMediaFile && Platform.OS !== "web" && (
                  <TouchableOpacity
                    style={styles.galleryBtn}
                    onPress={() => handleSaveMediaToGallery(selectedFile)}
                    disabled={downloading}
                  >
                    <Camera size={14} color="#090D16" />
                    <Text style={styles.downloadBtnText}>
                      {downloading ? "WORKING..." : "SAVE PHOTO/VIDEO TO GALLERY"}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleSaveToPhoneFolder(selectedFile, false)}
                    disabled={downloading}
                  >
                    <Download size={14} color="#090D16" />
                    <Text style={styles.downloadBtnText}>
                      {downloading ? "SAVING..." : "SAVE TO PHONE FOLDER"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.streamBtn}
                    onPress={() => handleShareOrOpenApp(selectedFile)}
                    disabled={downloading}
                  >
                    <ExternalLink size={14} color="#06B6D4" />
                    <Text style={styles.streamBtnText}>SHARE / OPEN</Text>
                  </TouchableOpacity>
                </View>

                {Platform.OS !== "web" && (
                  <View style={styles.folderChangeRow}>
                    <TouchableOpacity
                      onPress={() => handleSaveToPhoneFolder(selectedFile, true)}
                      disabled={downloading}
                    >
                      <Text style={styles.folderChangeText}>
                        {savedPhoneDirUri
                          ? "CHANGE PHONE DESTINATION FOLDER"
                          : "FIRST SAVE WILL ASK WHICH PHONE FOLDER TO USE (E.G. DOWNLOADS)"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  breadcrumbBar: {
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transferBar: {
    backgroundColor: "#151515",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sendVaultBtn: {
    flex: 1,
    backgroundColor: "#06B6D4",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sendVaultBtnText: {
    color: "#090D16",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  uploadHereBtn: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#06B6D4",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  uploadHereBtnText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  transferBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  transferBannerOk: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderBottomColor: "#10B981",
  },
  transferBannerErr: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderBottomColor: "#EF4444",
  },
  transferBannerText: {
    flex: 1,
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  rootPill: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#06B6D4",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  rootPillText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  upPill: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#3A3A3A",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upPillText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  currentPathText: {
    flex: 1,
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "monospace",
  },
  refreshBtn: {
    padding: 6,
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "#EF4444",
    padding: 10,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    fontFamily: "monospace",
  },
  centerBox: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
  },
  rootsContainer: {
    padding: 16,
    gap: 12,
  },
  rootCard: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 14,
    borderRadius: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rootCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  rootCardTitle: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
  },
  rootCardPath: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  rootStatusTag: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    overflow: "hidden",
  },
  modalHeader: {
    backgroundColor: "#161616",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
    marginRight: 10,
  },
  modalBody: {
    padding: 14,
    gap: 10,
  },
  modalMeta: {
    color: "#94A3B8",
    fontSize: 10,
    fontFamily: "monospace",
  },
  imagePreviewBox: {
    height: 220,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  statusBox: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#10B981",
    padding: 8,
  },
  statusBoxText: {
    color: "#10B981",
    fontSize: 10,
    fontFamily: "monospace",
  },
  galleryBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 11,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  streamBtn: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#06B6D4",
    paddingVertical: 11,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  streamBtnText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  downloadBtn: {
    flex: 1.4,
    backgroundColor: "#06B6D4",
    paddingVertical: 11,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  downloadBtnText: {
    color: "#090D16",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  folderChangeRow: {
    alignItems: "center",
    paddingTop: 4,
  },
  folderChangeText: {
    color: "#64748B",
    fontSize: 9,
    fontFamily: "monospace",
    textDecorationLine: "underline",
  },
});
