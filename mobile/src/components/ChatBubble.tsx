import React from "react";
import { View, Text, StyleSheet } from "react-native";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  agent: string;
  content: string;
  timestamp: string;
  streaming?: boolean;
}

export const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <View style={styles.metaHeader}>
          <Text style={[styles.roleTag, isUser ? styles.userTag : styles.aiTag]}>
            {isUser ? "OPERATOR // PROMPT" : `NODE // ${message.agent.toUpperCase()}`}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTs : styles.aiTs]}>
            {message.timestamp}
            {message.streaming ? " • STREAMING" : ""}
          </Text>
        </View>

        <Text style={[styles.content, isUser ? styles.userText : styles.aiText]}>
          {message.content || (message.streaming ? "▋" : "")}
        </Text>
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
  bubble: {
    maxWidth: "88%",
    borderRadius: 2,
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
    backgroundColor: "#1E1E1E",
    borderColor: "#2A2A2A",
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
    fontSize: 9,
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
    color: "#E2E8F0",
    fontFamily: "monospace",
  },
});

