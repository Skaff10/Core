import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from "react-native";
import {
  Terminal,
  Activity,
  Folder,
  Lock,
  Cpu,
  Power,
  RefreshCw,
  Play,
  AlertTriangle,
} from "lucide-react-native";
import { QuickAction, useConnectionStore } from "../store/useConnectionStore";
import { CoreApiClient } from "../services/api";

interface ActionGridProps {
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}

export const ActionGrid: React.FC<ActionGridProps> = ({ onRefresh, refreshing }) => {
  const { pcIp, pcPort, authToken, quickActions } = useConnectionStore();
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [shutdownModalVisible, setShutdownModalVisible] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);

  const renderIcon = (iconName: string) => {
    const key = iconName.toLowerCase();
    if (key.includes("activity") || key.includes("task")) {
      return <Activity size={16} color="#06B6D4" />;
    }
    if (key.includes("folder") || key.includes("file")) {
      return <Folder size={16} color="#06B6D4" />;
    }
    if (key.includes("lock")) {
      return <Lock size={16} color="#06B6D4" />;
    }
    if (key.includes("cpu")) {
      return <Cpu size={16} color="#06B6D4" />;
    }
    return <Terminal size={16} color="#06B6D4" />;
  };

  const handleTriggerAction = async (action: QuickAction) => {
    setExecutingId(action.id);
    setFeedbackBanner(null);
    try {
      await CoreApiClient.executeQuickAction(pcIp, pcPort, authToken, action.id);
      setFeedbackBanner(`DISPATCHED // ${action.name.toUpperCase()}`);
    } catch (err: any) {
      setFeedbackBanner(`ERR // ${err?.message || "Execution failed"}`);
    } finally {
      setExecutingId(null);
    }
  };

  const handleConfirmShutdown = async () => {
    setShuttingDown(true);
    try {
      await CoreApiClient.shutdownPc(pcIp, pcPort, authToken);
      setShutdownModalVisible(false);
      setFeedbackBanner("CRITICAL // SHUTDOWN SIGNAL SENT TO PC");
    } catch (err: any) {
      setFeedbackBanner(`ERR // ${err?.message || "Shutdown failed"}`);
    } finally {
      setShuttingDown(false);
    }
  };

  return (
    <View style={styles.section}>
      {/* SECTION HEADER */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>DYNAMIC QUICK ACTIONS</Text>
          <Text style={styles.sectionSubtitle}>
            MAPPED FROM PC CONFIG.JSON ({quickActions.length} SLOTS)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={13} color="#E2E8F0" />
          <Text style={styles.syncButtonText}>
            {refreshing ? "SYNCING" : "RELOAD"}
          </Text>
        </TouchableOpacity>
      </View>

      {feedbackBanner && (
        <View style={styles.feedbackBox}>
          <Text style={styles.feedbackText}>{feedbackBanner}</Text>
        </View>
      )}

      {/* 2-COLUMN RIGID TACTICAL GRID */}
      <View style={styles.grid}>
        {quickActions.map((action) => {
          const isBusy = executingId === action.id;
          return (
            <TouchableOpacity
              key={action.id}
              style={styles.actionCard}
              activeOpacity={0.75}
              onPress={() => handleTriggerAction(action)}
              disabled={isBusy}
            >
              <View style={styles.actionTopRow}>
                <View style={styles.iconBox}>{renderIcon(action.icon)}</View>
                {isBusy ? (
                  <ActivityIndicator size="small" color="#06B6D4" />
                ) : (
                  <Play size={12} color="#64748B" />
                )}
              </View>
              <Text style={styles.actionName} numberOfLines={1}>
                {action.name}
              </Text>
              <Text style={styles.actionCmd} numberOfLines={1}>
                {action.command}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* HARDCODED SECURE SHUTDOWN PANEL */}
      <View style={styles.dangerZone}>
        <View style={styles.dangerInfo}>
          <Text style={styles.dangerTitle}>SYSTEM POWER OVERRIDE</Text>
          <Text style={styles.dangerCmd}>os.system(&quot;shutdown /s /t 1&quot;)</Text>
        </View>
        <TouchableOpacity
          style={styles.shutdownButton}
          activeOpacity={0.8}
          onPress={() => setShutdownModalVisible(true)}
        >
          <Power size={15} color="#EF4444" />
          <Text style={styles.shutdownButtonText}>SHUTDOWN PC</Text>
        </TouchableOpacity>
      </View>

      {/* CONFIRMATION MODAL */}
      <Modal
        visible={shutdownModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShutdownModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <AlertTriangle size={16} color="#EF4444" />
              <Text style={styles.modalTitle}>CONFIRM PC SHUTDOWN</Text>
            </View>
            <Text style={styles.modalBody}>
              This will immediately execute{" "}
              <Text style={styles.monoInline}>shutdown /s /t 1</Text> on the host
              Windows machine and terminate all active sessions.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShutdownModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>ABORT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmShutdownBtn}
                onPress={handleConfirmShutdown}
                disabled={shuttingDown}
              >
                <Text style={styles.confirmShutdownText}>
                  {shuttingDown ? "TRANSMITTING..." : "EXECUTE SHUTDOWN"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  sectionSubtitle: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#3A3A3A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncButtonText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  feedbackBox: {
    backgroundColor: "#161616",
    borderLeftWidth: 3,
    borderLeftColor: "#06B6D4",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackText: {
    color: "#06B6D4",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  actionCard: {
    width: "48.6%",
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    padding: 12,
    gap: 8,
  },
  actionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBox: {
    width: 30,
    height: 30,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actionName: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
  },
  actionCmd: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
  },
  dangerZone: {
    marginTop: 8,
    backgroundColor: "#1A1212",
    borderWidth: 1,
    borderColor: "#451A1A",
    borderRadius: 2,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dangerInfo: {
    gap: 3,
  },
  dangerTitle: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  dangerCmd: {
    color: "#94A3B8",
    fontSize: 10,
    fontFamily: "monospace",
  },
  shutdownButton: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  shutdownButtonText: {
    color: "#EF4444",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.82)",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 2,
    padding: 18,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  modalBody: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
  },
  monoInline: {
    fontFamily: "monospace",
    color: "#06B6D4",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "#3A3A3A",
    backgroundColor: "#121212",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 2,
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  confirmShutdownBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 2,
  },
  confirmShutdownText: {
    color: "#090D16",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "900",
  },
});

