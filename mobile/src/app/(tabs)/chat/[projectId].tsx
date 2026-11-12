import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Clock,
  PlayCircle,
  AlertTriangle,
  FolderGit2,
  ChevronRight,
} from "lucide-react-native";
import { HeaderStatus } from "../../../components/HeaderStatus";
import { useConnectionStore } from "../../../store/useConnectionStore";
import { useAgentStore } from "../../../store/agentStore";
import {
  fetchProjectSessions,
  createNewSession,
} from "../../../services/agentApi";
import { AgentProject, AgentSession } from "../../../types/agent";

const MODEL_OPTIONS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (Fast & Smart)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (Deep Reasoning)" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Ultra Fast)" },
];

const MODE_OPTIONS = [
  { id: "default", label: "Default (Ask on edits/commands)" },
  { id: "accept-edits", label: "Accept Edits (Auto-write files)" },
  { id: "plan", label: "Plan Mode (Careful planning)" },
];

export default function ProjectSessionsScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const { setActiveSession } = useAgentStore();

  const [project, setProject] = useState<AgentProject | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Conversation Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].id);
  const [selectedMode, setSelectedMode] = useState(MODE_OPTIONS[0].id);

  const loadSessions = useCallback(async () => {
    if (!pcIp || !authToken || !projectId) return;
    try {
      setErrorMsg(null);
      const data = await fetchProjectSessions(
        pcIp,
        pcPort,
        authToken,
        projectId
      );
      setProject(data.project);
      setSessions(data.sessions || []);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed loading sessions");
    }
  }, [pcIp, pcPort, authToken, projectId]);

  useEffect(() => {
    setLoading(true);
    loadSessions().finally(() => setLoading(false));
  }, [loadSessions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const handleCreateSession = async () => {
    if (!project || !pcIp || !authToken) return;
    try {
      setCreating(true);
      const res = await createNewSession(
        pcIp,
        pcPort,
        authToken,
        project.path,
        selectedModel,
        selectedMode
      );
      setModalVisible(false);
      const newSid = res.session?.sessionId;
      if (newSid) {
        setActiveSession(
          newSid,
          project.id,
          project.path,
          res.session?.title || "New Conversation"
        );
        router.push(`/(tabs)/chat/session/${newSid}` as any);
      } else {
        await loadSessions();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed creating session");
    } finally {
      setCreating(false);
    }
  };

  const openSession = (session: AgentSession) => {
    setActiveSession(
      session.sessionId,
      projectId,
      session.cwd,
      session.title
    );
    router.push(`/(tabs)/chat/session/${session.sessionId}` as any);
  };

  const renderSessionItem = ({ item }: { item: AgentSession }) => {
    return (
      <TouchableOpacity
        style={[
          styles.sessionCard,
          item.isAwaitingPermission && styles.cardApproval,
          item.isRunning && styles.cardRunning,
        ]}
        activeOpacity={0.8}
        onPress={() => openSession(item)}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionLeft}>
            <MessageSquare size={16} color="#06B6D4" />
            <Text style={styles.sessionTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <ChevronRight size={16} color="#64748B" />
        </View>

        <View style={styles.sessionFooter}>
          <View style={styles.footerLeft}>
            <Clock size={11} color="#64748B" />
            <Text style={styles.timeText}>
              {item.updatedAt
                ? new Date(item.updatedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Active"}
            </Text>
          </View>

          <View style={styles.badgesRow}>
            {item.isAwaitingPermission && (
              <View style={[styles.badge, styles.badgeApproval]}>
                <AlertTriangle size={10} color="#F59E0B" />
                <Text style={styles.badgeApprovalText}>APPROVAL</Text>
              </View>
            )}
            {item.isRunning && (
              <View style={[styles.badge, styles.badgeRunning]}>
                <PlayCircle size={10} color="#06B6D4" />
                <Text style={styles.badgeRunningText}>RUNNING</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="ANTIGRAVITY // THREADS" />

      {/* Project Bar */}
      <View style={styles.projectBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={16} color="#06B6D4" />
        </TouchableOpacity>

        <View style={styles.projectInfo}>
          <View style={styles.projectNameRow}>
            <FolderGit2 size={15} color="#10B981" />
            <Text style={styles.projectName} numberOfLines={1}>
              {project?.name || "Workspace"}
            </Text>
          </View>
          <Text style={styles.projectPath} numberOfLines={1}>
            {project?.path || ""}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.newThreadBtn}
          activeOpacity={0.8}
          onPress={() => setModalVisible(true)}
        >
          <Plus size={14} color="#090D16" />
          <Text style={styles.newThreadBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>ERR: {errorMsg}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#06B6D4" />
          <Text style={styles.loadingText}>Fetching Threads...</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderSessionItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#06B6D4"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MessageSquare size={36} color="#334155" />
              <Text style={styles.emptyTitle}>No Threads in this Workspace</Text>
              <Text style={styles.emptyDesc}>
                Tap "+ New" above to start chatting with Antigravity in this project!
              </Text>
            </View>
          }
        />
      )}

      {/* Create New Session Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW ANTIGRAVITY SESSION</Text>
            <Text style={styles.modalDesc}>
              Target: {project?.name} ({project?.path})
            </Text>

            {/* Model Selector */}
            <Text style={styles.modalSectionLabel}>CHOOSE MODEL</Text>
            {MODEL_OPTIONS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.optionRow,
                  selectedModel === m.id && styles.optionRowActive,
                ]}
                onPress={() => setSelectedModel(m.id)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedModel === m.id && styles.optionTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Mode Selector */}
            <Text style={styles.modalSectionLabel}>EXECUTION MODE</Text>
            {MODE_OPTIONS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.optionRow,
                  selectedMode === m.id && styles.optionRowActive,
                ]}
                onPress={() => setSelectedMode(m.id)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedMode === m.id && styles.optionTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                disabled={creating}
                onPress={handleCreateSession}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#090D16" />
                ) : (
                  <Text style={styles.confirmBtnText}>Launch Session</Text>
                )}
              </TouchableOpacity>
            </View>
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
  projectBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    gap: 10,
  },
  backBtn: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 8,
    borderRadius: 3,
  },
  projectInfo: {
    flex: 1,
    gap: 2,
  },
  projectNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  projectName: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "800",
  },
  projectPath: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  newThreadBtn: {
    backgroundColor: "#06B6D4",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 3,
  },
  newThreadBtnText: {
    color: "#090D16",
    fontWeight: "900",
    fontSize: 11,
    fontFamily: "monospace",
  },
  listContent: {
    padding: 14,
    paddingBottom: 24,
    gap: 8,
  },
  sessionCard: {
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 4,
    padding: 12,
    gap: 8,
  },
  cardApproval: {
    borderColor: "#F59E0B",
    backgroundColor: "#1C1813",
  },
  cardRunning: {
    borderColor: "#06B6D4",
    backgroundColor: "#12181C",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  sessionTitle: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#222222",
    paddingTop: 6,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timeText: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  badgesRow: {
    flexDirection: "row",
    gap: 5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeApproval: {
    backgroundColor: "#3B2506",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  badgeApprovalText: {
    color: "#F59E0B",
    fontSize: 8,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  badgeRunning: {
    backgroundColor: "#082F49",
    borderWidth: 1,
    borderColor: "#06B6D4",
  },
  badgeRunningText: {
    color: "#06B6D4",
    fontSize: 8,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  errorBox: {
    backgroundColor: "#3A1212",
    padding: 10,
    margin: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontFamily: "monospace",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: "monospace",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyDesc: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 260,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 6,
    padding: 18,
    gap: 10,
  },
  modalTitle: {
    color: "#06B6D4",
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  modalDesc: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 6,
  },
  modalSectionLabel: {
    color: "#64748B",
    fontSize: 9.5,
    fontFamily: "monospace",
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  optionRow: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 10,
    borderRadius: 3,
  },
  optionRowActive: {
    borderColor: "#06B6D4",
    backgroundColor: "#121A1D",
  },
  optionText: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: "monospace",
  },
  optionTextActive: {
    color: "#06B6D4",
    fontWeight: "700",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#222222",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 3,
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontFamily: "monospace",
    fontWeight: "700",
    fontSize: 12,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#06B6D4",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 3,
  },
  confirmBtnText: {
    color: "#090D16",
    fontFamily: "monospace",
    fontWeight: "900",
    fontSize: 12,
  },
});

