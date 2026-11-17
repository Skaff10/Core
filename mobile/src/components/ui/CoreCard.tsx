import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GlassPanel, type GlassPanelProps } from "../glassyui/glass-panel";
import { useGlassTheme } from "../glassyui/glass-provider";
import { CORE_COLORS, CORE_RADIUS } from "../../theme/tokens";

interface CoreCardProps extends Omit<GlassPanelProps, "variant"> {
  children: React.ReactNode;
  variant?: "panel" | "card" | "subtle";
  accentBorderColor?: string;
  accentFillColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Core's primary surface container.
 * Uses GlassPanel for elevated glass cards ('panel' / 'card') and a lighter layered
 * translucent surface for dense list items ('subtle') to preserve visual hierarchy and performance.
 */
export const CoreCard: React.FC<CoreCardProps> = ({
  children,
  variant = "panel",
  accentBorderColor,
  accentFillColor,
  style,
  preset,
  elevation,
  ...rest
}) => {
  const { preferences } = useGlassTheme();

  if (variant === "subtle") {
    const solidFallback = preferences.reduceTransparency
      ? CORE_COLORS.surfaceOpaque
      : accentFillColor || CORE_COLORS.surfaceCard;
    return (
      <View
        style={[
          styles.subtleCard,
          {
            backgroundColor: solidFallback,
            borderColor: accentBorderColor || CORE_COLORS.borderDefault,
          },
          style,
        ]}
        {...rest}
      >
        {!preferences.reduceTransparency && <View style={styles.topRim} pointerEvents="none" />}
        {children}
      </View>
    );
  }

  return (
    <GlassPanel
      variant={variant === "card" ? "card" : "panel"}
      elevation={elevation ?? "base"}
      preset={preset ?? "standard"}
      style={[
        styles.glassCard,
        accentBorderColor && { borderWidth: 1, borderColor: accentBorderColor },
        accentFillColor && { backgroundColor: accentFillColor },
        style,
      ]}
      {...rest}
    >
      {children}
    </GlassPanel>
  );
};

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: CORE_RADIUS.xl,
    padding: 20,
    overflow: "hidden",
  },
  subtleCard: {
    borderRadius: CORE_RADIUS.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 18,
    overflow: "hidden",
  },
  topRim: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CORE_COLORS.rimHighlight,
  },
});
