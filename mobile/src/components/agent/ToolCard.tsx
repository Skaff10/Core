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

export const ToolCard: React.FC<{ tool: ToolCallItem }> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const getToolIcon = () => {
    const name = tool.name.toLowerCase();
    if (name.includes("command") || name.includes("terminal")) {
      return <Terminal size={13} color="#06B6D4" />;
    }
    if (name.includes("file") || name.includes("edit") || name.includes("write")) {
      return <FileCode size={13} color="#10B981" />;
    }
    return <FolderOpen size={13} color="#F59E0B" />;
  };

  const getStatusIcon = () => {
    switch (tool.status) {
      case "completed":
        return <CheckCircle2 size={13} color="#10B981" />;
      case "failed":
        return <AlertCircle size={13} color="#EF4444" />;
      case "in_progress":
      case "pending":
      default:
        return <Clock size={13} color="#06B6D4" />;
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.7}
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
            <ChevronUp size={14} color="#64748B" />
          ) : (
            <ChevronDown size={14} color="#64748B" />
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
    backgroundColor: "#16181D",
    borderWidth: 1,
    borderColor: "#2D3748",
    borderRadius: 4,
    marginVertical: 4,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#1A202C",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: "#E2E8F0",
    fontSize: 11.5,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  body: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: "#2D3748",
    backgroundColor: "#0F1115",
    gap: 6,
  },
  section: {
    gap: 3,
  },
  sectionTitle: {
    color: "#64748B",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  codeText: {
    color: "#CBD5E1",
    fontSize: 10.5,
    fontFamily: "monospace",
    backgroundColor: "#16181D",
    padding: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#262C36",
  },
});

