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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  HardDrive,
  ArrowUpLeft,
  RefreshCw,
  X,
  Download,
  ExternalLink,
} from "lucide-react-native";
import { HeaderStatus } from "../../components/HeaderStatus";
import { FileRow } from "../../components/FileRow";
import { useConnectionStore } from "../../store/useConnectionStore";
import {
  CoreApiClient,
  WhitelistedRoot,
  RemoteFileEntry,
} from "../../services/api";

export default function FilesScreen() {
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const [roots, setRoots] = useState<WhitelistedRoot[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview / Download Modal State
  const [selectedFile, setSelectedFile] = useState<RemoteFileEntry | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

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

  const handleDownloadToDevice = async (file: RemoteFileEntry) => {
    setDownloading(true);
    setDownloadStatus(null);
    try {
      const remoteUrl = CoreApiClient.buildFileStreamUrl(
        pcIp,
        pcPort,
        authToken,
        file.path
      );
      const destFile = new File(Paths.document, file.name);
      const downloaded = await File.downloadFileAsync(remoteUrl, destFile, {
        idempotent: true,
      });

      setDownloadStatus(`SAVED TO DEVICE // ${downloaded.uri}`);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri);
      }
    } catch (err: any) {
      setDownloadStatus(`DOWNLOAD FAILED // ${err?.message || "Error"}`);
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
              style={styles.rootCard}
              activeOpacity={0.75}
              onPress={() => openDirectory(item.path)}
            >
              <View style={styles.rootCardLeft}>
                <HardDrive size={18} color="#06B6D4" />
                <View>
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

      {/* FILE PREVIEW & STREAM/DOWNLOAD MODAL */}
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
                <Text style={styles.modalMeta}>
                  PATH: {selectedFile.path}
                </Text>
                <Text style={styles.modalMeta}>
                  TYPE: {selectedFile.category.toUpperCase()} ({selectedFile.extension || "RAW"})
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
                  <View style={styles.statusBox}>
                    <Text style={styles.statusBoxText}>{downloadStatus}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.streamBtn}
                    onPress={() => handleStreamExternal(selectedFile)}
                  >
                    <ExternalLink size={14} color="#06B6D4" />
                    <Text style={styles.streamBtnText}>STREAM / PREVIEW</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleDownloadToDevice(selectedFile)}
                    disabled={downloading}
                  >
                    <Download size={14} color="#090D16" />
                    <Text style={styles.downloadBtnText}>
                      {downloading ? "FETCHING..." : "SAVE TO ANDROID"}
                    </Text>
                  </TouchableOpacity>
                </View>
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
    borderColor: "#06B6D4",
    padding: 8,
  },
  statusBoxText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
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
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  downloadBtn: {
    flex: 1,
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
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "900",
  },
});
