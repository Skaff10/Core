import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { GlassBackdrop } from "../glassyui/glass-backdrop";
import { CORE_COLORS } from "../../theme/tokens";

/**
 * Ambient dark gradient canvas rendered inside GlassBackdrop's BlurTargetView.
 * Gives Android 12+, iOS, and Web genuine subtle color & depth for glass surfaces to refract.
 */
export const AmbientBackdrop: React.FC = () => {
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
      <LinearGradient
        colors={["#06090F", "#0A111D", "#070B13"]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="cyanGlow" cx="85%" cy="10%" rx="55%" ry="40%">
            <Stop offset="0%" stopColor="#0891B2" stopOpacity="0.18" />
            <Stop offset="55%" stopColor="#0E7490" stopOpacity="0.06" />
            <Stop offset="100%" stopColor="#06090F" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="tealGlow" cx="12%" cy="82%" rx="55%" ry="42%">
            <Stop offset="0%" stopColor="#0D9488" stopOpacity="0.13" />
            <Stop offset="55%" stopColor="#1E3A8A" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="#06090F" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cyanGlow)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tealGlow)" />
      </Svg>
    </View>
  );
};

interface AppScreenShellProps {
  children: React.ReactNode;
  edges?: Edge[];
}

export const AppScreenShell: React.FC<AppScreenShellProps> = ({
  children,
  edges = ["top"],
}) => {
  return (
    <GlassBackdrop backdrop={<AmbientBackdrop />} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={edges}>
        {children}
      </SafeAreaView>
    </GlassBackdrop>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CORE_COLORS.bgBase,
  },
  base: {
    backgroundColor: CORE_COLORS.bgBase,
  },
  safeArea: {
    flex: 1,
  },
});
