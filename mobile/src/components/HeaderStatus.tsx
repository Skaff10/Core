import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useConnectionStore } from "../store/useConnectionStore";

export const HeaderStatus: React.FC<{ title?: string }> = ({ title = "COMMAND DECK" }) => {
  const { pcIp, pcPort, isConnected } = useConnectionStore();

  return (
    <View style={styles.headerContainer}>
      <View style={styles.leftGroup}>
        <View style={styles.brandBadge}>
          <Text style={styles.brandBadgeText}>CORE</Text>
        </View>
        <View>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>
            NODE // {pcIp}:{pcPort}
          </Text>
        </View>
      </View>

      <View style={styles.statusPill}>
        <View
          style={[
            styles.statusDot,
            isConnected ? styles.dotOnline : styles.dotOffline,
          ]}
        />
        <Text
          style={[
            styles.statusLabel,
            { color: isConnected ? "#10B981" : "#EF4444" },
          ]}
        >
          {isConnected ? "LINKED" : "OFFLINE"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#1E1E1E",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandBadge: {
    backgroundColor: "#06B6D4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  brandBadgeText: {
    color: "#090D16",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.2,
    fontFamily: "monospace",
  },
  headerTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: "#64748B",
    fontSize: 10,
    fontFamily: "monospace",
    marginTop: 1,
  },
  statusPill: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  dotOffline: {
    backgroundColor: "#EF4444",
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "monospace",
    letterSpacing: 0.8,
  },
});

