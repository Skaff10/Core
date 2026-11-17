import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Cpu } from "lucide-react-native";
import { useConnectionStore } from "../store/useConnectionStore";
import { useGlassTheme } from "./glassyui/glass-provider";
import { GlassSurface } from "./glassyui/glass-surface";
import { CORE_COLORS, CORE_RADIUS } from "../theme/tokens";
import { CORE_TYPOGRAPHY } from "../theme/typography";

interface HeaderStatusProps {
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export const HeaderStatus: React.FC<HeaderStatusProps> = ({
  title = "System Command Deck",
  subtitle,
  rightSlot,
}) => {
  const { pcIp, pcPort, isConnected } = useConnectionStore();
  const { preferences } = useGlassTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const nativeDriver = Platform.OS !== "web";

  useEffect(() => {
    if (!isConnected || preferences.reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 1400,
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: nativeDriver,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isConnected, nativeDriver, preferences.reduceMotion, pulse]);

  const resolvedSubtitle = subtitle || `${pcIp}:${pcPort}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.leftGroup}>
        <GlassSurface
          preset="control"
          elevation="base"
          style={styles.logoMark}
          accessibilityLabel="Core"
        >
          <View style={styles.logoInnerGlow} />
          <Cpu size={18} color={CORE_COLORS.cyan} strokeWidth={2} />
        </GlassSurface>

        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitlePrefix}>CORE</Text>
            <Text style={styles.subtitleDot}>·</Text>
            <Text style={styles.subtitleText} numberOfLines={1}>
              {resolvedSubtitle}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.rightGroup}>
        {rightSlot}
        <GlassSurface
          preset="control"
          elevation="none"
          style={[
            styles.statusPill,
            {
              borderColor: isConnected
                ? CORE_COLORS.emeraldBorder
                : CORE_COLORS.coralBorder,
            },
          ]}
          accessibilityRole="text"
          accessibilityLabel={isConnected ? "PC Linked" : "PC Offline"}
        >
          <Animated.View
            style={[
              styles.statusDot,
              {
                backgroundColor: isConnected
                  ? CORE_COLORS.emeraldFill
                  : CORE_COLORS.coral,
                opacity: isConnected ? pulse : 1,
              },
            ]}
          />
          <Text
            style={[
              styles.statusLabel,
              {
                color: isConnected
                  ? CORE_COLORS.emerald
                  : CORE_COLORS.coral,
              },
            ]}
          >
            {isConnected ? "Linked" : "Offline"}
          </Text>
        </GlassSurface>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoInnerGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: CORE_COLORS.cyanSoft,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...CORE_TYPOGRAPHY.screenTitle,
    fontSize: 19,
    lineHeight: 24,
    color: CORE_COLORS.textPrimary,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  subtitlePrefix: {
    ...CORE_TYPOGRAPHY.eyebrow,
    fontSize: 10,
    color: CORE_COLORS.cyan,
    letterSpacing: 0.9,
  },
  subtitleDot: {
    color: CORE_COLORS.textTertiary,
    fontSize: 11,
  },
  subtitleText: {
    ...CORE_TYPOGRAPHY.monoSmall,
    color: CORE_COLORS.textSecondary,
    flexShrink: 1,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: CORE_RADIUS.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
