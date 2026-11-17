import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import {
  Terminal,
  FileCode,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { ToolCallItem } from "../../types/agent";
import { CORE_COLORS, CORE_RADIUS } from "../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../theme/typography";

export const ToolCard: React.FC<{ tool: ToolCallItem }> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const getToolIcon = () => {
    const name = tool.name.toLowerCase();
    if (name.includes("command") || name.includes("terminal")) {
      return <Terminal size={13} color={CORE_COLORS.cyan} />;
    }
    if (name.includes("file") || name.includes("edit") || name.includes("write")) {
      return <FileCode size={13} color={CORE_COLORS.emerald} />;
    }
    return <FolderOpen size={13} color={CORE_COLORS.amber} />;
  };

  const getStatusIcon = () => {
    switch (tool.status) {
      case "completed":
        return <CheckCircle2 size={14} color={CORE_COLORS.emerald} />;
      case "failed":
        return <AlertCircle size={14} color={CORE_COLORS.coral} />;
      case "in_progress":
      case "pending":
      default:
        return <Clock size={14} color={CORE_COLORS.cyan} />;
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.75}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.headerLeft}>
          {getToolIcon()}
          <Text style={styles.title} numberOfLines={1}>
            {tool.title || tool.name}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {getStatusIcon()}
          {expanded ? (
            <ChevronUp size={14} color={CORE_COLORS.textSecondary} />
          ) : (
            <ChevronDown size={14} color={CORE_COLORS.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {tool.args && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ARGUMENTS</Text>
              <Text style={styles.codeText}>
                {typeof tool.args === "string"
                  ? tool.args
                  : JSON.stringify(tool.args, null, 2)}
              </Text>
            </View>
          )}

          {tool.preview ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>OUTPUT</Text>
              <Text style={styles.codeText}>{tool.preview}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
    marginVertical: 3,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textPrimary,
    fontWeight: "600",
    flexShrink: 1,
  },
  body: {
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CORE_COLORS.borderSubtle,
    backgroundColor: "rgba(4, 7, 13, 0.55)",
    gap: 8,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    ...CORE_TYPOGRAPHY.eyebrow,
    fontSize: 9.5,
    color: CORE_COLORS.textTertiary,
  },
  codeText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
  },
});
