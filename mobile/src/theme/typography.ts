import { Platform, TextStyle } from "react-native";

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const CORE_TYPOGRAPHY: Record<string, TextStyle> = {
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.45,
    lineHeight: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.15,
    lineHeight: 21,
  },
  heroValue: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 30,
    fontVariant: ["tabular-nums"],
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
  },
  body: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 21,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.0,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  mono: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ["tabular-nums"],
  },
  monoSmall: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: 15,
    fontVariant: ["tabular-nums"],
  },
};
