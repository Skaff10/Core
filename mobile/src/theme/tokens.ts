import { Platform } from "react-native";

/**
 * Core Design System Tokens
 * Precision Dark Glass Palette — high legibility, restrained ambient lighting,
 * consistent surface hierarchy.
 */
export const CORE_COLORS = {
  // Base canvas & ambient backdrop
  bgBase: "#070A0F",
  bgMid: "#0B1019",
  bgDeep: "#090E17",

  // Layered translucent & opaque surfaces
  surfaceSubtle: "rgba(255, 255, 255, 0.045)",
  surfaceCard: "rgba(17, 24, 38, 0.68)",
  surfaceElevated: "rgba(24, 33, 50, 0.78)",
  surfaceOpaque: "#141923",
  surfaceWell: "rgba(6, 10, 18, 0.56)",
  surfacePressed: "rgba(255, 255, 255, 0.09)",

  // Borders & edge reflections
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderDefault: "rgba(255, 255, 255, 0.13)",
  borderStrong: "rgba(255, 255, 255, 0.22)",
  rimHighlight: "rgba(255, 255, 255, 0.24)",
  focusBorder: "rgba(56, 189, 248, 0.65)",

  // Typography inks (WCAG AA compliant against dark glass surfaces)
  textPrimary: "#F4F7FB",
  textSecondary: "#94A3B8",
  textTertiary: "#7D8FA8",
  textInverse: "#061018",

  // Semantic accents
  cyan: "#22D3EE",
  cyanSoft: "rgba(34, 211, 238, 0.13)",
  cyanBorder: "rgba(34, 211, 238, 0.34)",
  blueFill: "#087EA4",
  sky: "#38BDF8",
  teal: "#2DD4BF",
  tealSoft: "rgba(45, 212, 191, 0.13)",

  // Status semantics
  emerald: "#34D399",
  emeraldFill: "#10B981",
  emeraldSoft: "rgba(16, 185, 129, 0.14)",
  emeraldBorder: "rgba(52, 211, 153, 0.36)",

  amber: "#FBBF24",
  amberFill: "#F59E0B",
  amberSoft: "rgba(245, 158, 11, 0.14)",
  amberBorder: "rgba(251, 191, 36, 0.36)",

  coral: "#FB7185",
  coralFill: "#E11D48",
  coralSoft: "rgba(244, 63, 94, 0.13)",
  coralBorder: "rgba(251, 113, 133, 0.35)",

  violet: "#A78BFA",
  violetSoft: "rgba(167, 139, 250, 0.14)",
  violetBorder: "rgba(167, 139, 250, 0.32)",
} as const;

export const CORE_SPACING = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  screenX: 18,
  sectionGap: 20,
  cardPad: 18,
  floatingDockOffset: 96,
} as const;

export const CORE_RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const CORE_SHADOWS = {
  card: Platform.select({
    web: {
      boxShadow: "0px 8px 28px -8px rgba(0, 0, 0, 0.45)",
    },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
      elevation: 6,
    },
  }),
  dock: Platform.select({
    web: {
      boxShadow: "0px 14px 40px -10px rgba(0, 0, 0, 0.65)",
    },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.45,
      shadowRadius: 24,
      elevation: 12,
    },
  }),
} as const;
