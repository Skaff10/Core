import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Monitor, Cpu, MemoryStick } from "lucide-react-native";
import { useConnectionStore } from "../store/useConnectionStore";
import { CoreCard } from "./ui/CoreCard";
import { AnimatedBar } from "./ui/MotionPrimitives";
import { GlassBadge } from "./glassyui/glass-badge";
import { CORE_COLORS, CORE_RADIUS } from "../theme/tokens";
import { CORE_TYPOGRAPHY } from "../theme/typography";

function getLoadColor(percent: number, defaultColor: string): string {
  if (percent >= 90) return CORE_COLORS.coral;
  if (percent >= 75) return CORE_COLORS.amber;
  return defaultColor;
}

export const ForegroundCard: React.FC = () => {
  const { telemetry, isConnected } = useConnectionStore();

  const cpuPct = telemetry?.cpu_percent ?? 0;
  const ramPct = telemetry?.ram_percent ?? 0;
  const cpuColor = getLoadColor(cpuPct, CORE_COLORS.cyan);
  const ramColor = getLoadColor(ramPct, CORE_COLORS.teal);

  return (
    <CoreCard variant="panel" elevation="raised">
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconWell}>
            <Monitor size={15} color={CORE_COLORS.cyan} />
          </View>
          <View>
            <Text style={styles.eyebrow}>Active Window</Text>
          </View>
        </View>

        <GlassBadge dot tone={isConnected ? "blue" : "neutral"}>
          {isConnected ? "Live · 2s" : "Idle"}
        </GlassBadge>
      </View>

      {/* Hero Window Title */}
      <Text style={styles.windowTitle} numberOfLines={2}>
        {telemetry?.window_title || "Awaiting PC telemetry stream..."}
      </Text>

      {/* Process / PID / Sync Metadata Pills */}
      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaKey}>PROC</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {telemetry?.process_name || "---"}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaKey}>PID</Text>
          <Text style={styles.metaValue}>
            {telemetry?.pid ? String(telemetry.pid) : "---"}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaKey}>SYNC</Text>
          <Text style={styles.metaValue}>
            {telemetry?.timestamp || "--:--:--"}
          </Text>
        </View>
      </View>

      {/* CPU & Memory Metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metricWell}>
          <View style={styles.metricTop}>
            <View style={styles.metricLabelGroup}>
              <Cpu size={13} color={CORE_COLORS.textSecondary} />
              <Text style={styles.metricLabel}>CPU</Text>
            </View>
            <Text style={[styles.metricHero, { color: cpuColor }]}>
              {telemetry ? `${cpuPct.toFixed(0)}%` : "--%"}
            </Text>
          </View>
          <AnimatedBar percent={cpuPct} color={cpuColor} height={6} />
          <Text style={styles.metricSub}>Processor load</Text>
        </View>

        <View style={styles.metricWell}>
          <View style={styles.metricTop}>
            <View style={styles.metricLabelGroup}>
              <MemoryStick size={13} color={CORE_COLORS.textSecondary} />
              <Text style={styles.metricLabel}>Memory</Text>
            </View>
            <Text style={[styles.metricHero, { color: ramColor }]}>
              {telemetry ? `${ramPct.toFixed(0)}%` : "--%"}
            </Text>
          </View>
          <AnimatedBar percent={ramPct} color={ramColor} height={6} />
          <Text style={styles.metricSub} numberOfLines={1}>
            {telemetry
              ? `${telemetry.ram_used_gb} / ${telemetry.ram_total_gb} GB`
              : "-- / -- GB"}
          </Text>
        </View>
      </View>
    </CoreCard>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWell: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: CORE_COLORS.cyanSoft,
    borderWidth: 1,
    borderColor: CORE_COLORS.cyanBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    ...CORE_TYPOGRAPHY.eyebrow,
    color: CORE_COLORS.textSecondary,
  },
  windowTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: -0.3,
    color: CORE_COLORS.textPrimary,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: CORE_RADIUS.sm,
    maxWidth: "100%",
  },
  metaKey: {
    ...CORE_TYPOGRAPHY.eyebrow,
    fontSize: 9.5,
    color: CORE_COLORS.textTertiary,
  },
  metaValue: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.cyan,
    fontWeight: "600",
    flexShrink: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricWell: {
    flex: 1,
    backgroundColor: CORE_COLORS.surfaceWell,
    borderWidth: 1,
    borderColor: CORE_COLORS.borderSubtle,
    borderRadius: CORE_RADIUS.md,
    padding: 14,
    gap: 9,
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  metricLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: CORE_COLORS.textSecondary,
  },
  metricHero: {
    ...CORE_TYPOGRAPHY.metricValue,
  },
  metricSub: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textTertiary,
  },
});
