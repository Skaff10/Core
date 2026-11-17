import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Send,
  Square,
  Layers,
  ChevronDown,
  RotateCcw,
  MessageSquare,
  Check,
} from "lucide-react-native";
import { HeaderStatus } from "../../../../components/HeaderStatus";
import { AgentBubble } from "../../../../components/agent/AgentBubble";
import { PermissionCard } from "../../../../components/agent/PermissionCard";
import { useConnectionStore } from "../../../../store/useConnectionStore";
import { useAgentStore } from "../../../../store/agentStore";
import {
  fetchSessionHistory,
  syncSessionFromPc,
  cancelTurn,
  setSessionOption,
} from "../../../../services/agentApi";
import { agentSocket } from "../../../../services/agentSocket";
import { AgentMessage, AgentConfigOption } from "../../../../types/agent";
import { AppScreenShell } from "../../../../components/ui/AppScreenShell";
import { TactilePressable } from "../../../../components/ui/TactilePressable";
import { GlassSurface } from "../../../../components/glassyui/glass-surface";
import { GlassAlert } from "../../../../components/glassyui/glass-alert";
import { GlassButton } from "../../../../components/glassyui/glass-button";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "../../../../components/glassyui/glass-dialog";
import { CORE_COLORS, CORE_RADIUS, CORE_SPACING } from "../../../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../../../theme/typography";

const FALLBACK_CONFIG_OPTIONS: AgentConfigOption[] = [
  {
    id: "model",
    name: "Model",
    currentValue: "gemini-4-argon",
    options: [
      { value: "gemini-4-argon", name: "Gemini 4 Argon" },
      { value: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
      { value: "gemini-pro-orchestrator-g1-pro", name: "Orchestrator (Argon)" },
      { value: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { value: "claude-opus-5-5", name: "Claude Opus 5.5" },
      { value: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      { value: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)" },
    ],
  },
  {
    id: "thought_level",
    name: "Thinking Level",
    currentValue: "medium",
    options: [
      { value: "low", name: "Low" },
      { value: "medium", name: "Medium" },
      { value: "high", name: "High" },
    ],
  },
  {
    id: "mode",
    name: "Mode",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "accept-edits", name: "Accept Edits" },
      { value: "plan", name: "Plan" },
    ],
  },
];

export default function SessionChatScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const {
    activeSessionId,
    activeSessionCwd,
    activeSessionTitle,
    messagesBySession,
    sessionStates,
    configOptionsBySession,
    selectedModel,
    selectedThoughtLevel,
    setActiveSession,
    setHistory,
    setSessionConfigOptions,
    updateSessionConfigOptionLocal,
    setSessionCommands,
    socketConnected,
  } = useAgentStore();

  const [promptText, setPromptText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingOption, setSavingOption] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  const flatListRef = useRef<FlatList<AgentMessage> | null>(null);
  const nearBottomRef = useRef(true);
  const activeCwdRef = useRef(activeSessionCwd);
  activeCwdRef.current = activeSessionCwd;

  const sid = sessionId || "";
  const messages = messagesBySession[sid] || [];
  const turnState = sessionStates[sid] || {
    state: "idle",
    pendingPermission: null,
    queueDepth: 0,
  };
  const configOptions =
    configOptionsBySession[sid] && configOptionsBySession[sid].length > 0
      ? configOptionsBySession[sid]
      : FALLBACK_CONFIG_OPTIONS;

  const currentModelOpt = configOptions.find((o) => o.id === "model");
  const currentModelValue = currentModelOpt?.currentValue || selectedModel;
  const currentModelLabel =
    currentModelOpt?.options.find((x) => x.value === currentModelValue)?.name ||
    currentModelValue;
  const currentModelShort = currentModelLabel
    .replace("Gemini ", "G")
    .replace("Claude ", "C.")
    .replace("Orchestrator (Argon)", "Orch.");

  const currentThoughtOpt = configOptions.find((o) => o.id === "thought_level");
  const currentThoughtValue = currentThoughtOpt?.currentValue || selectedThoughtLevel;
  const currentThoughtLabel =
    currentThoughtOpt?.options.find((x) => x.value === currentThoughtValue)?.name ||
    currentThoughtValue;

  const isRunning = turnState.state === "running";
  const pendingPerm = turnState.pendingPermission;

  const loadSession = useCallback(async () => {
    if (!sid || !pcIp || !authToken) return;
    try {
      setLoadingHistory(true);
      setSyncWarning(null);
      const res = await fetchSessionHistory(
        pcIp,
        pcPort,
        authToken,
        sid,
        activeCwdRef.current
      );
      setHistory(sid, res.messages);
      if (res.configOptions.length > 0) {
        setSessionConfigOptions(sid, res.configOptions);
      }
      if (res.commands.length > 0) {
        setSessionCommands(sid, res.commands);
      }
      if (res.syncError) {
        setSyncWarning(res.syncError);
      }
    } catch (err: any) {
      setSyncWarning(err?.message || "Failed syncing history");
    } finally {
      setLoadingHistory(false);
    }
  }, [
    sid,
    pcIp,
    pcPort,
    authToken,
    setHistory,
    setSessionConfigOptions,
    setSessionCommands,
  ]);

  useEffect(() => {
    if (!sid) return;
    if (activeSessionId !== sid) {
      setActiveSession(sid);
    }
  }, [sid, activeSessionId, setActiveSession]);

  useEffect(() => {
    if (!sid || !pcIp || !authToken) return;
    agentSocket.init(pcIp, pcPort, authToken);
    loadSession().finally(() => {
      agentSocket.subscribeSession(sid);
    });

    return () => {
      agentSocket.unsubscribeSession(sid);
    };
  }, [sid, pcIp, pcPort, authToken, loadSession]);

  const handleManualSync = async () => {
    if (!sid || !pcIp || !authToken || syncing) return;
    try {
      setSyncing(true);
      setSyncWarning(null);
      const res = await syncSessionFromPc(
        pcIp,
        pcPort,
        authToken,
        sid,
        activeSessionCwd,
        true
      );
      setHistory(sid, res.messages);
      if (res.configOptions.length > 0) {
        setSessionConfigOptions(sid, res.configOptions);
      }
    } catch (err: any) {
      setSyncWarning(err?.message || "Manual sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = () => {
    const clean = promptText.trim();
    if (!clean || !sid) return;

    nearBottomRef.current = true;
    const sent = agentSocket.sendPrompt(sid, clean, activeSessionCwd || "");
    if (sent) {
      setPromptText("");
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  const handleStop = async () => {
    if (!sid || !pcIp || !authToken) return;
    try {
      await cancelTurn(pcIp, pcPort, authToken, sid);
    } catch {}
  };

  const handleRespondPermission = (optionId?: string) => {
    if (!sid || !pendingPerm) return;
    agentSocket.respondPermission(sid, pendingPerm.request_id, optionId);
  };

  const handleSetConfigOption = async (configId: string, value: string) => {
    if (!sid) return;
    const prevSnapshot = configOptionsBySession[sid];
    updateSessionConfigOptionLocal(sid, configId, value, FALLBACK_CONFIG_OPTIONS);

    if (!pcIp || !authToken) return;
    try {
      setSavingOption(true);
      setSyncWarning(null);
      const res = await setSessionOption(
        pcIp,
        pcPort,
        authToken,
        sid,
        configId,
        value
      );
      if (Array.isArray(res.configOptions) && res.configOptions.length > 0) {
        setSessionConfigOptions(sid, res.configOptions);
      }
    } catch (err: any) {
      if (prevSnapshot) {
        setSessionConfigOptions(sid, prevSnapshot);
      }
      setSyncWarning(err?.message || `Failed updating ${configId}`);
    } finally {
      setSavingOption(false);
    }
  };

  const handleScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = ev.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);
    nearBottomRef.current = distanceFromBottom < 80;
  };

  return (
    <AppScreenShell edges={["top", "bottom"]}>
      <HeaderStatus title="Antigravity" subtitle="Active Thread" />

      {/* Session Glass Control Bar */}
      <View style={styles.headerBarWrap}>
        <GlassSurface preset="control" elevation="base" style={styles.headerBar}>
          <TactilePressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to threads"
            style={styles.iconBtn}
          >
            <ArrowLeft size={17} color={CORE_COLORS.cyan} />
          </TactilePressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {activeSessionTitle || "Antigravity Session"}
            </Text>
            <Text style={styles.sessionCwd} numberOfLines={1}>
              {activeSessionCwd || ""}
            </Text>
          </View>

          <TactilePressable
            onPress={handleManualSync}
            disabled={syncing}
            accessibilityRole="button"
            accessibilityLabel="Sync conversation"
            style={styles.iconBtn}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={CORE_COLORS.cyan} />
            ) : (
              <RotateCcw size={15} color={CORE_COLORS.textSecondary} />
            )}
          </TactilePressable>

          {isRunning ? (
            <TactilePressable
              haptic
              onPress={handleStop}
              accessibilityRole="button"
              accessibilityLabel="Stop turn"
              style={styles.stopBtn}
            >
              <Square size={12} color={CORE_COLORS.coral} fill={CORE_COLORS.coral} />
              <Text style={styles.stopText}>Stop</Text>
            </TactilePressable>
          ) : (
            <TactilePressable
              onPress={() => setOptionsMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Model, thinking level, and mode options"
              style={styles.optionsBtn}
            >
              <Layers size={14} color={CORE_COLORS.cyan} />
              <Text style={styles.optionsText} numberOfLines={1}>
                {currentModelShort}
                {currentThoughtLabel ? ` · ${currentThoughtLabel}` : ""}
              </Text>
              <ChevronDown size={13} color={CORE_COLORS.textSecondary} />
            </TactilePressable>
          )}
        </GlassSurface>
      </View>

      {/* Model, Thinking Level & Mode Dialog */}
      <GlassDialog open={optionsMenuOpen} onOpenChange={setOptionsMenuOpen}>
        <GlassDialogContent closeLabel="Close session options">
          <GlassDialogTitle>Session Options</GlassDialogTitle>
          <GlassDialogDescription numberOfLines={1}>
            {currentModelLabel} · Thinking: {currentThoughtLabel || "Medium"}
          </GlassDialogDescription>

          <ScrollView
            style={styles.dialogScroll}
            contentContainerStyle={styles.drawerInner}
            showsVerticalScrollIndicator={false}
          >
            {configOptions.map((cfgGroup) => (
              <View key={cfgGroup.id} style={styles.drawerSection}>
                <Text style={styles.drawerLabel}>{cfgGroup.name}</Text>
                <View style={styles.chipsRow}>
                  {cfgGroup.options.map((opt) => {
                    const active = cfgGroup.currentValue === opt.value;
                    return (
                      <TactilePressable
                        key={opt.value}
                        disabled={savingOption}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => handleSetConfigOption(cfgGroup.id, opt.value)}
                      >
                        <View style={styles.chipInner}>
                          {active && <Check size={12} color={CORE_COLORS.cyan} />}
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextActive,
                            ]}
                          >
                            {opt.name}
                          </Text>
                        </View>
                      </TactilePressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dialogFooter}>
            <GlassButton
              variant="prominent"
              size="sm"
              onPress={() => setOptionsMenuOpen(false)}
              style={styles.doneBtn}
            >
              {savingOption ? "Saving..." : "Done"}
            </GlassButton>
          </View>
        </GlassDialogContent>
      </GlassDialog>

      {/* Turn Status Strip */}
      <View style={styles.turnStatusBar}>
        <View style={styles.turnStatusLeft}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isRunning
                  ? CORE_COLORS.cyan
                  : pendingPerm
                  ? CORE_COLORS.amber
                  : socketConnected
                  ? CORE_COLORS.emeraldFill
                  : CORE_COLORS.coral,
              },
            ]}
          />
          <Text style={styles.turnStatusText}>
            {isRunning
              ? "Agent running turn on PC..."
              : pendingPerm
              ? "Waiting on approval"
              : socketConnected
              ? "Shared PC store linked"
              : "Reconnecting socket..."}
          </Text>
        </View>

        {turnState.queueDepth > 0 && (
          <Text style={styles.queueNotice}>Queue: {turnState.queueDepth}</Text>
        )}
      </View>

      {syncWarning ? (
        <View style={styles.warnWrap}>
          <GlassAlert tone="warning">{syncWarning}</GlassAlert>
        </View>
      ) : null}

      {/* Messages & Composer */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        {loadingHistory ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={CORE_COLORS.cyan} />
            <Text style={styles.loadingHistoryText}>
              Syncing conversation from Antigravity...
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <AgentBubble message={item} />}
            contentContainerStyle={styles.messagesList}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (nearBottomRef.current) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MessageSquare size={32} color={CORE_COLORS.textTertiary} />
                <Text style={styles.emptyTitle}>Conversation Ready</Text>
                <Text style={styles.emptyDesc}>
                  Messages share Antigravity&apos;s PC store and appear in your workspace history.
                </Text>
              </View>
            }
          />
        )}

        {pendingPerm && (
          <View style={styles.stickyPermWrap}>
            <PermissionCard
              permission={pendingPerm}
              onRespond={handleRespondPermission}
            />
          </View>
        )}

        <View style={styles.composerWrap}>
          <GlassSurface preset="overlay" elevation="raised" style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              value={promptText}
              onChangeText={setPromptText}
              placeholder={`Message ${
                activeSessionTitle ? activeSessionTitle.slice(0, 22) : "Antigravity"
              }...`}
              placeholderTextColor={CORE_COLORS.textTertiary}
              multiline
            />
            <TactilePressable
              haptic
              onPress={handleSend}
              disabled={!promptText.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send prompt"
              style={[
                styles.sendBtn,
                !promptText.trim() && styles.sendBtnDisabled,
              ]}
            >
              <Send size={16} color="#FFFFFF" />
            </TactilePressable>
          </GlassSurface>
        </View>
      </KeyboardAvoidingView>
    </AppScreenShell>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  headerBarWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
    marginBottom: 8,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: CORE_RADIUS.lg,
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  sessionCwd: {
    ...CORE_TYPOGRAPHY.monoSmall,
    fontSize: 10,
    color: CORE_COLORS.textSecondary,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: CORE_COLORS.coralSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.coralBorder,
    paddingHorizontal: 11,
    height: 36,
    borderRadius: 11,
  },
  stopText: {
    color: CORE_COLORS.coral,
    fontSize: 12,
    fontWeight: "600",
  },
  optionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 11,
    maxWidth: 164,
  },
  optionsText: {
    color: CORE_COLORS.cyan,
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  dialogScroll: {
    maxHeight: 380,
    marginTop: 8,
  },
  drawerInner: {
    paddingVertical: 6,
    gap: 14,
  },
  drawerSection: {
    gap: 7,
  },
  drawerLabel: {
    ...CORE_TYPOGRAPHY.eyebrow,
    color: CORE_COLORS.textSecondary,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: CORE_RADIUS.sm,
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  chipActive: {
    borderColor: CORE_COLORS.cyanBorder,
    backgroundColor: CORE_COLORS.cyanSoft,
  },
  dialogFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  doneBtn: {
    minWidth: 100,
  },
  chipText: {
    color: CORE_COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: "500",
  },
  chipTextActive: {
    color: CORE_COLORS.cyan,
    fontWeight: "600",
  },
  turnStatusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: CORE_SPACING.screenX + 4,
    paddingBottom: 8,
  },
  turnStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  turnStatusText: {
    fontSize: 12,
    fontWeight: "500",
    color: CORE_COLORS.textSecondary,
  },
  queueNotice: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.amber,
    fontWeight: "600",
  },
  warnWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
    marginBottom: 8,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingHistoryText: {
    fontSize: 13,
    color: CORE_COLORS.textSecondary,
  },
  messagesList: {
    paddingHorizontal: CORE_SPACING.screenX,
    paddingVertical: 8,
    flexGrow: 1,
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
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
    maxWidth: 260,
    lineHeight: 20,
  },
  stickyPermWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
  },
  composerWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
    paddingTop: 6,
    paddingBottom: 10,
  },
  inputBar: {
    borderRadius: 22,
    padding: 8,
    paddingLeft: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    color: CORE_COLORS.textPrimary,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 115,
    lineHeight: 20,
  },
  sendBtn: {
    backgroundColor: CORE_COLORS.blueFill,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    opacity: 0.5,
  },
});
