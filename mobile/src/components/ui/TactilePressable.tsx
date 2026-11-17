import React, { useCallback, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useGlassTheme } from "../glassyui/glass-provider";
import { CORE_MOTION } from "../../theme/motion";

interface TactilePressableProps extends Omit<PressableProps, "style"> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
}

export const TactilePressable: React.FC<TactilePressableProps> = ({
  children,
  style,
  scaleTo = CORE_MOTION.scalePressed,
  haptic = false,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}) => {
  const { preferences } = useGlassTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const nativeDriver = Platform.OS !== "web";

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      onPressIn?.(e);
      if (preferences.reduceMotion) return;
      Animated.parallel([
        Animated.spring(scale, {
          toValue: scaleTo,
          useNativeDriver: nativeDriver,
          ...CORE_MOTION.springPress,
        }),
        Animated.timing(opacity, {
          toValue: 0.88,
          duration: 90,
          useNativeDriver: nativeDriver,
        }),
      ]).start();
    },
    [nativeDriver, onPressIn, opacity, preferences.reduceMotion, scale, scaleTo]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      onPressOut?.(e);
      if (preferences.reduceMotion) return;
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: nativeDriver,
          ...CORE_MOTION.springPress,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: nativeDriver,
        }),
      ]).start();
    },
    [nativeDriver, onPressOut, opacity, preferences.reduceMotion, scale]
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (haptic && Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress?.(e);
    },
    [haptic, onPress]
  );

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          disabled && { opacity: 0.45 },
          !preferences.reduceMotion && {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
