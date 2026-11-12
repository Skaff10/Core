import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { BrainCircuit, ChevronDown, ChevronUp } from "lucide-react-native";
import { AgentMessage } from "../../types/agent";
import { ToolCard } from "./ToolCard";

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
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <View style={styles.metaHeader}>
          <Text style={[styles.roleTag, isUser ? styles.userTag : styles.aiTag]}>
            {isUser ? "OPERATOR" : "ANTIGRAVITY AGENT"}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTs : styles.aiTs]}>
            {message.timestamp}
            {message.streaming ? " • RUNNING" : ""}
          </Text>
        </View>

        {/* Optional Thinking disclosure */}
        {message.thoughts ? (
          <View style={styles.thoughtsContainer}>
            <TouchableOpacity
              style={styles.thoughtsHeader}
              activeOpacity={0.7}
              onPress={() => setThoughtsOpen(!thoughtsOpen)}
            >
              <View style={styles.thoughtsHeaderLeft}>
                <BrainCircuit size={12} color="#A78BFA" />
                <Text style={styles.thoughtsTitle}>THINKING LOG</Text>
              </View>
              {thoughtsOpen ? (
                <ChevronUp size={12} color="#A78BFA" />
              ) : (
                <ChevronDown size={12} color="#A78BFA" />
              )}
            </TouchableOpacity>
            {thoughtsOpen && (
              <View style={styles.thoughtsBody}>
                <Text style={styles.thoughtsText}>{message.thoughts}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Tool Cards */}
        {message.tools && message.tools.length > 0 && (
          <View style={styles.toolsList}>
            {message.tools.map((t) => (
              <ToolCard key={t.tool_call_id} tool={t} />
            ))}
          </View>
        )}

        {/* Content text */}
        {Boolean(message.content) && (
          <Text style={[styles.content, isUser ? styles.userText : styles.aiText]}>
            {message.content}
            {message.streaming ? " ▋" : ""}
          </Text>
        )}

        {/* Queue indicator if user message is waiting */}
        {isUser && message.queue_position && message.queue_position > 0 ? (
          <Text style={styles.queueBadge}>
            QUEUED #{message.queue_position}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    width: "100%",
    marginBottom: 10,
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
    marginVertical: 6,
  },
  systemText: {
    color: "#94A3B8",
    fontSize: 10.5,
    fontFamily: "monospace",
    backgroundColor: "#1E2229",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 6,
  },
  userBubble: {
    backgroundColor: "#06B6D4",
    borderColor: "#22D3EE",
  },
  aiBubble: {
    backgroundColor: "#16191F",
    borderColor: "#252C38",
  },
  metaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  roleTag: {
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  userTag: {
    color: "#090D16",
  },
  aiTag: {
    color: "#06B6D4",
  },
  timestamp: {
    fontSize: 8.5,
    fontFamily: "monospace",
  },
  userTs: {
    color: "#0F172A",
  },
  aiTs: {
    color: "#64748B",
  },
  content: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  userText: {
    color: "#090D16",
    fontWeight: "700",
  },
  aiText: {
    color: "#F1F5F9",
    fontFamily: "monospace",
  },
  thoughtsContainer: {
    backgroundColor: "#1B182B",
    borderWidth: 1,
    borderColor: "#3B2D54",
    borderRadius: 3,
    overflow: "hidden",
    marginVertical: 2,
  },
  thoughtsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  thoughtsHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  thoughtsTitle: {
    color: "#A78BFA",
    fontSize: 9.5,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  thoughtsBody: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: "#3B2D54",
  },
  thoughtsText: {
    color: "#DDD6FE",
    fontSize: 10.5,
    fontFamily: "monospace",
  },
  toolsList: {
    gap: 2,
    marginVertical: 2,
  },
  queueBadge: {
    color: "#0F172A",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "900",
    alignSelf: "flex-end",
  },
});

