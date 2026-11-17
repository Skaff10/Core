import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { useGlassTheme } from "../glassyui/glass-provider";
import { CORE_COLORS, CORE_RADIUS } from "../../theme/tokens";
import { CORE_MOTION } from "../../theme/motion";

interface AnimatedBarProps {
  percent: number;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export const AnimatedBar: React.FC<AnimatedBarProps> = ({
  percent,
  color = CORE_COLORS.cyan,
  height = 6,
  style,
}) => {
  const { preferences } = useGlassTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const anim = useRef(new Animated.Value(clamped / 100)).current;

  useEffect(() => {
    const target = clamped / 100;
    if (preferences.reduceMotion) {
      anim.setValue(target);
      return;
    }
    Animated.timing(anim, {
      toValue: target,
      duration: 420,
      easing: CORE_MOTION.easeOut,
      useNativeDriver: false,
    }).start();
  }, [anim, clamped, preferences.reduceMotion]);

  const widthInterpolated = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: widthInterpolated,
            backgroundColor: color,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
};

interface AnimatedEntranceProps {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}

export const AnimatedEntrance: React.FC<AnimatedEntranceProps> = ({
  children,
  index = 0,
  style,
}) => {
  const { preferences } = useGlassTheme();
  const nativeDriver = Platform.OS !== "web";
  const progress = useRef(new Animated.Value(preferences.reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (preferences.reduceMotion) {
      progress.setValue(1);
      return;
    }
    const delay = Math.min(index, 6) * 45;
    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: CORE_MOTION.transitionMs,
        easing: CORE_MOTION.easeOut,
        useNativeDriver: nativeDriver,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [index, nativeDriver, preferences.reduceMotion, progress]);

  if (preferences.reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: "rgba(148, 163, 184, 0.16)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderCurve: "continuous",
  },
});
