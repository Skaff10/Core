import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  FolderGit2,
  Monitor,
  Search,
  Sparkles,
  AlertTriangle,
  PlayCircle,
  RefreshCw,
  FolderOpen,
} from "lucide-react-native";
import { HeaderStatus } from "../../../components/HeaderStatus";
import { useConnectionStore } from "../../../store/useConnectionStore";
import { useAgentStore } from "../../../store/agentStore";
import { fetchAgentProjects } from "../../../services/agentApi";
import { agentSocket } from "../../../services/agentSocket";
import { AgentProject } from "../../../types/agent";

export default function ProjectsListScreen() {
  const router = useRouter();
  const { pcIp, pcPort, authToken, isConnected } = useConnectionStore();
  const { projects, setProjects, socketConnected } = useAgentStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize persistent agent socket on mount
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
      setErrorMsg(err?.message || "Failed loading projects");
    }
  }, [pcIp, pcPort, authToken, setProjects]);

  useEffect(() => {
    setLoading(true);
    loadProjects().finally(() => setLoading(false));
  }, [loadProjects]);

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

  const renderProjectItem = ({ item }: { item: AgentProject }) => {
    const hasApproval = item.hasPendingPermission;
    const isRunning = item.hasRunningTurn;

    return (
      <TouchableOpacity
        style={[
          styles.projectCard,
          hasApproval && styles.cardApproval,
          isRunning && styles.cardRunning,
        ]}
        activeOpacity={0.8}
        onPress={() => router.push(`/(tabs)/chat/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <FolderGit2
              size={18}
              color={hasApproval ? "#F59E0B" : isRunning ? "#06B6D4" : "#10B981"}
            />
            <Text style={styles.projectName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          {/* Badges */}
          <View style={styles.badgesRow}>
            {hasApproval && (
              <View style={[styles.badge, styles.badgeApproval]}>
                <AlertTriangle size={10} color="#F59E0B" />
                <Text style={styles.badgeApprovalText}>APPROVAL</Text>
              </View>
            )}

            {isRunning && (
              <View style={[styles.badge, styles.badgeRunning]}>
                <PlayCircle size={10} color="#06B6D4" />
                <Text style={styles.badgeRunningText}>RUNNING</Text>
              </View>
            )}

            {item.openOnPc && (
              <View style={[styles.badge, styles.badgePc]}>
                <Monitor size={10} color="#10B981" />
                <Text style={styles.badgePcText}>PC OPEN</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.projectPath} numberOfLines={1}>
          {item.path}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.sessionCount}>
            {item.sessionCount} {item.sessionCount === 1 ? "thread" : "threads"}
          </Text>
          {item.lastActivity ? (
            <Text style={styles.lastActivity}>
              Active: {new Date(item.lastActivity).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <HeaderStatus title="ANTIGRAVITY // WORKSPACES" />

      {/* Subheader Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Search size={14} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects by name or path..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          activeOpacity={0.8}
        >
          <RefreshCw size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* Status banner */}
      <View style={styles.statusStrip}>
        <View style={styles.statusLeft}>
          <View
            style={[
              styles.dot,
              { backgroundColor: socketConnected ? "#10B981" : "#EF4444" },
            ]}
          />
          <Text style={styles.statusText}>
            BRIDGE {socketConnected ? "ONLINE" : "OFFLINE"} // {projects.length} WORKSPACES DISCOVERED
          </Text>
        </View>
      </View>

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>ERR: {errorMsg}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#06B6D4" />
          <Text style={styles.loadingText}>Syncing Antigravity Workspaces...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          renderItem={renderProjectItem}
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
              <FolderOpen size={36} color="#334155" />
              <Text style={styles.emptyTitle}>No Antigravity Projects Found</Text>
              <Text style={styles.emptyDesc}>
                Start a session in Antigravity on your PC or tap Refresh above.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 3,
    paddingHorizontal: 10,
    height: 36,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 12,
    fontFamily: "monospace",
  },
  refreshBtn: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 10,
    borderRadius: 3,
  },
  statusStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#141414",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: "#64748B",
    fontSize: 9.5,
    fontFamily: "monospace",
    fontWeight: "700",
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
  listContent: {
    padding: 14,
    paddingBottom: 24,
    gap: 10,
  },
  projectCard: {
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  cardApproval: {
    borderColor: "#F59E0B",
    backgroundColor: "#1C1813",
  },
  cardRunning: {
    borderColor: "#06B6D4",
    backgroundColor: "#12181C",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  projectName: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "800",
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
    paddingVertical: 3,
    borderRadius: 2,
  },
  badgeApproval: {
    backgroundColor: "#3B2506",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  badgeApprovalText: {
    color: "#F59E0B",
    fontSize: 8.5,
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
    fontSize: 8.5,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  badgePc: {
    backgroundColor: "#064E3B",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  badgePcText: {
    color: "#10B981",
    fontSize: 8.5,
    fontFamily: "monospace",
    fontWeight: "900",
  },
  projectPath: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#222222",
  },
  sessionCount: {
    color: "#94A3B8",
    fontSize: 10.5,
    fontFamily: "monospace",
  },
  lastActivity: {
    color: "#64748B",
    fontSize: 10,
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
});

