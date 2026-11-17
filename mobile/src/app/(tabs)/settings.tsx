import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import {
  Wifi,
  Camera,
  Database,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Check,
  Activity,
  Image as ImageIcon,
  Film,
  FileText,
} from "lucide-react-native";
import { HeaderStatus } from "../../components/HeaderStatus";
import { useConnectionStore } from "../../store/useConnectionStore";
import { useAgentStore } from "../../store/agentStore";
import { CoreApiClient, SyncStatusResponse } from "../../services/api";
import {
  executeCameraRollSync,
  pickAndSendToPcVault,
  SyncRunSummary,
} from "../../services/syncTask";
import { syncLedger } from "../../services/db";
import { CoreCard } from "../../components/ui/CoreCard";
import { TactilePressable } from "../../components/ui/TactilePressable";
import { GlassInput } from "../../components/glassyui/glass-input";
import { GlassButton } from "../../components/glassyui/glass-button";
import { GlassBadge } from "../../components/glassyui/glass-badge";
import { GlassAlert } from "../../components/glassyui/glass-alert";
import { CORE_COLORS, CORE_RADIUS, CORE_SPACING } from "../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../theme/typography";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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
  const { socketConnected } = useAgentStore();

  const [ipInput, setIpInput] = useState(pcIp);
  const [portInput, setPortInput] = useState(pcPort);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState<"ip" | "ws" | null>(null);

  const [statusBanner, setStatusBanner] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Camera Roll & Phone Vault Sync State
  const [syncingMedia, setSyncingMedia] = useState(false);
  const [syncProgressText, setSyncProgressText] = useState<string | null>(null);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [remoteSyncInfo, setRemoteSyncInfo] =
    useState<SyncStatusResponse | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadSyncTelemetry = useCallback(
    async (
      overrideIp?: string,
      overridePort?: string,
      overrideToken?: string
    ) => {
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
  }, [pcIp, pcPort, authToken, loadSyncTelemetry]);

  const trimmedIp = ipInput.trim();
  const parsedPort = Number(portInput.trim());
  const ipInvalid = trimmedIp.length === 0;
  const portInvalid =
    portInput.trim().length === 0 ||
    !Number.isInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65535;
  const tokenInvalid = tokenInput.trim().length === 0;

  const handleCopy = async (field: "ip" | "ws", value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 1800);
    } catch {}
  };

  const handleSaveAndVerify = async () => {
    if (ipInvalid || portInvalid || tokenInvalid) {
      setStatusBanner({
        ok: false,
        message: "Please provide a valid IPv4 host, port (1–65535), and PIN/token.",
      });
      return;
    }

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
        message: `Handshake verified (${actions.length} actions loaded)`,
      });
    } catch (err: any) {
      setConnectedState(false, err?.message || "Connection failed");
      setStatusBanner({
        ok: false,
        message: err?.message || "Unable to reach PC",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleManualSyncNow = async () => {
    setSyncingMedia(true);
    setSyncError(null);
    setSyncSummary(null);
    setSyncProgressText("Initializing camera roll sync...");
    try {
      const summary = await executeCameraRollSync(
        ipInput,
        portInput,
        tokenInput,
        50,
        {
          interactiveFallback: true,
          onProgress: (msg) => setSyncProgressText(msg),
        }
      );
      if (!summary.canceled) {
        setSyncSummary(summary);
      }
      await loadSyncTelemetry(ipInput, portInput, tokenInput);
    } catch (err: any) {
      setSyncError(err?.message || "Camera sync failed");
    } finally {
      setSyncingMedia(false);
      setSyncProgressText(null);
    }
  };

  const handleSendAnyFilesToVault = async () => {
    setSyncingMedia(true);
    setSyncError(null);
    setSyncSummary(null);
    setSyncProgressText("Select files, photos, or videos...");
    try {
      const summary = await pickAndSendToPcVault(ipInput, portInput, tokenInput, {
        mediaOnly: false,
        useLedger: false,
        onProgress: (msg) => setSyncProgressText(msg),
      });
      if (!summary.canceled) {
        setSyncSummary(summary);
      }
      await loadSyncTelemetry(ipInput, portInput, tokenInput);
    } catch (err: any) {
      setSyncError(err?.message || "File transfer failed");
    } finally {
      setSyncingMedia(false);
      setSyncProgressText(null);
    }
  };

  const wsEndpoint = `ws://${trimmedIp || "192.168.0.120"}:${
    portInput.trim() || "8000"
  }/ws/monitor`;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="Node Configuration" subtitle="Link & Vault Sync" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.container,
            {
              paddingBottom:
                Math.max(insets.bottom, 12) + CORE_SPACING.floatingDockOffset,
            },
          ]}
        >
          {/* SECTION 01: WINDOWS PC LINK PARAMETERS */}
          <CoreCard variant="panel" elevation="base" style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconWell}>
                  <Wifi size={16} color={CORE_COLORS.cyan} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Windows PC Link</Text>
                  <Text style={styles.cardSub}>Host endpoint & pairing auth</Text>
                </View>
              </View>
              <GlassBadge dot tone={isConnected ? "green" : "neutral"}>
                {isConnected ? "Verified" : "Unverified"}
              </GlassBadge>
            </View>

            <View style={styles.fieldsStack}>
              <View style={styles.inputWithAction}>
                <View style={styles.inputFlex}>
                  <GlassInput
                    label="PC Local IPv4 Address"
                    value={ipInput}
                    onChangeText={setIpInput}
                    placeholder="192.168.0.120"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    invalid={ipInvalid}
                    hint={ipInvalid ? "Host IP address is required" : undefined}
                    style={styles.monoInput}
                  />
                </View>
                <TactilePressable
                  onPress={() => handleCopy("ip", trimmedIp)}
                  accessibilityLabel="Copy IP address"
                  style={styles.inlineIconBtn}
                >
                  {copiedField === "ip" ? (
                    <Check size={16} color={CORE_COLORS.emerald} />
                  ) : (
                    <Copy size={16} color={CORE_COLORS.textSecondary} />
                  )}
                </TactilePressable>
              </View>

              <GlassInput
                label="FastAPI Server Port"
                value={portInput}
                onChangeText={setPortInput}
                placeholder="8000"
                keyboardType="number-pad"
                invalid={portInvalid}
                hint={portInvalid ? "Enter a port between 1 and 65535" : undefined}
                style={styles.monoInput}
              />

              <View style={styles.inputWithAction}>
                <View style={styles.inputFlex}>
                  <GlassInput
                    label="Pairing PIN or Bearer Token"
                    value={tokenInput}
                    onChangeText={setTokenInput}
                    placeholder="6-digit PIN or core_..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showToken}
                    invalid={tokenInvalid}
                    hint={
                      tokenInvalid
                        ? "Token or PIN is required"
                        : "Generated on PC Web Control Panel (http://localhost:8000)"
                    }
                    style={styles.monoInput}
                  />
                </View>
                <TactilePressable
                  onPress={() => setShowToken((v) => !v)}
                  accessibilityLabel={showToken ? "Hide token" : "Reveal token"}
                  style={styles.inlineIconBtn}
                >
                  {showToken ? (
                    <EyeOff size={16} color={CORE_COLORS.cyan} />
                  ) : (
                    <Eye size={16} color={CORE_COLORS.textSecondary} />
                  )}
                </TactilePressable>
              </View>

              {/* Quick Presets */}
              <View style={styles.presetRow}>
                <TactilePressable
                  onPress={() => setTokenInput("610105")}
                  style={styles.presetPill}
                >
                  <Text style={styles.presetText}>PIN: 610105</Text>
                </TactilePressable>
                <TactilePressable
                  onPress={() => setIpInput("192.168.0.120")}
                  style={styles.presetPill}
                >
                  <Text style={styles.presetText}>LAN: 192.168.0.120</Text>
                </TactilePressable>
                <TactilePressable
                  onPress={() => setIpInput("127.0.0.1")}
                  style={styles.presetPill}
                >
                  <Text style={styles.presetText}>Localhost</Text>
                </TactilePressable>
              </View>

              <GlassButton
                variant="prominent"
                size="md"
                style={styles.fullWidthBtn}
                onPress={handleSaveAndVerify}
                disabled={testing}
              >
                {testing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : null}
                {testing ? "Verifying Handshake..." : "Save & Test Handshake"}
              </GlassButton>

              {statusBanner && (
                <GlassAlert
                  key={statusBanner.message}
                  tone={statusBanner.ok ? "success" : "danger"}
                  onDismiss={() => setStatusBanner(null)}
                >
                  {statusBanner.message}
                </GlassAlert>
              )}
            </View>
          </CoreCard>

          {/* SECTION 02: PHONE VAULT & CAMERA ROLL SYNC */}
          <CoreCard variant="panel" elevation="base" style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconWell}>
                  <Camera size={16} color={CORE_COLORS.teal} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Phone Vault & Media Sync</Text>
                  <Text style={styles.cardSub}>6h background sync · SHA-256 ledger</Text>
                </View>
              </View>
            </View>

            {/* Primary Storage Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statWell}>
                <Text style={styles.statLabel}>SQLite Ledger</Text>
                <Text style={styles.statValue}>{ledgerCount}</Text>
                <Text style={styles.statSub}>Synced hashes</Text>
              </View>

              <View style={styles.statWell}>
                <Text style={styles.statLabel}>PC Vault Total</Text>
                <Text style={styles.statValue}>
                  {remoteSyncInfo ? remoteSyncInfo.file_count : "---"}
                </Text>
                <Text style={styles.statSub}>
                  {remoteSyncInfo ? `${remoteSyncInfo.total_mb} MB stored` : "Offline"}
                </Text>
              </View>
            </View>

            {/* Category Breakdown */}
            {remoteSyncInfo && (
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownTile}>
                  <View style={styles.breakdownTop}>
                    <ImageIcon size={13} color={CORE_COLORS.emerald} />
                    <Text style={styles.breakdownLabel}>Photos</Text>
                  </View>
                  <Text style={styles.breakdownVal}>
                    {remoteSyncInfo.photos_count ?? 0}
                  </Text>
                </View>

                <View style={styles.breakdownTile}>
                  <View style={styles.breakdownTop}>
                    <Film size={13} color={CORE_COLORS.amber} />
                    <Text style={styles.breakdownLabel}>Videos</Text>
                  </View>
                  <Text style={styles.breakdownVal}>
                    {remoteSyncInfo.videos_count ?? 0}
                  </Text>
                </View>

                <View style={styles.breakdownTile}>
                  <View style={styles.breakdownTop}>
                    <FileText size={13} color={CORE_COLORS.cyan} />
                    <Text style={styles.breakdownLabel}>Files</Text>
                  </View>
                  <Text style={styles.breakdownVal}>
                    {remoteSyncInfo.files_count ?? 0}
                  </Text>
                </View>
              </View>
            )}

            {/* Vault Path Pill */}
            <View style={styles.vaultPathBox}>
              <Database size={14} color={CORE_COLORS.cyan} />
              <Text style={styles.vaultPathText} numberOfLines={2}>
                {remoteSyncInfo?.sync_dir || "F:\\From_phone"} (\Photos, \Videos, \Files)
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.syncActions}>
              <GlassButton
                variant="prominent"
                size="md"
                style={styles.fullWidthBtn}
                onPress={handleManualSyncNow}
                disabled={syncingMedia}
              >
                {syncingMedia ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Camera size={16} color="#FFFFFF" />
                )}
                {syncingMedia
                  ? syncProgressText || "Syncing..."
                  : "Sync Camera Roll Now"}
              </GlassButton>

              <GlassButton
                variant="primary"
                size="md"
                style={styles.fullWidthBtn}
                onPress={handleSendAnyFilesToVault}
                disabled={syncingMedia}
              >
                <Upload size={15} color={CORE_COLORS.cyan} />
                Pick & Send Any Files
              </GlassButton>
            </View>

            {syncSummary && (
              <GlassAlert
                tone={
                  syncSummary.failed > 0 && syncSummary.uploaded === 0
                    ? "danger"
                    : "success"
                }
                title={`Sync Complete · ${syncSummary.timestamp}`}
              >
                Scanned {syncSummary.scanned} · Uploaded {syncSummary.uploaded} · Skipped{" "}
                {syncSummary.skipped}
                {syncSummary.failed > 0
                  ? ` · Failed ${syncSummary.failed}${
                      syncSummary.lastError ? ` (${syncSummary.lastError})` : ""
                    }`
                  : ""}
              </GlassAlert>
            )}

            {syncError && (
              <GlassAlert tone="danger" title="Sync Error">
                {syncError}
              </GlassAlert>
            )}
          </CoreCard>

          {/* SECTION 03: LIVE TELEMETRY DIAGNOSTICS */}
          <CoreCard variant="panel" elevation="base" style={styles.sectionCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconWell}>
                  <Activity size={16} color={CORE_COLORS.sky} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Live Telemetry Diagnostics</Text>
                  <Text style={styles.cardSub}>Real-time socket & bridge state</Text>
                </View>
              </View>
            </View>

            <View style={styles.diagTable}>
              <View style={styles.diagRow}>
                <Text style={styles.diagKey}>WebSocket Endpoint</Text>
                <TactilePressable
                  onPress={() => handleCopy("ws", wsEndpoint)}
                  style={styles.diagCopyPill}
                >
                  <Text style={styles.diagMonoVal} numberOfLines={1}>
                    {wsEndpoint}
                  </Text>
                  {copiedField === "ws" ? (
                    <Check size={13} color={CORE_COLORS.emerald} />
                  ) : (
                    <Copy size={13} color={CORE_COLORS.textSecondary} />
                  )}
                </TactilePressable>
              </View>

              <View style={styles.diagDivider} />

              <View style={styles.diagRowBetween}>
                <Text style={styles.diagKey}>PC Telemetry Stream</Text>
                <GlassBadge dot tone={isConnected ? "green" : "red"}>
                  {isConnected ? "Online · Streaming" : "Disconnected"}
                </GlassBadge>
              </View>

              <View style={styles.diagDivider} />

              <View style={styles.diagRowBetween}>
                <Text style={styles.diagKey}>Antigravity Bridge</Text>
                <GlassBadge dot tone={socketConnected ? "blue" : "neutral"}>
                  {socketConnected ? "Socket Linked" : "Idle"}
                </GlassBadge>
              </View>
            </View>

            {lastError ? (
              <GlassAlert tone="danger" title="Last Fault">
                {lastError}
              </GlassAlert>
            ) : null}
          </CoreCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    paddingHorizontal: CORE_SPACING.screenX,
    paddingTop: 4,
    gap: CORE_SPACING.sectionGap,
  },
  sectionCard: {
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: CORE_COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.cyanBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    ...CORE_TYPOGRAPHY.sectionTitle,
    color: CORE_COLORS.textPrimary,
  },
  cardSub: {
    ...CORE_TYPOGRAPHY.caption,
    color: CORE_COLORS.textSecondary,
  },
  fieldsStack: {
    gap: 14,
  },
  inputWithAction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  inlineIconBtn: {
    marginTop: 28,
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  monoInput: {
    ...CORE_TYPOGRAPHY.mono,
    fontSize: 15,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetPill: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderDefault,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: CORE_RADIUS.pill,
  },
  presetText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.cyan,
    fontWeight: "600",
  },
  fullWidthBtn: {
    width: "100%",
    alignSelf: "stretch",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statWell: {
    flex: 1,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    padding: 14,
    gap: 4,
  },
  statLabel: {
    ...CORE_TYPOGRAPHY.eyebrow,
    fontSize: 10,
    color: CORE_COLORS.textSecondary,
  },
  statValue: {
    ...CORE_TYPOGRAPHY.heroValue,
    color: CORE_COLORS.cyan,
  },
  statSub: {
    fontSize: 12,
    color: CORE_COLORS.textTertiary,
  },
  breakdownRow: {
    flexDirection: "row",
    gap: 10,
  },
  breakdownTile: {
    flex: 1,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 11,
    gap: 4,
  },
  breakdownTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: CORE_COLORS.textSecondary,
  },
  breakdownVal: {
    ...CORE_TYPOGRAPHY.metricValue,
    fontSize: 16,
    color: CORE_COLORS.textPrimary,
  },
  vaultPathBox: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CORE_RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  vaultPathText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
    flex: 1,
  },
  syncActions: {
    gap: 10,
  },
  diagTable: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  diagRow: {
    paddingVertical: 10,
    gap: 6,
  },
  diagRowBetween: {
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  diagDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CORE_COLORS.borderSubtle,
  },
  diagKey: {
    fontSize: 13,
    fontWeight: "500",
    color: CORE_COLORS.textSecondary,
  },
  diagCopyPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  diagMonoVal: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textPrimary,
    flex: 1,
  },
});
