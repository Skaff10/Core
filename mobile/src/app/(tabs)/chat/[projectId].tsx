import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Clock,
  PlayCircle,
  AlertTriangle,
  FolderGit2,
  ChevronRight,
  Check,
} from "lucide-react-native";
import { HeaderStatus } from "../../../components/HeaderStatus";
import { useConnectionStore } from "../../../store/useConnectionStore";
import { useAgentStore } from "../../../store/agentStore";
import {
  fetchProjectSessions,
  createNewSession,
} from "../../../services/agentApi";
import { AgentProject, AgentSession } from "../../../types/agent";
import { AppScreenShell } from "../../../components/ui/AppScreenShell";
import { CoreCard } from "../../../components/ui/CoreCard";
import { TactilePressable } from "../../../components/ui/TactilePressable";
import { GlassSurface } from "../../../components/glassyui/glass-surface";
import { GlassButton } from "../../../components/glassyui/glass-button";
import { GlassBadge } from "../../../components/glassyui/glass-badge";
import { GlassAlert } from "../../../components/glassyui/glass-alert";
import { GlassSkeleton } from "../../../components/glassyui/glass-skeleton";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "../../../components/glassyui/glass-dialog";
import { CORE_COLORS, CORE_RADIUS, CORE_SPACING } from "../../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../../theme/typography";

const MODEL_OPTIONS = [
  { id: "gemini-4-argon", label: "Gemini 4 Argon", tag: "Default · Pro" },
  { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", tag: "Balanced" },
  { id: "gemini-pro-orchestrator-g1-pro", label: "Orchestrator (Argon)", tag: "Agentic" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", tag: "Ultra Fast" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", tag: "Deep Reasoning" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", tag: "Fast & Smart" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", tag: "Open Weights" },
];

const THOUGHT_LEVEL_OPTIONS = [
  { id: "low", label: "Low", desc: "Minimal reasoning overhead" },
  { id: "medium", label: "Medium", desc: "Balanced speed and depth" },
  { id: "high", label: "High", desc: "Deep multi-step reasoning" },
  { id: "xhigh", label: "Extra", desc: "Maximum thinking budget (Hydrogen)" },
];

const MODE_OPTIONS = [
  { id: "default", label: "Default", desc: "Ask before edits & commands" },
  { id: "accept-edits", label: "Accept Edits", desc: "Auto-write file edits" },
  { id: "plan", label: "Plan Mode", desc: "Research & plan first" },
];

export default function ProjectSessionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const { setActiveSession, setSessionConfigOptions } = useAgentStore();

  const [project, setProject] = useState<AgentProject | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].id);
  const [selectedThoughtLevel, setSelectedThoughtLevel] = useState("medium");
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
      setErrorMsg(err?.message || "Failed loading threads");
    }
  }, [pcIp, pcPort, authToken, projectId]);

  useEffect(() => {
    setLoading(true);
    loadSessions().finally(() => setLoading(false));
  }, [loadSessions]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const handleCreateSession = async () => {
    if (!project || !pcIp || !authToken) return;
    try {
      setCreating(true);
      const effectiveThought =
        selectedThoughtLevel === "xhigh" && selectedModel !== "gemini-4-hydrogen"
          ? "high"
          : selectedThoughtLevel;
      const res = await createNewSession(
        pcIp,
        pcPort,
        authToken,
        project.path,
        selectedModel,
        selectedMode,
        effectiveThought
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
        if (Array.isArray(res.session?.configOptions) && res.session.configOptions.length > 0) {
          setSessionConfigOptions(newSid, res.session.configOptions);
        }
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
    const borderHighlight = item.isAwaitingPermission
      ? CORE_COLORS.amberBorder
      : item.isRunning
      ? CORE_COLORS.cyanBorder
      : undefined;

    return (
      <TactilePressable
        haptic
        onPress={() => openSession(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open thread ${item.title}`}
      >
        <CoreCard
          variant="subtle"
          accentBorderColor={borderHighlight}
          style={styles.sessionCard}
        >
          <View style={styles.sessionHeader}>
            <View style={styles.sessionLeft}>
              <View style={styles.sessionIconWell}>
                <MessageSquare size={15} color={CORE_COLORS.cyan} />
              </View>
              <Text style={styles.sessionTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            <ChevronRight size={16} color={CORE_COLORS.textTertiary} />
          </View>

          <View style={styles.sessionFooter}>
            <View style={styles.footerLeft}>
              <Clock size={12} color={CORE_COLORS.textTertiary} />
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
              {item.activeOnPc && <GlassBadge tone="green">PC Live</GlassBadge>}
              {item.isAwaitingPermission && (
                <GlassBadge tone="orange">
                  <AlertTriangle size={10} color={CORE_COLORS.amber} /> Approval
                </GlassBadge>
              )}
              {item.isRunning && (
                <GlassBadge tone="blue">
                  <PlayCircle size={10} color={CORE_COLORS.cyan} /> Running
                </GlassBadge>
              )}
            </View>
          </View>
        </CoreCard>
      </TactilePressable>
    );
  };

  return (
    <AppScreenShell>
      <HeaderStatus title="Antigravity" subtitle="Workspace Threads" />

      {/* Workspace Navigation Bar */}
      <View style={styles.projectBarWrap}>
        <GlassSurface preset="control" elevation="base" style={styles.projectBar}>
          <TactilePressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to workspaces"
            style={styles.backBtn}
          >
            <ArrowLeft size={18} color={CORE_COLORS.cyan} />
          </TactilePressable>

          <View style={styles.projectInfo}>
            <View style={styles.projectNameRow}>
              <FolderGit2 size={15} color={CORE_COLORS.emerald} />
              <Text style={styles.projectName} numberOfLines={1}>
                {project?.name || "Workspace"}
              </Text>
            </View>
            <Text style={styles.projectPath} numberOfLines={1}>
              {project?.path || ""}
            </Text>
          </View>

          <GlassButton
            size="sm"
            variant="prominent"
            onPress={() => setModalVisible(true)}
            accessibilityLabel="Create new thread"
          >
            <Plus size={14} color="#FFFFFF" />
            New
          </GlassButton>
        </GlassSurface>
      </View>

      {errorMsg ? (
        <View style={styles.errorWrap}>
          <GlassAlert tone="danger">{errorMsg}</GlassAlert>
        </View>
      ) : null}

      {loading && !refreshing && sessions.length === 0 ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((k) => (
            <CoreCard key={k} variant="subtle" style={styles.skeletonCard}>
              <GlassSkeleton variant="text" lines={2} />
            </CoreCard>
          ))}
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderSessionItem}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom:
                Math.max(insets.bottom, 12) + CORE_SPACING.floatingDockOffset,
            },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CORE_COLORS.cyan}
              colors={[CORE_COLORS.cyan]}
            />
          }
          ListEmptyComponent={
            <CoreCard variant="subtle" style={styles.emptyBox}>
              <MessageSquare size={30} color={CORE_COLORS.textSecondary} />
              <Text style={styles.emptyTitle}>No Threads Yet</Text>
              <Text style={styles.emptyDesc}>
                Tap New above to start an Antigravity conversation in this project.
              </Text>
            </CoreCard>
          }
        />
      )}

      {/* New Session Glass Dialog */}
      <GlassDialog open={modalVisible} onOpenChange={setModalVisible}>
        <GlassDialogContent closeLabel="Cancel new session">
          <GlassDialogTitle>New Antigravity Session</GlassDialogTitle>
          <GlassDialogDescription numberOfLines={2}>
            {project?.name} · {project?.path}
          </GlassDialogDescription>

          <ScrollView
            style={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Model</Text>
            <View style={styles.optionsGroup}>
              {MODEL_OPTIONS.map((m) => {
                const active = selectedModel === m.id;
                return (
                  <TactilePressable
                    key={m.id}
                    onPress={() => {
                      setSelectedModel(m.id);
                      if (m.id !== "gemini-4-hydrogen" && selectedThoughtLevel === "xhigh") {
                        setSelectedThoughtLevel("high");
                      }
                    }}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                  >
                    <View style={styles.optionLeft}>
                      <Text
                        style={[
                          styles.optionTitle,
                          active && styles.optionTitleActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                      <Text style={styles.optionSub}>{m.tag}</Text>
                    </View>
                    {active && <Check size={16} color={CORE_COLORS.cyan} />}
                  </TactilePressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
              Thinking Level
            </Text>
            <View style={styles.optionsGroup}>
              {THOUGHT_LEVEL_OPTIONS.filter(
                (t) => t.id !== "xhigh" || selectedModel === "gemini-4-hydrogen"
              ).map((t) => {
                const active = selectedThoughtLevel === t.id;
                return (
                  <TactilePressable
                    key={t.id}
                    onPress={() => setSelectedThoughtLevel(t.id)}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                  >
                    <View style={styles.optionLeft}>
                      <Text
                        style={[
                          styles.optionTitle,
                          active && styles.optionTitleActive,
                        ]}
                      >
                        {t.label}
                      </Text>
                      <Text style={styles.optionSub}>{t.desc}</Text>
                    </View>
                    {active && <Check size={16} color={CORE_COLORS.cyan} />}
                  </TactilePressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
              Execution Mode
            </Text>
            <View style={styles.optionsGroup}>
              {MODE_OPTIONS.map((m) => {
                const active = selectedMode === m.id;
                return (
                  <TactilePressable
                    key={m.id}
                    onPress={() => setSelectedMode(m.id)}
                    style={[styles.optionRow, active && styles.optionRowActive]}
                  >
                    <View style={styles.optionLeft}>
                      <Text
                        style={[
                          styles.optionTitle,
                          active && styles.optionTitleActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                      <Text style={styles.optionSub}>{m.desc}</Text>
                    </View>
                    {active && <Check size={16} color={CORE_COLORS.cyan} />}
                  </TactilePressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.modalBtnRow}>
            <GlassButton
              variant="soft"
              style={styles.modalBtn}
              onPress={() => setModalVisible(false)}
              disabled={creating}
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="prominent"
              style={styles.modalBtn}
              onPress={handleCreateSession}
              disabled={creating}
            >
              {creating ? "Launching..." : "Launch Session"}
            </GlassButton>
          </View>
        </GlassDialogContent>
      </GlassDialog>
    </AppScreenShell>
  );
}

const styles = StyleSheet.create({
  projectBarWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
    marginBottom: 14,
  },
  projectBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: CORE_RADIUS.lg,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  projectNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
    flexShrink: 1,
  },
  projectPath: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  errorWrap: {
    paddingHorizontal: CORE_SPACING.screenX,
    marginBottom: 10,
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
    gap: 11,
  },
  sessionCard: {
    padding: 16,
    gap: 11,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sessionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  sessionIconWell: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: CORE_COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.cyanBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "600",
    lineHeight: 20,
    color: CORE_COLORS.textPrimary,
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CORE_COLORS.borderSubtle,
    paddingTop: 9,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timeText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textTertiary,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 6,
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
  modalScroll: {
    maxHeight: 340,
    marginTop: 14,
  },
  sectionLabel: {
    ...CORE_TYPOGRAPHY.eyebrow,
    color: CORE_COLORS.textSecondary,
    marginBottom: 8,
  },
  optionsGroup: {
    gap: 7,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
  },
  optionRowActive: {
    borderColor: CORE_COLORS.cyanBorder,
    backgroundColor: CORE_COLORS.cyanSoft,
  },
  optionLeft: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: CORE_COLORS.textPrimary,
  },
  optionTitleActive: {
    color: CORE_COLORS.cyan,
  },
  optionSub: {
    fontSize: 12,
    color: CORE_COLORS.textSecondary,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    flex: 1,
  },
});
