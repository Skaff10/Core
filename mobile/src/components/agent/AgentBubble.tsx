import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { BrainCircuit, ChevronDown, ChevronUp } from "lucide-react-native";
import { AgentMessage } from "../../types/agent";
import { ToolCard } from "./ToolCard";
import { CORE_COLORS, CORE_RADIUS } from "../../theme/tokens";
import { CORE_TYPOGRAPHY } from "../../theme/typography";

export const AgentBubble: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <View style={styles.metaHeader}>
          <Text style={[styles.roleTag, isUser ? styles.userTag : styles.aiTag]}>
            {isUser ? "You" : "Antigravity"}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTs : styles.aiTs]}>
            {message.timestamp}
            {message.streaming ? " · Running" : ""}
          </Text>
        </View>

        {message.thoughts ? (
          <View style={styles.thoughtsContainer}>
            <TouchableOpacity
              style={styles.thoughtsHeader}
              activeOpacity={0.75}
              onPress={() => setThoughtsOpen(!thoughtsOpen)}
            >
              <View style={styles.thoughtsHeaderLeft}>
                <BrainCircuit size={13} color={CORE_COLORS.violet} />
                <Text style={styles.thoughtsTitle}>Thinking Log</Text>
              </View>
              {thoughtsOpen ? (
                <ChevronUp size={13} color={CORE_COLORS.violet} />
              ) : (
                <ChevronDown size={13} color={CORE_COLORS.violet} />
              )}
            </TouchableOpacity>
            {thoughtsOpen && (
              <View style={styles.thoughtsBody}>
                <Text style={styles.thoughtsText}>{message.thoughts}</Text>
              </View>
            )}
          </View>
        ) : null}

        {message.tools && message.tools.length > 0 && (
          <View style={styles.toolsList}>
            {message.tools.map((t) => (
              <ToolCard key={t.tool_call_id} tool={t} />
            ))}
          </View>
        )}

        {Boolean(message.content) && (
          <Text style={[styles.content, isUser ? styles.userText : styles.aiText]}>
            {message.content}
            {message.streaming ? " ▋" : ""}
          </Text>
        )}

        {isUser && message.queue_position && message.queue_position > 0 ? (
          <Text style={styles.queueBadge}>Queued #{message.queue_position}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: "100%",
    marginBottom: 12,
    flexDirection: "row",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  systemRow: {
    width: "100%",
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
    backgroundColor: CORE_COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: CORE_RADIUS.pill,
    overflow: "hidden",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: CORE_RADIUS.lg,
    borderCurve: "continuous",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 8,
  },
  userBubble: {
    backgroundColor: CORE_COLORS.blueFill,
    borderColor: "rgba(56, 189, 248, 0.45)",
  },
  aiBubble: {
    backgroundColor: CORE_COLORS.surfaceCard,
    borderColor: CORE_COLORS.borderDefault,
  },
  metaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  roleTag: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  userTag: {
    color: "rgba(255, 255, 255, 0.88)",
  },
  aiTag: {
    color: CORE_COLORS.cyan,
  },
  timestamp: {
    ...CORE_TYPOGRAPHY.monoSmall,
    fontSize: 10,
  },
  userTs: {
    color: "rgba(255, 255, 255, 0.72)",
  },
  aiTs: {
    color: CORE_COLORS.textTertiary,
  },
  content: {
    fontSize: 14.5,
    lineHeight: 21,
  },
  userText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  aiText: {
    color: CORE_COLORS.textPrimary,
  },
  thoughtsContainer: {
    backgroundColor: CORE_COLORS.violetSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.violetBorder,
    borderRadius: CORE_RADIUS.md,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  thoughtsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  thoughtsHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  thoughtsTitle: {
    color: CORE_COLORS.violet,
    fontSize: 11.5,
    fontWeight: "600",
  },
  thoughtsBody: {
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CORE_COLORS.violetBorder,
  },
  thoughtsText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: "#E9D5FF",
  },
  toolsList: {
    gap: 2,
  },
  queueBadge: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: "#FFFFFF",
    fontWeight: "700",
    alignSelf: "flex-end",
  },
});
