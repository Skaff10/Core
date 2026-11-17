import { Easing } from "react-native";

/**
 * Physics & timing presets calibrated for natural, responsive tactile feedback.
 * Short interactions: ~150-220ms. Transitions: ~260-380ms.
 */
export const CORE_MOTION = {
  fastMs: 160,
  normalMs: 220,
  transitionMs: 300,
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
  springPress: {
    damping: 20,
    stiffness: 340,
    mass: 0.85,
  },
  springSnappy: {
    damping: 22,
    stiffness: 280,
    mass: 0.9,
  },
  scalePressed: 0.972,
  scaleButtonPressed: 0.96,
} as const;
