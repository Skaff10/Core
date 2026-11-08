import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Monitor, Cpu, HardDrive } from "lucide-react-native";
import { useConnectionStore } from "../store/useConnectionStore";

export const ForegroundCard: React.FC = () => {
  const { telemetry, isConnected } = useConnectionStore();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Monitor size={14} color="#06B6D4" />
          <Text style={styles.cardHeaderLabel}>ACTIVE FOREGROUND WINDOW</Text>
        </View>
        <Text style={styles.streamBadge}>
          {isConnected ? "WS // 2.0s POLL" : "STREAM IDLE"}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.windowTitle} numberOfLines={2}>
          {telemetry?.window_title || "Awaiting PC telemetry stream..."}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaTag}>
            <Text style={styles.metaKey}>PROC</Text>
            <Text style={styles.metaVal}>
              {telemetry?.process_name || "---"}
            </Text>
          </View>
          <View style={styles.metaTag}>
            <Text style={styles.metaKey}>PID</Text>
            <Text style={styles.metaVal}>
              {telemetry?.pid ? String(telemetry.pid) : "---"}
            </Text>
          </View>
          <View style={styles.metaTag}>
            <Text style={styles.metaKey}>SYNC</Text>
            <Text style={styles.metaVal}>
              {telemetry?.timestamp || "--:--:--"}
            </Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <View style={styles.metricTop}>
              <View style={styles.metricLabelRow}>
                <Cpu size={12} color="#94A3B8" />
                <Text style={styles.metricLabel}>CPU LOAD</Text>
              </View>
              <Text style={styles.metricValue}>
                {telemetry ? `${telemetry.cpu_percent}%` : "--%"}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(telemetry?.cpu_percent || 0, 100)}%`,
                    backgroundColor: "#06B6D4",
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.metricBox}>
            <View style={styles.metricTop}>
              <View style={styles.metricLabelRow}>
                <HardDrive size={12} color="#94A3B8" />
                <Text style={styles.metricLabel}>MEMORY</Text>
              </View>
              <Text style={styles.metricValue}>
                {telemetry
                  ? `${telemetry.ram_used_gb}/${telemetry.ram_total_gb} GB`
                  : "-- GB"}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(telemetry?.ram_percent || 0, 100)}%`,
                    backgroundColor: "#E2E8F0",
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 2,
    marginBottom: 16,
  },
  cardHeader: {
    backgroundColor: "#181818",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHeaderLabel: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  streamBadge: {
    color: "#06B6D4",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  cardBody: {
    padding: 14,
    gap: 12,
  },
  windowTitle: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaTag: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaKey: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "monospace",
  },
  metaVal: {
    color: "#06B6D4",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 10,
    borderRadius: 2,
    gap: 8,
  },
  metricTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  metricValue: {
    color: "#E2E8F0",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  barTrack: {
    height: 4,
    backgroundColor: "#262626",
    borderRadius: 1,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
  },
});

