import { ComponentRef, forwardRef, useCallback, useEffect, useState } from 'react';
import {
  Animated,
  I18nManager,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';
import { useControllableState } from './lib/use-controllable-state';

export type GlassSwitchProps = Omit<PressableProps, 'children' | 'onPress' | 'style'> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

const SIZE = {
  sm: { height: 24, inset: 2, knobHeight: 20, knobWidth: 28, width: 46 },
  md: { height: 28, inset: 2, knobHeight: 24, knobWidth: 36, width: 60 },
} as const;

/**
 * A switch whose white knob turns to clear glass under a finger and slides to its new side.
 * Reduce Motion keeps the end state and drops the slide.
 */
export const GlassSwitch = forwardRef<ComponentRef<typeof View>, GlassSwitchProps>(
  (
    {
      checked,
      defaultChecked = false,
      disabled,
      onCheckedChange,
      onPressIn,
      onPressOut,
      size = 'md',
      style,
      ...rest
    },
    ref,
  ) => {
    const { colors, preferences } = useGlassTheme();
    const [on, setOn] = useControllableState(checked, defaultChecked, onCheckedChange);
    const [progress] = useState(() => new Animated.Value(on ? 1 : 0));
    const [pressed] = useState(() => new Animated.Value(0));
    const metrics = SIZE[size];

    const travel =
      (metrics.width - metrics.knobWidth - metrics.inset * 2) * (I18nManager.isRTL ? -1 : 1);

    useEffect(() => {
      if (preferences.reduceMotion) {
        progress.setValue(on ? 1 : 0);

        return;
      }

      Animated.spring(progress, {
        ...GLASS_MOTION.spring,
        toValue: on ? 1 : 0,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }).start();
    }, [on, preferences.reduceMotion, progress]);

    const toggle = useCallback(() => setOn(!on), [on, setOn]);

    const handlePressIn = useCallback(
      (event: GestureResponderEvent) => {
        onPressIn?.(event);
        Animated.timing(pressed, {
          duration: 120,
          toValue: 1,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();
      },
      [onPressIn, pressed],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        onPressOut?.(event);
        Animated.timing(pressed, {
          duration: 260,
          toValue: 0,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();
      },
      [onPressOut, pressed],
    );

    return (
      <Pressable
        ref={ref}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
        disabled={disabled}
        hitSlop={8}
        onPress={toggle}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.track,
          { backgroundColor: colors.track, height: metrics.height, width: metrics.width },
          disabled && styles.disabled,
          style,
        ]}
        {...rest}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.round,
            styles.layer,
            { backgroundColor: colors.accent, opacity: progress },
          ]}
        />
        <Animated.View
          style={{
            height: metrics.knobHeight,
            left: metrics.inset,
            pointerEvents: 'none',
            position: 'absolute',
            top: metrics.inset,
            width: metrics.knobWidth,
            transform: [
              {
                translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }),
              },
              {
                scale: preferences.reduceMotion
                  ? 1
                  : pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }),
              },
            ],
          }}
        >
          <GlassSurface
            elevation="none"
            preset="subtle"
            style={[StyleSheet.absoluteFill, styles.round]}
          />
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.round,
              {
                backgroundColor: colors.knob,
                boxShadow: '0px 2px 6px rgba(28, 28, 30, 0.16), 0px 1px 2px rgba(28, 28, 30, 0.1)',
                opacity: preferences.reduceTransparency
                  ? 1
                  : pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.12] }),
              },
            ]}
          />
        </Animated.View>
      </Pressable>
    );
  },
);

GlassSwitch.displayName = 'GlassSwitch';

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  layer: { pointerEvents: 'none' },
  round: { borderCurve: 'continuous', borderRadius: GLASS_RADIUS.capsule },
  track: { borderCurve: 'continuous', borderRadius: GLASS_RADIUS.capsule },
});
