import { ComponentRef, forwardRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { plainTextOf, wrapPlainText } from './lib/plain-text';
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';
import { useLoop } from './lib/use-loop';

export type GlassProgressSize = 'sm' | 'md' | 'lg';

export type GlassProgressProps = Omit<ViewProps, 'children'> & {
  /** Text above the bar. It also names the bar for assistive technology. */
  label?: ReactNode;
  /** The value that means done. Defaults to 100. */
  max?: number;
  /** Shows the percentage beside the label. */
  showValue?: boolean;
  size?: GlassProgressSize;
  /** How far along. Leave it out, or pass null, when the length is unknown. */
  value?: number | null;
};

const TRACK_HEIGHT = { sm: 4, md: 8, lg: 12 } as const;

// The web's ease-out curve, for the fill sliding to a new value.
const EASE_OUT = Easing.bezier(0.32, 0.72, 0, 1);

const SLIDE_MS = 640;

// Without a value, a segment 40% as wide as the track sweeps across it and starts again.
const SEGMENT = 0.4;

const SWEEP_MS = 1600;

/**
 * A track with a fill that slides to its value. Without a value a segment sweeps along it, for
 * work of unknown length; Reduce Motion holds the segment still in the middle.
 */
export const GlassProgress = forwardRef<ComponentRef<typeof View>, GlassProgressProps>(
  (
    { accessibilityLabel, label, max = 100, showValue = false, size = 'md', style, value, ...rest },
    ref,
  ) => {
    const { colors, preferences } = useGlassTheme();
    const [width, setWidth] = useState(0);
    const known = value !== null && value !== undefined && Number.isFinite(value);
    const clamped = known ? Math.min(Math.max(value, 0), max) : 0;
    const fraction = known && max > 0 ? clamped / max : 0;
    const percent = Math.round(fraction * 100);
    const [fill] = useState(() => new Animated.Value(fraction));
    const sweep = useLoop(SWEEP_MS, !known && !preferences.reduceMotion);
    // Translation is physical, so a right-to-left layout fills from the right.
    const direction = I18nManager.isRTL ? -1 : 1;
    const segment = SEGMENT * width;

    useEffect(() => {
      if (preferences.reduceMotion) {
        fill.setValue(fraction);

        return;
      }

      const animation = Animated.timing(fill, {
        duration: SLIDE_MS,
        easing: EASE_OUT,
        toValue: fraction,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      });

      animation.start();

      return () => animation.stop();
    }, [fill, fraction, preferences.reduceMotion]);

    const measure = useCallback((event: LayoutChangeEvent) => {
      setWidth(event.nativeEvent.layout.width);
    }, []);

    const fillColors = { backgroundColor: colors.accent };

    return (
      <View
        ref={ref}
        accessible
        accessibilityLabel={accessibilityLabel ?? plainTextOf(label)}
        accessibilityRole="progressbar"
        // Native accessibility values are whole numbers, so the bar reports a percentage.
        accessibilityValue={known ? { max: 100, min: 0, now: percent } : undefined}
        style={[styles.root, style]}
        {...rest}
      >
        {label || (showValue && known) ? (
          <View style={styles.header}>
            {wrapPlainText(label, (text) => (
              <Text style={[styles.label, { color: colors.foreground }]}>{text}</Text>
            ))}
            {showValue && known ? (
              <Text style={[styles.value, { color: colors.mutedForeground }]}>{percent}%</Text>
            ) : null}
          </View>
        ) : null}
        <View
          onLayout={measure}
          style={[styles.track, { backgroundColor: colors.track, height: TRACK_HEIGHT[size] }]}
        >
          {width > 0 && known ? (
            // The whole pill slides in from the start, so its leading end stays round.
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.fill,
                fillColors,
                {
                  transform: [
                    {
                      translateX: fill.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-width * direction, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : null}
          {width > 0 && !known ? (
            <Animated.View
              style={[
                styles.fill,
                styles.segment,
                fillColors,
                {
                  transform: [
                    {
                      translateX: preferences.reduceMotion
                        ? 0.75 * segment * direction
                        : sweep.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-segment * direction, width * direction],
                          }),
                    },
                  ],
                },
              ]}
            />
          ) : null}
        </View>
      </View>
    );
  },
);

GlassProgress.displayName = 'GlassProgress';

const styles = StyleSheet.create({
  fill: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.4)',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0) 60%)',
  },
  header: { alignItems: 'baseline', flexDirection: 'row', gap: 16 },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 20 },
  root: { gap: 8, width: '100%' },
  segment: {
    bottom: 0,
    pointerEvents: 'none',
    position: 'absolute',
    start: 0,
    top: 0,
    width: `${SEGMENT * 100}%`,
  },
  track: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    boxShadow: 'inset 0px 1px 2px rgba(0, 0, 0, 0.18)',
    overflow: 'hidden',
  },
  value: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    lineHeight: 20,
    marginStart: 'auto',
  },
});
