import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Send,
  Square,
  Layers,
  ChevronDown,
  RotateCcw,
  MessageSquare,
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
} from "../../../../services/agentApi";
import { agentSocket } from "../../../../services/agentSocket";
import { AgentMessage, AgentConfigOption } from "../../../../types/agent";

const FALLBACK_CONFIG_OPTIONS: AgentConfigOption[] = [
  {
    id: "model",
    name: "Model",
    currentValue: "claude-sonnet-5-5",
    options: [
      { value: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      { value: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
      { value: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { value: "claude-opus-5-5", name: "Claude Opus 5.5" },
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
    activeSessionCwd,
    activeSessionTitle,
    messagesBySession,
    sessionStates,
    configOptionsBySession,
    selectedModel,
    setSelectedModel,
    setSelectedMode,
    setHistory,
    setSessionConfigOptions,
    setSessionCommands,
    socketConnected,
  } = useAgentStore();

  const [promptText, setPromptText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  const flatListRef = useRef<FlatList<AgentMessage> | null>(null);
  const nearBottomRef = useRef(true);

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
  const currentModelShort =
    currentModelOpt?.options.find((x) => x.value === currentModelValue)?.name ||
    currentModelValue;

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
        activeSessionCwd
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
    activeSessionCwd,
    setHistory,
    setSessionConfigOptions,
    setSessionCommands,
  ]);

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

  const handleSetConfigOption = (configId: string, value: string) => {
    if (configId === "model") setSelectedModel(value);
    if (configId === "mode") setSelectedMode(value);
    if (sid) {
      agentSocket.setOption(sid, configId, value);
    }
    setOptionsMenuOpen(false);
  };

  const handleScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = ev.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);
    nearBottomRef.current = distanceFromBottom < 80;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="ANTIGRAVITY // INTERFACE" />

      {/* Session Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={16} color="#06B6D4" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {activeSessionTitle || "Antigravity Session"}
          </Text>
          <Text style={styles.sessionCwd} numberOfLines={1}>
            {activeSessionCwd || ""}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.syncIconBtn}
          onPress={handleManualSync}
          disabled={syncing}
          activeOpacity={0.75}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#06B6D4" />
          ) : (
            <RotateCcw size={14} color="#94A3B8" />
          )}
        </TouchableOpacity>

        {isRunning ? (
          <TouchableOpacity
            style={styles.stopBtn}
            activeOpacity={0.8}
            onPress={handleStop}
          >
            <Square size={13} color="#EF4444" fill="#EF4444" />
            <Text style={styles.stopText}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.optionsBtn}
            activeOpacity={0.8}
            onPress={() => setOptionsMenuOpen(!optionsMenuOpen)}
          >
            <Layers size={14} color="#06B6D4" />
            <Text style={styles.optionsText} numberOfLines={1}>
              {currentModelShort.split(" ").slice(0, 2).join(" ")}
            </Text>
            <ChevronDown size={12} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Dynamic Model / Thinking / Mode Options Drawer */}
      {optionsMenuOpen && (
        <ScrollView style={styles.optionsDrawer} contentContainerStyle={styles.drawerInner}>
          {configOptions.map((cfgGroup) => (
            <View key={cfgGroup.id} style={styles.drawerSection}>
              <Text style={styles.drawerLabel}>
                {cfgGroup.name.toUpperCase()}
              </Text>
              <View style={styles.chipsRow}>
                {cfgGroup.options.map((opt) => {
                  const active = cfgGroup.currentValue === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => handleSetConfigOption(cfgGroup.id, opt.value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {opt.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Turn status bar */}
      <View style={styles.turnStatusBar}>
        <View style={styles.turnStatusLeft}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isRunning
                  ? "#06B6D4"
                  : pendingPerm
                  ? "#F59E0B"
                  : socketConnected
                  ? "#10B981"
                  : "#EF4444",
              },
            ]}
          />
          <Text style={styles.turnStatusText}>
            {isRunning
              ? "AGENT RUNNING TURN ON PC..."
              : pendingPerm
              ? "WAITING ON APPROVAL"
              : socketConnected
              ? "SHARED PC STORE LINKED"
              : "RECONNECTING SOCKET..."}
          </Text>
        </View>

        {turnState.queueDepth > 0 && (
          <Text style={styles.queueNotice}>
            QUEUE: {turnState.queueDepth} PENDING
          </Text>
        )}
      </View>

      {syncWarning ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText} numberOfLines={2}>
            SYNC NOTICE: {syncWarning}
          </Text>
        </View>
      ) : null}

      {/* Main Messages Stream */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loadingHistory ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#06B6D4" />
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
                <MessageSquare size={32} color="#334155" />
                <Text style={styles.emptyTitle}>Conversation Ready</Text>
                <Text style={styles.emptyDesc}>
                  Messages here share Antigravity&apos;s PC store and appear in your workspace history.
                </Text>
              </View>
            }
          />
        )}

        {/* Sticky Permission Approval Card */}
        {pendingPerm && (
          <View style={styles.stickyPermWrap}>
            <PermissionCard
              permission={pendingPerm}
              onRespond={handleRespondPermission}
            />
          </View>
        )}

        {/* Composer Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={promptText}
            onChangeText={setPromptText}
            placeholder={`Instruct Antigravity in ${
              activeSessionTitle ? activeSessionTitle.slice(0, 20) : "project"
            }...`}
            placeholderTextColor="#64748B"
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !promptText.trim() && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={!promptText.trim()}
          >
            <Send size={15} color="#090D16" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  flexOne: {
    flex: 1,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    gap: 8,
  },
  backBtn: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 7,
    borderRadius: 3,
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  sessionTitle: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "800",
  },
  sessionCwd: {
    color: "#64748B",
    fontSize: 9.5,
    fontFamily: "monospace",
  },
  syncIconBtn: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 7,
    borderRadius: 3,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#3B1212",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 3,
  },
  stopText: {
    color: "#EF4444",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  optionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    maxWidth: 120,
  },
  optionsText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  optionsDrawer: {
    maxHeight: 240,
    backgroundColor: "#1A1D24",
    borderBottomWidth: 1,
    borderBottomColor: "#06B6D4",
  },
  drawerInner: {
    padding: 12,
    gap: 10,
  },
  drawerSection: {
    gap: 6,
  },
  drawerLabel: {
    color: "#64748B",
    fontSize: 8.5,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2D3748",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 3,
  },
  chipActive: {
    borderColor: "#06B6D4",
    backgroundColor: "#082F49",
  },
  chipText: {
    color: "#94A3B8",
    fontSize: 10.5,
    fontFamily: "monospace",
  },
  chipTextActive: {
    color: "#06B6D4",
    fontWeight: "700",
  },
  turnStatusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#141414",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  turnStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  turnStatusText: {
    color: "#64748B",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  queueNotice: {
    color: "#F59E0B",
    fontSize: 8.5,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  warnBanner: {
    backgroundColor: "#2B1E08",
    borderBottomWidth: 1,
    borderBottomColor: "#F59E0B",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  warnBannerText: {
    color: "#FDE68A",
    fontSize: 10,
    fontFamily: "monospace",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingHistoryText: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
  },
  messagesList: {
    padding: 12,
    paddingBottom: 16,
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
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyDesc: {
    color: "#64748B",
    fontSize: 11.5,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 17,
  },
  stickyPermWrap: {
    paddingHorizontal: 12,
  },
  inputBar: {
    backgroundColor: "#181818",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 3,
    color: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    maxHeight: 110,
    fontFamily: "monospace",
  },
  sendBtn: {
    backgroundColor: "#06B6D4",
    width: 38,
    height: 36,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#2A2A2A",
    opacity: 0.5,
  },
});
