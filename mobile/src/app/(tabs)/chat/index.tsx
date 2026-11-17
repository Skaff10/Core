import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  FolderGit2,
  Monitor,
  Search,
  AlertTriangle,
  PlayCircle,
  RefreshCw,
  FolderOpen,
  X,
  ChevronRight,
  MessageSquare,
} from "lucide-react-native";
import { HeaderStatus } from "../../../components/HeaderStatus";
import { useConnectionStore } from "../../../store/useConnectionStore";
import { useAgentStore } from "../../../store/agentStore";
import { fetchAgentProjects } from "../../../services/agentApi";
import { agentSocket } from "../../../services/agentSocket";
import { AgentProject } from "../../../types/agent";
import { useGlassTheme } from "../../../components/glassyui/glass-provider";
import { GlassSurface } from "../../../components/glassyui/glass-surface";
import { GlassBadge } from "../../../components/glassyui/glass-badge";
import { GlassAlert } from "../../../components/glassyui/glass-alert";
import { GlassSkeleton } from "../../../components/glassyui/glass-skeleton";
import { CoreCard } from "../../../components/ui/CoreCard";
import { TactilePressable } from "../../../components/ui/TactilePressable";
import { AnimatedEntrance } from "../../../components/ui/MotionPrimitives";
import { CORE_COLORS, CORE_RADIUS, CORE_SPACING } from "../../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../../theme/typography";

function formatLastActive(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ProjectsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useGlassTheme();
  const { pcIp, pcPort, authToken } = useConnectionStore();
  const { projects, setProjects, socketConnected } = useAgentStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasAnimatedInitial = useRef(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (preferences.reduceMotion) {
      focusAnim.setValue(searchFocused ? 1 : 0);
      return;
    }
    Animated.timing(focusAnim, {
      toValue: searchFocused ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [focusAnim, preferences.reduceMotion, searchFocused]);

  useEffect(() => {
    if (pcIp && authToken) {
      agentSocket.init(pcIp, pcPort, authToken);
    }
  }, [pcIp, pcPort, authToken]);

  const loadProjects = useCallback(async () => {
    if (!pcIp || !authToken) return;
    try {
      setErrorMsg(null);
      const data = await fetchAgentProjects(pcIp, pcPort, authToken);
      setProjects(data);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed loading workspaces");
    }
  }, [pcIp, pcPort, authToken, setProjects]);

  useEffect(() => {
    setLoading(true);
    loadProjects().finally(() => {
      setLoading(false);
      setTimeout(() => {
        hasAnimatedInitial.current = true;
      }, 450);
    });
  }, [loadProjects]);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q)
    );
  });

  const searchBorderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CORE_COLORS.borderDefault, CORE_COLORS.focusBorder],
  });

  const renderProjectItem = ({
    item,
    index,
  }: {
    item: AgentProject;
    index: number;
  }) => {
    const hasApproval = item.hasPendingPermission;
    const isRunning = item.hasRunningTurn;
    const isPcOpen = item.openOnPc;

    const iconTint = hasApproval
      ? CORE_COLORS.amber
      : isRunning
      ? CORE_COLORS.cyan
      : isPcOpen
      ? CORE_COLORS.emerald
      : CORE_COLORS.textSecondary;

    const iconBg = hasApproval
      ? CORE_COLORS.amberSoft
      : isRunning
      ? CORE_COLORS.cyanSoft
      : isPcOpen
      ? CORE_COLORS.emeraldSoft
      : CORE_COLORS.surfaceWell;

    const iconBorder = hasApproval
      ? CORE_COLORS.amberBorder
      : isRunning
      ? CORE_COLORS.cyanBorder
      : isPcOpen
      ? CORE_COLORS.emeraldBorder
      : CORE_COLORS.borderSubtle;

    const cardBorder = hasApproval
      ? CORE_COLORS.amberBorder
      : isRunning
      ? CORE_COLORS.cyanBorder
      : undefined;

    const lastActiveStr = formatLastActive(item.lastActivity);

    const cardContent = (
      <TactilePressable
        haptic
        onPress={() => router.push(`/(tabs)/chat/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`Open workspace ${item.name}`}
      >
        <CoreCard
          variant="subtle"
          accentBorderColor={cardBorder}
          style={styles.projectCard}
        >
          <View style={styles.cardTop}>
            <View
              style={[
                styles.workspaceIconBox,
                { backgroundColor: iconBg, borderColor: iconBorder },
              ]}
            >
              <FolderGit2 size={19} color={iconTint} />
            </View>

            <View style={styles.workspaceMain}>
              <Text style={styles.projectName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.projectPath} numberOfLines={1}>
                {item.path}
              </Text>
            </View>

            <ChevronRight size={17} color={CORE_COLORS.textTertiary} />
          </View>

          {(hasApproval || isRunning || isPcOpen) && (
            <View style={styles.badgesRow}>
              {hasApproval && (
                <GlassBadge tone="orange">
                  <AlertTriangle size={11} color={CORE_COLORS.amber} /> Approval
                </GlassBadge>
              )}
              {isRunning && (
                <GlassBadge tone="blue">
                  <PlayCircle size={11} color={CORE_COLORS.cyan} /> Running
                </GlassBadge>
              )}
              {isPcOpen && (
                <GlassBadge tone="green">
                  <Monitor size={11} color={CORE_COLORS.emerald} /> PC Open
                </GlassBadge>
              )}
            </View>
          )}

          <View style={styles.cardFooter}>
            <View style={styles.threadCountPill}>
              <MessageSquare size={12} color={CORE_COLORS.textSecondary} />
              <Text style={styles.sessionCount}>
                {item.sessionCount} {item.sessionCount === 1 ? "thread" : "threads"}
              </Text>
            </View>

            {lastActiveStr ? (
              <Text style={styles.lastActivity}>{lastActiveStr}</Text>
            ) : null}
          </View>
        </CoreCard>
      </TactilePressable>
    );

    if (!hasAnimatedInitial.current && !searchQuery) {
      return <AnimatedEntrance index={index}>{cardContent}</AnimatedEntrance>;
    }
    return cardContent;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="Antigravity" subtitle="Workspaces" />

      {/* Search & Refresh Toolbar */}
      <View style={styles.toolbar}>
        <Animated.View
          style={[
            styles.searchShell,
            {
              borderColor: searchBorderColor,
              backgroundColor: searchFocused
                ? "rgba(255, 255, 255, 0.09)"
                : "rgba(255, 255, 255, 0.055)",
            },
          ]}
        >
          <Search
            size={16}
            color={searchFocused ? CORE_COLORS.cyan : CORE_COLORS.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search workspaces or paths..."
            placeholderTextColor={CORE_COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable
              hitSlop={8}
              onPress={() => setSearchQuery("")}
              accessibilityLabel="Clear search"
              style={styles.clearBtn}
            >
              <X size={14} color={CORE_COLORS.textSecondary} />
            </Pressable>
          )}
        </Animated.View>

        <TactilePressable
          haptic
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh workspaces"
        >
          <GlassSurface preset="control" elevation="base" style={styles.refreshBtn}>
            <RefreshCw size={16} color={CORE_COLORS.textPrimary} />
          </GlassSurface>
        </TactilePressable>
      </View>

      {/* Bridge Status Strip */}
      <View style={styles.statusStrip}>
        <View style={styles.statusLeft}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: socketConnected
                  ? CORE_COLORS.emeraldFill
                  : CORE_COLORS.coral,
              },
            ]}
          />
          <Text style={styles.statusText}>
            Bridge {socketConnected ? "Online" : "Offline"}
          </Text>
        </View>
        <Text style={styles.countText}>
          {filteredProjects.length}{" "}
          {filteredProjects.length === 1 ? "workspace" : "workspaces"}
        </Text>
      </View>

      {errorMsg ? (
        <View style={styles.errorWrap}>
          <GlassAlert tone="danger" title="Workspace Sync Error">
            {errorMsg}
          </GlassAlert>
        </View>
      ) : null}

      {loading && !refreshing && projects.length === 0 ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3].map((k) => (
            <CoreCard key={k} variant="subtle" style={styles.skeletonCard}>
              <GlassSkeleton variant="text" lines={2} />
            </CoreCard>
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          renderItem={renderProjectItem}
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
              <View style={styles.emptyIconWell}>
                <FolderOpen size={28} color={CORE_COLORS.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? "No Matching Workspaces" : "No Workspaces Discovered"}
              </Text>
              <Text style={styles.emptyDesc}>
                {searchQuery
                  ? "Try clearing your filter or searching another folder name."
                  : "Open a project in Antigravity on your PC or tap Refresh above."}
              </Text>
            </CoreCard>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: CORE_SPACING.screenX,
    gap: 10,
    marginBottom: 12,
  },
  searchShell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: CORE_COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  statusStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: CORE_SPACING.screenX + 2,
    marginBottom: 12,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: CORE_COLORS.textSecondary,
  },
  countText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textTertiary,
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
    gap: 12,
    paddingTop: 2,
  },
  projectCard: {
    padding: 18,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  workspaceIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  projectName: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: CORE_COLORS.textPrimary,
  },
  projectPath: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CORE_COLORS.borderSubtle,
  },
  threadCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sessionCount: {
    fontSize: 13,
    fontWeight: "500",
    color: CORE_COLORS.textSecondary,
  },
  lastActivity: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textTertiary,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    paddingHorizontal: 24,
    marginTop: 12,
    gap: 10,
  },
  emptyIconWell: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
    maxWidth: 270,
  },
});
