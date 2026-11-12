import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ShieldAlert, Check, X } from "lucide-react-native";
import { PermissionRequestPayload } from "../../types/agent";

interface Props {
  permission: PermissionRequestPayload;
  onRespond: (optionId?: string) => void;
}

export const PermissionCard: React.FC<Props> = ({ permission, onRespond }) => {
  const toolCall = permission.tool_call || {};
  const toolName = toolCall.name || "Tool Request";
  const toolTitle = toolCall.title || toolName;
  const args = toolCall.args;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ShieldAlert size={16} color="#F59E0B" />
        <Text style={styles.headerText}>PERMISSION REQUIRED ON PC</Text>
      </View>

      <Text style={styles.title}>{toolTitle}</Text>

      {args && (
        <View style={styles.argsBox}>
          <Text style={styles.argsText}>
            {typeof args === "string" ? args : JSON.stringify(args, null, 2)}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.btn, styles.denyBtn]}
          activeOpacity={0.8}
          onPress={() => onRespond("deny")}
        >
          <X size={14} color="#EF4444" />
          <Text style={styles.denyText}>Deny</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.allowBtn]}
          activeOpacity={0.8}
          onPress={() => onRespond("allow")}
        >
          <Check size={14} color="#090D16" />
          <Text style={styles.allowText}>Allow & Run</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1C1917",
    borderWidth: 1.5,
    borderColor: "#F59E0B",
    borderRadius: 6,
    padding: 12,
    marginVertical: 8,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerText: {
    color: "#F59E0B",
    fontSize: 10.5,
    fontFamily: "monospace",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },
  argsBox: {
    backgroundColor: "#0C0A09",
    borderWidth: 1,
    borderColor: "#292524",
    borderRadius: 4,
    padding: 8,
  },
  argsText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontFamily: "monospace",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 4,
    gap: 6,
  },
  denyBtn: {
    backgroundColor: "#292524",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  denyText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: "monospace",
  },
  allowBtn: {
    backgroundColor: "#10B981",
  },
  allowText: {
    color: "#090D16",
    fontWeight: "900",
    fontSize: 12,
    fontFamily: "monospace",
  },
});

