import { ComponentRef, Children, forwardRef, isValidElement, useCallback, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';

export type ButtonVariant = 'primary' | 'prominent' | 'ghost' | 'soft';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type GlassButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  children?: ReactNode;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

const SIZE_STYLE = {
  sm: { gap: 6, minHeight: 32, paddingHorizontal: 13 },
  md: { gap: 8, minHeight: 44, paddingHorizontal: 22 },
  lg: { gap: 10, minHeight: 52, paddingHorizontal: 32 },
} as const;

const LABEL_SIZE = { sm: 13, md: 15, lg: 17 } as const;

// A small button still answers a 44-point touch.
const HIT_SLOP = { sm: 6, md: 0, lg: 0 } as const;

/**
 * A glass button that rests as a slab just above the page. A press sets it down, its shadow
 * drawing in, and lights the glass from the point it lands. Reduce Motion keeps the pressed
 * state and drops the movement.
 */
export const GlassButton = forwardRef<ComponentRef<typeof View>, GlassButtonProps>(
  (
    {
      children,
      disabled = false,
      onLayout,
      onPressIn,
      onPressOut,
      size = 'md',
      style,
      variant = 'primary',
      ...rest
    },
    ref,
  ) => {
    const { colors, preferences } = useGlassTheme();
    const [press] = useState(() => new Animated.Value(0));
    const [bloom] = useState(() => new Animated.Value(0));
    const [bloomOrigin] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
    const [bloomSize, setBloomSize] = useState(0);
    const reduceMotion = preferences.reduceMotion;
    const label = variant === 'prominent' ? colors.accentForeground : colors.foreground;

    const handleLayout = useCallback(
      (event: LayoutChangeEvent) => {
        onLayout?.(event);
        const { height, width } = event.nativeEvent.layout;

        setBloomSize(Math.max(width, height) * 2.4);
      },
      [onLayout],
    );

    const handlePressIn = useCallback(
      (event: GestureResponderEvent) => {
        onPressIn?.(event);

        if (reduceMotion) {
          press.setValue(1);

          return;
        }

        Animated.timing(press, {
          duration: 90,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();

        // The light starts under the finger and spreads through the glass.
        bloomOrigin.setValue({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
        bloom.setValue(0);
        Animated.timing(bloom, {
          duration: 720,
          easing: Easing.bezier(0.22, 0.8, 0.3, 1),
          toValue: 1,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();
      },
      [bloom, bloomOrigin, onPressIn, press, reduceMotion],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        onPressOut?.(event);

        if (reduceMotion) {
          press.setValue(0);

          return;
        }

        Animated.spring(press, {
          ...GLASS_MOTION.spring,
          toValue: 0,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();
      },
      [onPressOut, press, reduceMotion],
    );

    const renderLabel = (text: ReactNode) => (
      <Text numberOfLines={1} style={[styles.label, { color: label, fontSize: LABEL_SIZE[size] }]}>
        {text}
      </Text>
    );

    const content = (
      <>
        <View style={[StyleSheet.absoluteFill, styles.clip]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: variant === 'ghost' ? colors.controlSurface : colors.rim,
                opacity: press,
              },
            ]}
          />
          {bloomSize > 0 ? (
            <Animated.View
              style={[
                styles.bloom,
                {
                  borderRadius: bloomSize / 2,
                  height: bloomSize,
                  left: -bloomSize / 2,
                  top: -bloomSize / 2,
                  width: bloomSize,
                  opacity: bloom.interpolate({
                    inputRange: [0, 0.16, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateX: bloomOrigin.x },
                    { translateY: bloomOrigin.y },
                    { scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }) },
                  ],
                },
              ]}
            />
          ) : null}
        </View>
        {Children.toArray(children).every((child) => !isValidElement(child))
          ? renderLabel(children)
          : // Beside an icon, each run of text still needs a Text to render in.
            Children.map(children, (child) => (isValidElement(child) ? child : renderLabel(child)))}
      </>
    );

    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        hitSlop={HIT_SLOP[size]}
        onLayout={handleLayout}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.root, disabled && styles.disabled, style]}
        {...rest}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }) },
            ],
          }}
        >
          {variant === 'ghost' ? (
            <View style={[styles.body, SIZE_STYLE[size]]}>{content}</View>
          ) : (
            <GlassSurface
              elevation={variant === 'soft' ? 'none' : 'base'}
              preset={variant === 'soft' ? 'subtle' : 'control'}
              tint={variant === 'prominent' ? colors.accent : undefined}
              style={[styles.body, SIZE_STYLE[size]]}
            >
              {content}
            </GlassSurface>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);

GlassButton.displayName = 'GlassButton';

const styles = StyleSheet.create({
  bloom: {
    experimental_backgroundImage:
      'radial-gradient(circle, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 70%)',
    position: 'absolute',
  },
  body: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  clip: { borderRadius: GLASS_RADIUS.capsule, overflow: 'hidden', pointerEvents: 'none' },
  disabled: { opacity: 0.45 },
  label: { fontWeight: '600', letterSpacing: -0.1 },
  root: { alignSelf: 'flex-start' },
});
