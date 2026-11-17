import { ComponentRef, forwardRef, useCallback, useState } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GLASS_RADIUS } from './lib/tokens';
import { useLoop } from './lib/use-loop';

export type GlassSkeletonVariant = 'block' | 'circle' | 'text';

export type GlassSkeletonProps = Omit<ViewProps, 'children'> & {
  /** How many lines a `text` skeleton draws. The last is shorter. Defaults to 3. */
  lines?: number;
  /** A `block` is sized with `style`, a `circle` is square and a `text` is a stack of lines. */
  variant?: GlassSkeletonVariant;
};

// The band of light that crosses each placeholder, brighter over the light theme's pale fill.
const SHEEN = {
  dark: 'rgba(255, 255, 255, 0.14)',
  light: 'rgba(255, 255, 255, 0.75)',
} as const;

const SHEEN_MS = 1800;

// The last line of a paragraph stops short, as real text does.
const SHORT_LINE = 0.62;

type SheenProps = {
  progress: Animated.Value;
  /** The placeholder's width: the band starts one width before it and ends one width after. */
  width: number;
};

// The band crosses in the reading direction, from start to end.
function Sheen({ progress, width }: SheenProps) {
  const { preferences } = useGlassTheme();
  const direction = I18nManager.isRTL ? -1 : 1;
  const angle = I18nManager.isRTL ? 260 : 100;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.sheen,
        {
          experimental_backgroundImage: `linear-gradient(${angle}deg, rgba(255, 255, 255, 0) 20%, ${SHEEN[preferences.theme]} 50%, rgba(255, 255, 255, 0) 80%)`,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-width * direction, width * direction],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/**
 * A quiet placeholder with a slow sheen, still under Reduce Motion. It is hidden from assistive
 * technology, so mark the region that is loading with `accessibilityState={{ busy: true }}`.
 */
export const GlassSkeleton = forwardRef<ComponentRef<typeof View>, GlassSkeletonProps>(
  ({ lines = 3, onLayout, style, variant = 'block', ...rest }, ref) => {
    const { colors, preferences } = useGlassTheme();
    const [width, setWidth] = useState(0);
    const sweep = useLoop(SHEEN_MS, !preferences.reduceMotion);
    const shine = !preferences.reduceMotion && width > 0;
    const fill = { backgroundColor: colors.controlSurface };

    const measure = useCallback(
      (event: LayoutChangeEvent) => {
        onLayout?.(event);
        setWidth(event.nativeEvent.layout.width);
      },
      [onLayout],
    );

    if (variant === 'text') {
      const count = Math.max(1, lines);

      return (
        <View
          ref={ref}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLayout={measure}
          style={[styles.text, style]}
          {...rest}
        >
          {Array.from({ length: count }, (_, index) => {
            const short = count > 1 && index === count - 1;

            return (
              <View
                key={index}
                style={[styles.placeholder, styles.line, fill, short && styles.short]}
              >
                {shine ? (
                  <Sheen progress={sweep} width={short ? width * SHORT_LINE : width} />
                ) : null}
              </View>
            );
          })}
        </View>
      );
    }

    return (
      <View
        ref={ref}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={measure}
        style={[
          styles.placeholder,
          variant === 'circle' ? styles.circle : styles.block,
          fill,
          style,
        ]}
        {...rest}
      >
        {shine ? <Sheen progress={sweep} width={width} /> : null}
      </View>
    );
  },
);

GlassSkeleton.displayName = 'GlassSkeleton';

const styles = StyleSheet.create({
  block: { borderRadius: 10, minHeight: 16 },
  circle: { aspectRatio: 1, borderRadius: GLASS_RADIUS.capsule, width: 40 },
  line: { borderRadius: GLASS_RADIUS.capsule, height: 14 },
  placeholder: { borderCurve: 'continuous', overflow: 'hidden' },
  sheen: { pointerEvents: 'none' },
  short: { width: `${SHORT_LINE * 100}%` },
  text: { gap: 10, width: '100%' },
});
