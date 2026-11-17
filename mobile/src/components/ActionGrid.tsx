import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import {
  Terminal,
  Activity,
  Folder,
  Lock,
  Cpu,
  Power,
  RefreshCw,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react-native";
import { QuickAction, useConnectionStore } from "../store/useConnectionStore";
import { CoreApiClient } from "../services/api";
import { GlassButton } from "./glassyui/glass-button";
import { GlassAlert } from "./glassyui/glass-alert";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "./glassyui/glass-dialog";
import { CoreCard } from "./ui/CoreCard";
import { TactilePressable } from "./ui/TactilePressable";
import { CORE_COLORS, CORE_RADIUS } from "../theme/tokens";
import { CORE_TYPOGRAPHY } from "../theme/typography";

interface ActionGridProps {
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}

export const ActionGrid: React.FC<ActionGridProps> = ({ onRefresh, refreshing }) => {
  const { pcIp, pcPort, authToken, quickActions } = useConnectionStore();
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    tone: "info" | "success" | "danger";
    text: string;
  } | null>(null);
  const [shutdownModalVisible, setShutdownModalVisible] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);

  const renderIcon = (iconName: string) => {
    const key = iconName.toLowerCase();
    if (key.includes("activity") || key.includes("task")) {
      return <Activity size={18} color={CORE_COLORS.cyan} />;
    }
    if (key.includes("folder") || key.includes("file")) {
      return <Folder size={18} color={CORE_COLORS.teal} />;
    }
    if (key.includes("lock")) {
      return <Lock size={18} color={CORE_COLORS.amber} />;
    }
    if (key.includes("cpu")) {
      return <Cpu size={18} color={CORE_COLORS.sky} />;
    }
    return <Terminal size={18} color={CORE_COLORS.cyan} />;
  };

  const handleTriggerAction = async (action: QuickAction) => {
    setExecutingId(action.id);
    setFeedbackBanner(null);
    try {
      await CoreApiClient.executeQuickAction(pcIp, pcPort, authToken, action.id);
      setFeedbackBanner({
        tone: "success",
        text: `Dispatched ${action.name}`,
      });
    } catch (err: any) {
      setFeedbackBanner({
        tone: "danger",
        text: err?.message || "Action execution failed",
      });
    } finally {
      setExecutingId(null);
    }
  };

  const handleConfirmShutdown = async () => {
    setShuttingDown(true);
    try {
      await CoreApiClient.shutdownPc(pcIp, pcPort, authToken);
      setShutdownModalVisible(false);
      setFeedbackBanner({
        tone: "info",
        text: "Shutdown signal transmitted to PC",
      });
    } catch (err: any) {
      setShutdownModalVisible(false);
      setFeedbackBanner({
        tone: "danger",
        text: err?.message || "Shutdown failed",
      });
    } finally {
      setShuttingDown(false);
    }
  };

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.sectionSubtitle}>
            {quickActions.length} host {quickActions.length === 1 ? "command" : "commands"} mapped
          </Text>
        </View>

        <GlassButton
          size="sm"
          variant="primary"
          disabled={refreshing}
          onPress={onRefresh}
          accessibilityLabel="Reload quick actions"
        >
          <RefreshCw size={13} color={CORE_COLORS.textPrimary} />
          {refreshing ? "Syncing" : "Reload"}
        </GlassButton>
      </View>

      {feedbackBanner && (
        <GlassAlert
          key={feedbackBanner.text}
          tone={feedbackBanner.tone}
          onDismiss={() => setFeedbackBanner(null)}
        >
          {feedbackBanner.text}
        </GlassAlert>
      )}

      {/* 2-Column Interactive Glass Action Grid */}
      <View style={styles.grid}>
        {quickActions.map((action) => {
          const isBusy = executingId === action.id;
          return (
            <View key={action.id} style={styles.gridItem}>
              <TactilePressable
                haptic
                disabled={isBusy}
                onPress={() => handleTriggerAction(action)}
                accessibilityRole="button"
                accessibilityLabel={`Run ${action.name}`}
              >
                <CoreCard variant="subtle" style={styles.actionCard}>
                  <View style={styles.actionTopRow}>
                    <View style={styles.iconBox}>{renderIcon(action.icon)}</View>
                    {isBusy ? (
                      <ActivityIndicator size="small" color={CORE_COLORS.cyan} />
                    ) : (
                      <ArrowUpRight size={15} color={CORE_COLORS.textTertiary} />
                    )}
                  </View>
                  <View style={styles.actionTextCol}>
                    <Text style={styles.actionName} numberOfLines={1}>
                      {action.name}
                    </Text>
                    <Text style={styles.actionCmd} numberOfLines={1}>
                      {action.command}
                    </Text>
                  </View>
                </CoreCard>
              </TactilePressable>
            </View>
          );
        })}
      </View>

      {/* Visually Separated Destructive Power Override */}
      <CoreCard
        variant="subtle"
        accentFillColor="rgba(225, 29, 72, 0.08)"
        accentBorderColor="rgba(251, 113, 133, 0.28)"
        style={styles.dangerCard}
      >
        <View style={styles.dangerInfo}>
          <View style={styles.dangerHeader}>
            <Power size={14} color={CORE_COLORS.coral} />
            <Text style={styles.dangerTitle}>System Power Override</Text>
          </View>
          <Text style={styles.dangerCmd}>shutdown /s /t 1</Text>
        </View>

        <TactilePressable
          haptic
          onPress={() => setShutdownModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Shut down PC"
          style={styles.shutdownButton}
        >
          <Power size={14} color="#FFE4E6" />
          <Text style={styles.shutdownButtonText}>Shut Down</Text>
        </TactilePressable>
      </CoreCard>

      {/* Glass Confirmation Dialog */}
      <GlassDialog
        open={shutdownModalVisible}
        onOpenChange={setShutdownModalVisible}
      >
        <GlassDialogContent closeLabel="Cancel shutdown">
          <View style={styles.dialogHeaderRow}>
            <View style={styles.dialogDangerBadge}>
              <AlertTriangle size={20} color={CORE_COLORS.coral} />
            </View>
            <GlassDialogTitle>Shut Down Host PC?</GlassDialogTitle>
          </View>

          <GlassDialogDescription>
            This will immediately execute{" "}
            <Text style={styles.monoInline}>shutdown /s /t 1</Text> on your Windows
            machine and terminate all active sessions.
          </GlassDialogDescription>

          <View style={styles.dialogActions}>
            <GlassButton
              variant="soft"
              style={styles.dialogBtn}
              onPress={() => setShutdownModalVisible(false)}
              disabled={shuttingDown}
            >
              Cancel
            </GlassButton>
            <GlassButton
              variant="prominent"
              style={[styles.dialogBtn, styles.dialogConfirmBtn]}
              onPress={handleConfirmShutdown}
              disabled={shuttingDown}
            >
              {shuttingDown ? "Sending..." : "Shut Down PC"}
            </GlassButton>
          </View>
        </GlassDialogContent>
      </GlassDialog>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  sectionTitle: {
    ...CORE_TYPOGRAPHY.sectionTitle,
    color: CORE_COLORS.textPrimary,
  },
  sectionSubtitle: {
    ...CORE_TYPOGRAPHY.caption,
    color: CORE_COLORS.textSecondary,
    marginTop: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  gridItem: {
    width: "48.3%",
  },
  actionCard: {
    padding: 16,
    minHeight: 112,
    justifyContent: "space-between",
    gap: 12,
  },
  actionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextCol: {
    gap: 3,
  },
  actionName: {
    ...CORE_TYPOGRAPHY.cardTitle,
    color: CORE_COLORS.textPrimary,
  },
  actionCmd: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  dangerCard: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
  },
  dangerInfo: {
    flex: 1,
    gap: 4,
  },
  dangerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: CORE_COLORS.coral,
  },
  dangerCmd: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
  },
  shutdownButton: {
    backgroundColor: "rgba(225, 29, 72, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.55)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 44,
  },
  shutdownButtonText: {
    color: "#FFE4E6",
    fontSize: 13,
    fontWeight: "600",
  },
  dialogHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  dialogDangerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: CORE_COLORS.coralSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.coralBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  monoInline: {
    ...CORE_TYPOGRAPHY.mono,
    color: CORE_COLORS.cyan,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },
  dialogBtn: {
    flex: 1,
  },
  dialogConfirmBtn: {
    backgroundColor: "#BE123C",
    borderRadius: 999,
  },
});
