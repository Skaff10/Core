import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, AlertCircle, Wifi, Camera, Database } from "lucide-react-native";
import { HeaderStatus } from "../../components/HeaderStatus";
import { useConnectionStore } from "../../store/useConnectionStore";
import { CoreApiClient } from "../../services/api";
import { executeCameraRollSync, SyncRunSummary } from "../../services/syncTask";
import { syncLedger } from "../../services/db";

export default function SettingsScreen() {
  const {
    pcIp,
    pcPort,
    authToken,
    isConnected,
    lastError,
    saveCredentials,
    setConnectedState,
    setTelemetry,
    setQuickActions,
  } = useConnectionStore();

  const [ipInput, setIpInput] = useState(pcIp);
  const [portInput, setPortInput] = useState(pcPort);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [statusBanner, setStatusBanner] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Phase 3: Camera Roll Sync State
  const [syncingMedia, setSyncingMedia] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [remoteSyncInfo, setRemoteSyncInfo] = useState<{
    sync_dir: string;
    file_count: number;
    total_mb: number;
  } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadSyncTelemetry = useCallback(
    async (overrideIp?: string, overridePort?: string, overrideToken?: string) => {
      const ip = overrideIp || pcIp;
      const port = overridePort || pcPort;
      const token = overrideToken || authToken;
      try {
        const count = await syncLedger.getSyncedCount();
        setLedgerCount(count);
        const remote = await CoreApiClient.fetchSyncStatus(ip, port, token);
        setRemoteSyncInfo(remote);
      } catch {
        // Ignore if offline
      }
    },
    [pcIp, pcPort, authToken]
  );

  useEffect(() => {
    setIpInput(pcIp);
    setPortInput(pcPort);
    setTokenInput(authToken);
    loadSyncTelemetry();
  }, [pcIp, pcPort, authToken]);

  const handleSaveAndVerify = async () => {
    setTesting(true);
    setStatusBanner(null);
    try {
      // 1. Check network reachability first
      const health = await CoreApiClient.checkHealth(ipInput, portInput, 4000);
      if (!health.ok) {
        throw new Error(`Host Unreachable: ${health.message}`);
      }

      // 2. Persist credentials
      await saveCredentials(ipInput, portInput, tokenInput);

      // 3. Ping with authentication
      const pingRes = await CoreApiClient.ping(ipInput, portInput, tokenInput);
      const actions = await CoreApiClient.fetchQuickActions(
        ipInput,
        portInput,
        tokenInput
      );
      if (pingRes.telemetry) {
        setTelemetry(pingRes.telemetry);
      }
      setQuickActions(actions);
      setConnectedState(true, null);
      await loadSyncTelemetry(ipInput, portInput, tokenInput);
      setStatusBanner({
        ok: true,
        message: `VERIFIED // HANDSHAKE OK (${actions.length} ACTIONS LOADED)`,
      });
    } catch (err: any) {
      setConnectedState(false, err?.message || "Connection failed");
      setStatusBanner({
        ok: false,
        message: `FAILED // ${err?.message || "Unable to reach PC"}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleManualSyncNow = async () => {
    setSyncingMedia(true);
    setSyncError(null);
    try {
      const summary = await executeCameraRollSync(ipInput, portInput, tokenInput, 25);
      setSyncSummary(summary);
      await loadSyncTelemetry(ipInput, portInput, tokenInput);
    } catch (err: any) {
      setSyncError(err?.message || "Camera sync failed");
    } finally {
      setSyncingMedia(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="NODE CONFIGURATION" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* SECTION 01: PC LINK PARAMETERS */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Wifi size={14} color="#06B6D4" />
            <Text style={styles.panelTitle}>WINDOWS PC LINK PARAMETERS</Text>
          </View>

          <View style={styles.panelBody}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PC LOCAL IPv4 ADDRESS</Text>
              <TextInput
                style={styles.input}
                value={ipInput}
                onChangeText={setIpInput}
                placeholder="192.168.0.120"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>FASTAPI SERVER PORT</Text>
              <TextInput
                style={styles.input}
                value={portInput}
                onChangeText={setPortInput}
                placeholder="8000"
                placeholderTextColor="#64748B"
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PAIRING PIN OR BEARER TOKEN</Text>
              <TextInput
                style={styles.input}
                value={tokenInput}
                onChangeText={setTokenInput}
                placeholder="6-digit PIN or core_..."
                placeholderTextColor="#64748B"
                autoCapitalize="none"
              />
              <View style={styles.presetRow}>
                <TouchableOpacity
                  style={styles.presetPill}
                  onPress={() => setTokenInput("610105")}
                >
                  <Text style={styles.presetPillText}>PIN: 610105</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetPill}
                  onPress={() => setIpInput("192.168.0.120")}
                >
                  <Text style={styles.presetPillText}>LAN: 192.168.0.120</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetPill}
                  onPress={() => setIpInput("127.0.0.1")}
                >
                  <Text style={styles.presetPillText}>LOCALHOST</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Generated on PC Web Control Panel (http://localhost:8000)
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSaveAndVerify}
              disabled={testing}
            >
              <Text style={styles.primaryBtnText}>
                {testing ? "VERIFYING HANDSHAKE..." : "SAVE & TEST HANDSHAKE"}
              </Text>
            </TouchableOpacity>

            {statusBanner && (
              <View
                style={[
                  styles.banner,
                  statusBanner.ok ? styles.bannerOk : styles.bannerErr,
                ]}
              >
                {statusBanner.ok ? (
                  <CheckCircle2 size={14} color="#10B981" />
                ) : (
                  <AlertCircle size={14} color="#EF4444" />
                )}
                <Text
                  style={[
                    styles.bannerText,
                    { color: statusBanner.ok ? "#10B981" : "#EF4444" },
                  ]}
                >
                  {statusBanner.message}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* SECTION 02: PHASE 3 CAMERA ROLL AUTO-SYNC ENGINE */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Camera size={14} color="#06B6D4" />
            <Text style={styles.panelTitle}>BACKGROUND CAMERA ROLL SYNC (6H CRON)</Text>
          </View>

          <View style={styles.panelBody}>
            <View style={styles.syncStatsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>SQLITE LEDGER</Text>
                <Text style={styles.statValue}>{ledgerCount} HASHES</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>PC VAULT FILES</Text>
                <Text style={styles.statValue}>
                  {remoteSyncInfo ? `${remoteSyncInfo.file_count} (${remoteSyncInfo.total_mb} MB)` : "---"}
                </Text>
              </View>
            </View>

            <View style={styles.vaultPathBox}>
              <Database size={12} color="#94A3B8" />
              <Text style={styles.vaultPathText} numberOfLines={1}>
                DEST: {remoteSyncInfo?.sync_dir || "C:\\CommandCenter\\Sync"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.syncNowBtn}
              onPress={handleManualSyncNow}
              disabled={syncingMedia}
            >
              {syncingMedia ? (
                <ActivityIndicator size="small" color="#06B6D4" />
              ) : (
                <Text style={styles.syncNowBtnText}>SYNC CAMERA ROLL NOW</Text>
              )}
            </TouchableOpacity>

            {syncSummary && (
              <View style={styles.bannerOk}>
                <Text style={[styles.bannerText, { color: "#10B981", padding: 10 }]}>
                  SYNC COMPLETE ({syncSummary.timestamp}) // UPLOADED: {syncSummary.uploaded} | SKIPPED DUPLICATES: {syncSummary.skipped}
                </Text>
              </View>
            )}

            {syncError && (
              <View style={styles.bannerErr}>
                <Text style={[styles.bannerText, { color: "#EF4444", padding: 10 }]}>
                  SYNC ERR // {syncError}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* SECTION 03: DIAGNOSTICS */}
        <View style={styles.diagnosticsBox}>
          <Text style={styles.diagTitle}>LIVE TELEMETRY DIAGNOSTICS</Text>
          <Text style={styles.diagRow}>
            WS ENDPOINT: ws://{ipInput}:{portInput}/ws/monitor
          </Text>
          <Text style={styles.diagRow}>
            LINK STATE: {isConnected ? "ONLINE (STREAMING)" : "DISCONNECTED"}
          </Text>
          {lastError && (
            <Text style={[styles.diagRow, { color: "#EF4444" }]}>
              LAST FAULT: {lastError}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  panel: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
  },
  panelHeader: {
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelTitle: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  panelBody: {
    padding: 14,
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    color: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 2,
    fontFamily: "monospace",
    fontSize: 13,
  },
  hint: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  presetPill: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  presetPillText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  primaryBtn: {
    backgroundColor: "#06B6D4",
    paddingVertical: 12,
    borderRadius: 2,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#090D16",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  syncStatsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 10,
    borderRadius: 2,
    gap: 4,
  },
  statLabel: {
    color: "#64748B",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  statValue: {
    color: "#06B6D4",
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  vaultPathBox: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vaultPathText: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "monospace",
    flex: 1,
  },
  syncNowBtn: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#06B6D4",
    paddingVertical: 12,
    borderRadius: 2,
    alignItems: "center",
  },
  syncNowBtnText: {
    color: "#06B6D4",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 2,
    borderWidth: 1,
  },
  bannerOk: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 2,
  },
  bannerErr: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 2,
  },
  bannerText: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: "700",
  },
  diagnosticsBox: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 14,
    borderRadius: 2,
    gap: 6,
  },
  diagTitle: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  diagRow: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
  },
});
