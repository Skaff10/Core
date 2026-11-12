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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Send,
  Square,
  Sparkles,
  Shield,
  Layers,
  Terminal,
  ChevronDown,
  RotateCcw,
} from "lucide-react-native";
import { HeaderStatus } from "../../../../components/HeaderStatus";
import { AgentBubble } from "../../../../components/agent/AgentBubble";
import { PermissionCard } from "../../../../components/agent/PermissionCard";
import { useConnectionStore } from "../../../../store/useConnectionStore";
import { useAgentStore } from "../../../../store/agentStore";
import {
  fetchSessionHistory,
  cancelTurn,
  respondPermission,
  setSessionOption,
} from "../../../../services/agentApi";
import { agentSocket } from "../../../../services/agentSocket";
import { AgentMessage } from "../../../../types/agent";

const MODEL_OPTIONS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "gemini-3.8-flash", label: "Gemini Flash" },
];

const MODE_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "accept-edits", label: "Accept Edits" },
  { id: "plan", label: "Plan" },
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
    selectedModel,
    selectedMode,
    setSelectedModel,
    setSelectedMode,
    setHistory,
    socketConnected,
  } = useAgentStore();

  const [promptText, setPromptText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  const flatListRef = useRef<FlatList<AgentMessage> | null>(null);

  const messages = messagesBySession[sessionId || ""] || [];
  const turnState = sessionStates[sessionId || ""] || {
    state: "idle",
    pendingPermission: null,
    queueDepth: 0,
  };

  const isRunning = turnState.state === "running";
  const pendingPerm = turnState.pendingPermission;

  // Load history & subscribe to live socket stream
  useEffect(() => {
    let mounted = true;
    if (!sessionId || !pcIp || !authToken) return;

    async function initSession() {
      try {
        setLoadingHistory(true);
        const hist = await fetchSessionHistory(pcIp, pcPort, authToken, sessionId);
        if (mounted) {
          setHistory(sessionId, hist);
        }
      } catch {
        // Fallback to live stream
      } finally {
        if (mounted) setLoadingHistory(false);
      }

      // Subscribe to real-time events for this session
      agentSocket.subscribeSession(sessionId, 0);
    }

    initSession();

    return () => {
      mounted = false;
      agentSocket.unsubscribeSession(sessionId);
    };
  }, [sessionId, pcIp, pcPort, authToken, setHistory]);

  const handleSend = () => {
    const clean = promptText.trim();
    if (!clean || !sessionId) return;

    const cwd = activeSessionCwd || "";
    agentSocket.sendPrompt(sessionId, clean, cwd);
    setPromptText("");
  };

  const handleStop = async () => {
    if (!sessionId || !pcIp || !authToken) return;
    try {
      await cancelTurn(pcIp, pcPort, authToken, sessionId);
    } catch {}
  };

  const handleRespondPermission = async (optionId?: string) => {
    if (!sessionId || !pendingPerm) return;
    agentSocket.respondPermission(sessionId, pendingPerm.request_id, optionId);
  };

  const handleChangeModel = (modelId: string) => {
    setSelectedModel(modelId);
    if (sessionId) {
      agentSocket.setOption(sessionId, "model", modelId);
    }
    setOptionsMenuOpen(false);
  };

  const handleChangeMode = (modeId: string) => {
    setSelectedMode(modeId);
    if (sessionId) {
      agentSocket.setOption(sessionId, "mode", modeId);
    }
    setOptionsMenuOpen(false);
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
            <Text style={styles.optionsText}>{selectedModel.split("-")[1] || "Sonnet"}</Text>
            <ChevronDown size={12} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Model & Mode Options Drawer */}
      {optionsMenuOpen && (
        <View style={styles.optionsDrawer}>
          <View style={styles.drawerSection}>
            <Text style={styles.drawerLabel}>ACTIVE AI MODEL</Text>
            <View style={styles.chipsRow}>
              {MODEL_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.chip,
                    selectedModel === m.id && styles.chipActive,
                  ]}
                  onPress={() => handleChangeModel(m.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedModel === m.id && styles.chipTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.drawerSection}>
            <Text style={styles.drawerLabel}>PERMISSION MODE</Text>
            <View style={styles.chipsRow}>
              {MODE_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.chip,
                    selectedMode === m.id && styles.chipActive,
                  ]}
                  onPress={() => handleChangeMode(m.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedMode === m.id && styles.chipTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
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
              : "AGENT READY"}
          </Text>
        </View>

        {turnState.queueDepth > 0 && (
          <Text style={styles.queueNotice}>
            QUEUE: {turnState.queueDepth} PENDING
          </Text>
        )}
      </View>

      {/* Main Messages Stream */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loadingHistory ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#06B6D4" />
            <Text style={styles.loadingHistoryText}>Loading conversation history...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <AgentBubble message={item} />}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
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
            placeholder={`Instruct Antigravity in ${activeSessionTitle ? activeSessionTitle.slice(0, 20) : "project"}...`}
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
    gap: 10,
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
  },
  optionsText: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  optionsDrawer: {
    backgroundColor: "#1A1D24",
    borderBottomWidth: 1,
    borderBottomColor: "#06B6D4",
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

