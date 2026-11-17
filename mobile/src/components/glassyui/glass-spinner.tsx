import { ComponentRef, forwardRef, useMemo } from 'react';
import { Animated, StyleSheet, View, type ViewProps } from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GLASS_RADIUS } from './lib/tokens';
import { useLoop } from './lib/use-loop';

export type GlassSpinnerSize = 'sm' | 'md' | 'lg';

export type GlassSpinnerProps = Omit<ViewProps, 'children'> & {
  /** The ring's colour. Defaults to the theme's text colour, as the web spinner takes its text's. */
  color?: string;
  /** Read out by screen readers. Defaults to "Loading". */
  label?: string;
  size?: GlassSpinnerSize;
};

const SIZE = {
  sm: { diameter: 16, stroke: 1.5 },
  md: { diameter: 24, stroke: 2 },
  lg: { diameter: 36, stroke: 3 },
} as const;

// The tail fades in this many steps, from clear behind it to the full colour at its head.
const STEPS = 30;

const TURN_MS = 900;

/**
 * A ring with a fading tail that turns while something short loads. Reduce Motion holds it
 * still, its head at the top.
 */
export const GlassSpinner = forwardRef<ComponentRef<typeof View>, GlassSpinnerProps>(
  ({ color, label = 'Loading', size = 'md', style, ...rest }, ref) => {
    const { colors, preferences } = useGlassTheme();
    const turn = useLoop(TURN_MS, !preferences.reduceMotion);
    const { diameter, stroke } = SIZE[size];
    const ink = color ?? colors.foreground;

    // React Native has no conic gradient, so short arcs of rising opacity draw the tail.
    const tail = useMemo(() => {
      const arc = (Math.PI * (diameter - stroke)) / STEPS;

      return Array.from({ length: STEPS }, (_, step) => (
        <View
          key={step}
          style={{
            backgroundColor: ink,
            height: stroke,
            left: (diameter - arc) / 2,
            opacity: (step + 0.5) / STEPS,
            position: 'absolute',
            top: 0,
            transform: [{ rotate: `${((step + 0.5) * 360) / STEPS}deg` }],
            transformOrigin: [arc / 2, diameter / 2, 0],
            width: arc,
          }}
        />
      ));
    }, [diameter, ink, stroke]);

    return (
      <View
        ref={ref}
        accessible
        accessibilityLabel={label}
        accessibilityRole="progressbar"
        style={[{ height: diameter, width: diameter }, style]}
        {...rest}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            { borderColor: ink, borderWidth: stroke, opacity: 0.2 },
          ]}
        />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            {
              transform: [
                {
                  rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                },
              ],
            },
          ]}
        >
          {tail}
        </Animated.View>
      </View>
    );
  },
);

GlassSpinner.displayName = 'GlassSpinner';

const styles = StyleSheet.create({
  ring: { borderRadius: GLASS_RADIUS.capsule, pointerEvents: 'none' },
});
