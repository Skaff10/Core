import { ComponentRef, forwardRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type MouseEvent,
  type NativeSyntheticEvent,
  type PressableProps,
  type StyleProp,
  type TargetedEvent,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { wrapPlainText } from './lib/plain-text';
import { GLASS_MOTION } from './lib/tokens';

export type GlassDockProps = ViewProps;

export type GlassDockItemProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Shows the running indicator under the icon. */
  active?: boolean;
  /** The icon. Full app artwork can fill the item; a small glyph sits in its middle. */
  children?: ReactNode;
  /** Names the item for assistive technology, and shows above it while it is held. */
  label: string;
  style?: StyleProp<ViewStyle>;
};

export type GlassDockSeparatorProps = ViewProps;

const ITEM = 48;

const GAP = 8;

const PAD = 10;

// The web's ease-out curve for arrivals; exits ease in and run shorter.
const EASE_OUT = Easing.bezier(0.32, 0.72, 0, 1);

const EASE_IN = Easing.bezier(0.42, 0, 1, 1);

type DockLabelProps = {
  /** True once nothing holds the label up; it shrinks back into its item, then `onLeft` runs. */
  leaving: boolean;
  onLeft: () => void;
  text: string;
};

// The label is glass, so it grows out of its item instead of fading in.
function DockLabel({ leaving, onLeft, text }: DockLabelProps) {
  const { colors, preferences } = useGlassTheme();
  const [grow] = useState(() => new Animated.Value(preferences.reduceMotion ? 1 : 0));

  useEffect(() => {
    if (preferences.reduceMotion) {
      grow.setValue(leaving ? 0 : 1);

      if (leaving) onLeft();

      return;
    }

    const animation = Animated.timing(grow, {
      duration: leaving ? 150 : 220,
      easing: leaving ? EASE_IN : EASE_OUT,
      toValue: leaving ? 0 : 1,
      useNativeDriver: GLASS_MOTION.nativeDriver,
    });

    animation.start(({ finished }) => {
      if (finished && leaving) onLeft();
    });

    return () => animation.stop();
  }, [grow, leaving, onLeft, preferences.reduceMotion]);

  return (
    <View style={styles.labelRow}>
      <Animated.View
        style={[
          styles.labelOrigin,
          {
            transform: [
              { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
              { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
            ],
          },
        ]}
      >
        <GlassSurface preset="overlay" style={styles.label}>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.labelText,
              {
                color: colors.foreground,
                opacity: grow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
              },
            ]}
          >
            {text}
          </Animated.Text>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/**
 * A row of app icons on a quiet glass shelf. Holding an icon shows its label; nothing a finger
 * does resizes an icon or its neighbours.
 */
export const GlassDock = forwardRef<ComponentRef<typeof View>, GlassDockProps>(({ children, style, ...rest }, ref) => (
  <View ref={ref} style={[styles.dock, style]} {...rest}>
    <GlassSurface
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      preset="standard"
      style={[StyleSheet.absoluteFill, styles.shelf]}
    />
    {children}
  </View>
));

GlassDock.displayName = 'GlassDock';

/**
 * An icon in the dock. A long press shows its label above it, as a pointer's hover and keyboard
 * focus do; a dot beneath marks it active.
 */
export const GlassDockItem = forwardRef<ComponentRef<typeof View>, GlassDockItemProps>(
  (
    {
      active = false,
      children,
      disabled,
      label,
      onBlur,
      onFocus,
      onHoverIn,
      onHoverOut,
      onLongPress,
      onPressOut,
      style,
      ...rest
    },
    ref,
  ) => {
    const { colors, preferences } = useGlassTheme();
    const [held, setHeld] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [labelShown, setLabelShown] = useState(false);
    const [dot] = useState(() => new Animated.Value(active ? 1 : 0));

    useEffect(() => {
      if (preferences.reduceMotion) {
        dot.setValue(active ? 1 : 0);

        return;
      }

      const animation = Animated.timing(dot, {
        duration: 200,
        toValue: active ? 1 : 0,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      });

      animation.start();

      return () => animation.stop();
    }, [active, dot, preferences.reduceMotion]);

    const handleLongPress = useCallback(
      (event: GestureResponderEvent) => {
        onLongPress?.(event);
        setHeld(true);
        setLabelShown(true);
      },
      [onLongPress],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        onPressOut?.(event);
        setHeld(false);
      },
      [onPressOut],
    );

    const handleHoverIn = useCallback(
      (event: MouseEvent) => {
        onHoverIn?.(event);
        setHovered(true);
        setLabelShown(true);
      },
      [onHoverIn],
    );

    const handleHoverOut = useCallback(
      (event: MouseEvent) => {
        onHoverOut?.(event);
        setHovered(false);
      },
      [onHoverOut],
    );

    const handleFocus = useCallback(
      (event: NativeSyntheticEvent<TargetedEvent>) => {
        onFocus?.(event);
        setFocused(true);
        setLabelShown(true);
      },
      [onFocus],
    );

    const handleBlur = useCallback(
      (event: NativeSyntheticEvent<TargetedEvent>) => {
        onBlur?.(event);
        setFocused(false);
      },
      [onBlur],
    );

    const hideLabel = useCallback(() => setLabelShown(false), []);

    return (
      <Pressable
        ref={ref}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.item,
          (pressed || hovered || focused) && { backgroundColor: colors.controlSurface },
          focused && { outlineColor: colors.focusRing },
          focused && styles.focused,
          disabled && styles.disabled,
          style,
        ]}
        {...rest}
      >
        {wrapPlainText(children, (text) => (
          <Text style={[styles.glyph, { color: colors.foreground }]}>{text}</Text>
        ))}
        {labelShown ? (
          <DockLabel leaving={!(held || hovered || focused)} onLeft={hideLabel} text={label} />
        ) : null}
        <View style={styles.dotRow}>
          <Animated.View
            style={[
              styles.dot,
              {
                backgroundColor: colors.foreground,
                opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
              },
            ]}
          />
        </View>
      </Pressable>
    );
  },
);

GlassDockItem.displayName = 'GlassDockItem';

/** A thin upright line between groups of dock icons. */
export const GlassDockSeparator = forwardRef<ComponentRef<typeof View>, GlassDockSeparatorProps>(
  ({ style, ...rest }, ref) => {
    const { colors } = useGlassTheme();

    return (
      <View
        ref={ref}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.separator, { backgroundColor: colors.border }, style]}
        {...rest}
      />
    );
  },
);

GlassDockSeparator.displayName = 'GlassDockSeparator';

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  // The shelf hugs its icons, like the web's inline dock; pass alignSelf to place it.
  dock: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: GAP,
    height: ITEM + PAD * 2,
    paddingHorizontal: PAD + 2,
    paddingVertical: PAD,
  },
  dot: { borderRadius: 2, height: 4, width: 4 },
  // The indicator sits in the shelf's padding, under the icon.
  dotRow: {
    alignItems: 'center',
    bottom: -(PAD - 3),
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
  },
  focused: { outlineOffset: 3, outlineStyle: 'solid', outlineWidth: 2 },
  glyph: { fontSize: 28 },
  // The same generous target holds full artwork or a small glyph, and never changes size.
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: ITEM * 0.225,
    height: ITEM,
    justifyContent: 'center',
    width: ITEM,
  },
  label: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  labelOrigin: { transformOrigin: 'bottom' },
  // Wide enough to centre any label over the icon; it takes no touches.
  labelRow: {
    alignItems: 'center',
    bottom: '100%',
    left: -200,
    marginBottom: 10,
    pointerEvents: 'none',
    position: 'absolute',
    right: -200,
  },
  labelText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  separator: { alignSelf: 'stretch', marginHorizontal: 4, marginVertical: 6, width: 1 },
  shelf: { borderRadius: ITEM * 0.24 + PAD, pointerEvents: 'none' },
});
