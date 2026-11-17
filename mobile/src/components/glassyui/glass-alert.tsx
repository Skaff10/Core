import { ComponentRef, forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GlassIcon } from './lib/icons';
import { wrapPlainText } from './lib/plain-text';
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';

export type GlassAlertTone = 'info' | 'success' | 'warning' | 'danger';

export type GlassAlertProps = ViewProps & {
  /** Names the close button. Defaults to "Dismiss". */
  dismissLabel?: string;
  /** Replaces the tone's icon. Pass `false` for none. */
  icon?: ReactNode | false;
  /**
   * Shows a close button. The alert folds away, then this runs: remove the alert here, and give
   * each alert a stable `key` so a later one never inherits the fold.
   */
  onDismiss?: () => void;
  title?: ReactNode;
  tone?: GlassAlertTone;
};

// The alert's own palette: the badge's tones, tinting the glass. Each keeps 4.5:1 text over a
// white or black backdrop in both themes.
const TONES = {
  dark: {
    info: { fill: 'rgb(13, 44, 82)', ink: '#b2d6ff', tint: '0, 103, 217' },
    success: { fill: 'rgb(22, 60, 48)', ink: '#7cebc0', tint: '51, 214, 159' },
    warning: { fill: 'rgb(70, 54, 22)', ink: '#ffd27a', tint: '255, 189, 56' },
    danger: { fill: 'rgb(76, 30, 44)', ink: '#ffa6b7', tint: '255, 92, 122' },
  },
  light: {
    info: { fill: 'rgb(229, 241, 255)', ink: '#0054b3', tint: '0, 103, 217' },
    success: { fill: 'rgb(224, 247, 238)', ink: '#08603f', tint: '20, 168, 116' },
    warning: { fill: 'rgb(255, 243, 219)', ink: '#824c00', tint: '232, 150, 12' },
    danger: { fill: 'rgb(255, 229, 236)', ink: '#a8113a', tint: '232, 52, 90' },
  },
} as const;

const HIGHLIGHT = { dark: 'rgba(255, 255, 255, 0.12)', light: 'rgba(255, 255, 255, 0.9)' } as const;

// The close button lights under a finger, as it does under the web's pointer.
const CLOSE_PRESSED = { dark: 'rgba(255, 255, 255, 0.14)', light: 'rgba(0, 0, 0, 0.07)' } as const;

const RADIUS = 18;

// The row folds on the web's ease-out curve while the content fades out faster, easing in.
const EASE_OUT = Easing.bezier(0.32, 0.72, 0, 1);

const EASE_IN = Easing.bezier(0.42, 0, 1, 1);

const FOLD_MS = 240;

const FADE_MS = 160;

/**
 * A short message set in tinted glass. On Android, warnings and errors interrupt the screen reader;
 * the other tones wait their turn.
 */
export const GlassAlert = forwardRef<ComponentRef<typeof View>, GlassAlertProps>(
  (
    {
      children,
      dismissLabel = 'Dismiss',
      icon,
      onDismiss,
      style,
      testID,
      title,
      tone = 'info',
      ...rest
    },
    ref,
  ) => {
    const { colors, preferences } = useGlassTheme();
    const palette = TONES[preferences.theme][tone];
    const radius = StyleSheet.flatten(style)?.borderRadius ?? RADIUS;
    const [height, setHeight] = useState(0);
    const [folding, setFolding] = useState(false);
    const [fold] = useState(() => new Animated.Value(1));
    const [fade] = useState(() => new Animated.Value(1));

    // The fold ends in the handler the caller has now, not the one they had at the press, and it
    // ends once.
    const dismissed = useRef(onDismiss);
    const finished = useRef(false);

    useEffect(() => {
      dismissed.current = onDismiss;
    }, [onDismiss]);

    // Unmounting stops the fold, so a caller who removed the alert first is not told about it.
    useEffect(
      () => () => {
        fade.stopAnimation();
        fold.stopAnimation();
      },
      [fade, fold],
    );

    const measure = useCallback(
      (event: LayoutChangeEvent) => {
        if (!folding) setHeight(event.nativeEvent.layout.height);
      },
      [folding],
    );

    const dismiss = useCallback(() => {
      if (folding) return;

      if (preferences.reduceMotion) {
        onDismiss?.();

        return;
      }

      setFolding(true);
      // The glass keeps its backdrop, so only the content fades; the glass folds with the row.
      Animated.timing(fade, {
        duration: FADE_MS,
        easing: EASE_IN,
        toValue: 0,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }).start();
      // The row shrinks to nothing, so what is below the alert slides up instead of jumping.
      Animated.timing(fold, {
        duration: FOLD_MS,
        easing: EASE_OUT,
        toValue: 0,
        // Height is layout, which only the JavaScript driver can animate.
        useNativeDriver: false,
      }).start(({ finished: done }) => {
        if (!done || finished.current) return;

        finished.current = true;
        dismissed.current?.();
      });
    }, [fade, fold, folding, onDismiss, preferences.reduceMotion]);

    return (
      <Animated.View
        onLayout={measure}
        style={
          folding
            ? {
                height: fold.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
                overflow: 'hidden',
              }
            : null
        }
      >
        <GlassSurface
          ref={ref}
          accessibilityLiveRegion={tone === 'warning' || tone === 'danger' ? 'assertive' : 'polite'}
          accessibilityRole="alert"
          elevation="none"
          preset="standard"
          style={[styles.alert, style]}
          testID={testID}
          tint={palette.fill}
          {...rest}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.ring,
              {
                borderRadius: radius,
                boxShadow: `inset 0px 1px 0px ${HIGHLIGHT[preferences.theme]}, inset 0px 0px 0px 0.5px rgba(${palette.tint}, 0.45)`,
              },
            ]}
          />
          <Animated.View style={[styles.row, { opacity: fade }]}>
            {icon === false ? null : (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.icon}
              >
                {icon ?? <GlassIcon color={palette.ink} name={tone} strokeWidth={1.6} />}
              </View>
            )}
            <View style={styles.body}>
              {title
                ? wrapPlainText(title, (text) => (
                    <Text style={[styles.title, { color: colors.foreground }]}>{text}</Text>
                  ))
                : null}
              {children
                ? wrapPlainText(children, (text) => (
                    <Text style={[styles.text, { color: colors.mutedForeground }]}>{text}</Text>
                  ))
                : null}
            </View>
            {onDismiss ? (
              <Pressable
                accessibilityLabel={dismissLabel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={dismiss}
                style={({ pressed }) => [
                  styles.close,
                  pressed && { backgroundColor: CLOSE_PRESSED[preferences.theme], opacity: 1 },
                ]}
                testID={testID ? `${testID}-dismiss` : undefined}
              >
                <GlassIcon color={colors.foreground} name="close" size={16} strokeWidth={1.6} />
              </Pressable>
            ) : null}
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    );
  },
);

GlassAlert.displayName = 'GlassAlert';

const styles = StyleSheet.create({
  alert: {
    borderCurve: 'continuous',
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  body: { flex: 1, gap: 2, minWidth: 0 },
  // A 28-point circle that still answers a 44-point touch, set into the first line's height.
  close: {
    alignItems: 'center',
    borderRadius: GLASS_RADIUS.capsule,
    height: 28,
    justifyContent: 'center',
    marginEnd: -6,
    marginVertical: -4,
    opacity: 0.7,
    width: 28,
  },
  icon: { height: 20, marginTop: 1, width: 20 },
  ring: { borderCurve: 'continuous', pointerEvents: 'none' },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  text: { fontSize: 15, lineHeight: 21 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
});
