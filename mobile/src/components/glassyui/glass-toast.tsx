import { ComponentRef,
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useState,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { GlassPanel } from './glass-panel';
import { useGlassTheme } from './glass-provider';
import { GlassIcon } from './lib/icons';
import {
  CONTROL_SURFACE_PRESSED,
  LAYER_EASING,
  useLayerPresence,
  useSafeInsets,
} from './lib/modal-layer';
import { GLASS_MOTION } from './lib/tokens';
import { useControllableState } from './lib/use-controllable-state';

type ToastEntry = { element: ReactElement; id: string };

type ToastRegistry = {
  duration: number;
  remove: (id: string) => void;
  swipeThreshold: number;
  upsert: (id: string, element: ReactElement) => void;
};

const ToastRegistryContext = createContext<ToastRegistry | null>(null);

const ToastEntriesContext = createContext<readonly ToastEntry[] | null>(null);

// Dismisses the toast that a close or action control sits in.
const ToastDismissContext = createContext<(() => void) | null>(null);

// A flick up faster than this, in points per millisecond, dismisses a toast however short.
const FLING_VELOCITY = 0.5;

// Where a swipe ended: its distance and its speed, in points per millisecond.
type GestureRelease = { dy: number; vy: number };

// The dismiss button's fill under a finger, from liquid.css.
const CLOSE_PRESSED = { dark: 'rgba(255, 255, 255, 0.14)', light: 'rgba(0, 0, 0, 0.07)' } as const;

export type GlassToastProviderProps = {
  children?: ReactNode;
  /** How long a toast stays, in milliseconds. Infinity keeps it until dismissed. Defaults to 5000. */
  duration?: number;
  /** How far a swipe up must travel to dismiss a toast, in points. Defaults to 50. */
  swipeThreshold?: number;
};

/** Collects the toasts declared anywhere beneath it for GlassToastViewport to show. */
export function GlassToastProvider({
  children,
  duration = 5000,
  swipeThreshold = 50,
}: GlassToastProviderProps) {
  const [entries, setEntries] = useState<readonly ToastEntry[]>([]);

  const upsert = useCallback((id: string, element: ReactElement) => {
    setEntries((current) =>
      current.some((entry) => entry.id === id)
        ? current.map((entry) => (entry.id === id ? { element, id } : entry))
        : [...current, { element, id }],
    );
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const registry = useMemo(
    () => ({ duration, remove, swipeThreshold, upsert }),
    [duration, remove, swipeThreshold, upsert],
  );

  return (
    <ToastRegistryContext.Provider value={registry}>
      <ToastEntriesContext.Provider value={entries}>{children}</ToastEntriesContext.Provider>
    </ToastRegistryContext.Provider>
  );
}

function useToastRegistry() {
  const registry = useContext(ToastRegistryContext);

  if (!registry) throw new Error('GlassToast must be used within GlassToastProvider');

  return registry;
}

function useToastEntries() {
  const entries = useContext(ToastEntriesContext);

  if (!entries) throw new Error('GlassToastViewport must be used within GlassToastProvider');

  return entries;
}

function useToastDismiss(component: string) {
  const dismiss = useContext(ToastDismissContext);

  if (!dismiss) throw new Error(`${component} must be used within GlassToast`);

  return dismiss;
}

/** Shows the provider's toasts at the top of the screen. Place it once, near the app root. */
export const GlassToastViewport = forwardRef<ComponentRef<typeof View>, ViewProps>(({ style, ...rest }, ref) => {
  const entries = useToastEntries();
  const insets = useSafeInsets();

  return (
    <View
      ref={ref}
      style={[
        { pointerEvents: 'box-none' },
        styles.viewport,
        {
          paddingEnd: insets.end + 16,
          paddingStart: insets.start + 16,
          paddingTop: insets.top + 8,
        },
        style,
      ]}
      {...rest}
    >
      {entries.map((entry) => entry.element)}
    </View>
  );
});

GlassToastViewport.displayName = 'GlassToastViewport';

export type GlassToastProps = ViewProps & {
  children?: ReactNode;
  /** Whether it shows when it mounts, unless `open` is set. Defaults to true, as on the web. */
  defaultOpen?: boolean;
  /** Overrides the provider's duration for this toast. */
  duration?: number;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

type ToastTextSource = { altText?: string; children?: ReactNode };

// What a screen reader hears when a toast appears: its words, with an action's altText in place
// of the button, as on the web.
function toastText(node: ReactNode): string {
  const words: string[] = [];

  for (const child of Children.toArray(node)) {
    if (!isValidElement<ToastTextSource>(child)) {
      words.push(String(child));
    } else if (child.type === GlassToastAction) {
      words.push(child.props.altText ?? '');
    } else if (child.type !== GlassToastClose) {
      words.push(toastText(child.props.children));
    }
  }

  return words.filter(Boolean).join(' ');
}

/** A glass notification, shown in the viewport, that leaves after its duration or a swipe up. */
export const GlassToast = forwardRef<ComponentRef<typeof View>, GlassToastProps>(
  ({ children, defaultOpen = true, duration, onOpenChange, open, ...rest }, ref) => {
    const registry = useToastRegistry();
    const id = useId();
    const [isOpen, setOpen] = useControllableState(open, defaultOpen, onOpenChange);
    const { remove, upsert } = registry;

    const element = (
      <ToastCard
        key={id}
        announcement={toastText(children)}
        duration={duration ?? registry.duration}
        onOpenChange={setOpen}
        open={isOpen}
        panelRef={ref}
        swipeThreshold={registry.swipeThreshold}
        {...rest}
      >
        {children}
      </ToastCard>
    );

    // React Native has no portals: every render hands the viewport this toast's latest props.
    useEffect(() => {
      upsert(id, element);
    });

    useEffect(() => () => remove(id), [id, remove]);

    return null;
  },
);

GlassToast.displayName = 'GlassToast';

type ToastCardProps = ViewProps & {
  announcement: string;
  children?: ReactNode;
  duration: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  panelRef: ForwardedRef<ComponentRef<typeof View>>;
  swipeThreshold: number;
};

// Keeps a closing toast in the viewport until it has slid away.
function ToastCard({ open, ...props }: ToastCardProps) {
  const { preferences } = useGlassTheme();
  const [present, hide] = useLayerPresence(open, preferences.reduceMotion);

  return present ? <ToastLayer {...props} onHidden={hide} open={open} /> : null;
}

type ToastLayerProps = ToastCardProps & { onHidden: () => void };

// Mounted while the toast is on screen, so each showing measures the toast afresh.
function ToastLayer({
  announcement,
  children,
  duration,
  onHidden,
  onOpenChange,
  open,
  panelRef,
  style,
  swipeThreshold,
  ...rest
}: ToastLayerProps) {
  const { colors, preferences } = useGlassTheme();
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [swipe] = useState(() => new Animated.Value(0));
  // How far the toast's lower edge sits below the viewport's top, once it has been laid out.
  const [reach, setReach] = useState<number | null>(null);
  // A finger is on the toast, so its timer waits.
  const [held, setHeld] = useState(false);
  const [released, setReleased] = useState<GestureRelease | null>(null);
  const reduceMotion = preferences.reduceMotion;
  const measured = reach !== null;
  // Until the toast has measured itself, a whole screen up keeps it out of sight.
  const travel = (reach ?? height) + 16;
  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);
  const expire = useEffectEvent(() => onOpenChange(false));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      swipe.setValue(0);

      return;
    }

    if (!measured) {
      // Closed before it was laid out, so there is nothing on screen to slide away.
      if (!open) onHidden();

      return;
    }

    const slide = Animated.timing(progress, {
      duration: open ? 420 : 220,
      easing: open ? LAYER_EASING.out : LAYER_EASING.in,
      toValue: open ? 1 : 0,
      useNativeDriver: GLASS_MOTION.nativeDriver,
    });

    // Shown again after a fling, the toast comes back from where it flew. A new swipe stops only
    // that return, not the slide.
    const animation = open
      ? Animated.parallel(
          [
            slide,
            Animated.timing(swipe, {
              duration: 420,
              easing: LAYER_EASING.out,
              toValue: 0,
              useNativeDriver: GLASS_MOTION.nativeDriver,
            }),
          ],
          { stopTogether: false },
        )
      : slide;

    animation.start(({ finished }) => {
      if (finished && !open) onHidden();
    });

    return () => animation.stop();
  }, [measured, onHidden, open, progress, reduceMotion, swipe]);

  useEffect(() => {
    if (!open || held || !Number.isFinite(duration) || duration <= 0) return;

    const timer = setTimeout(() => expire(), duration);

    return () => clearTimeout(timer);
  }, [duration, held, open]);

  // Android reads the toast through its polite live region; iOS has no live regions, so the
  // toast announces itself there. Doing both would read it twice on Android.
  useEffect(() => {
    if (Platform.OS !== 'android' && open && announcement) {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, open]);

  // The responder is built once, so a re-render mid-swipe cannot reset the gesture. It hands each
  // release to an effect, which reads the latest props.
  const [swiper] = useState(() => {
    const release = (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      setHeld(false);
      setReleased({ dy: gesture.dy, vy: gesture.vy });
    };

    return PanResponder.create({
      // Only a swipe up moves the toast, so taps reach its buttons.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        swipe.stopAnimation();
        setHeld(true);
      },
      onPanResponderMove: (_event, gesture) => swipe.setValue(Math.min(0, gesture.dy)),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
    });
  });

  const settle = useEffectEvent(({ dy, vy }: GestureRelease) => {
    if (-dy > swipeThreshold || vy < -FLING_VELOCITY) {
      if (reduceMotion) {
        dismiss();

        return;
      }

      Animated.timing(swipe, {
        duration: 160,
        easing: LAYER_EASING.out,
        toValue: -travel,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }).start(({ finished }) => {
        if (finished) dismiss();
      });

      return;
    }

    if (reduceMotion) {
      swipe.setValue(0);

      return;
    }

    Animated.spring(swipe, {
      ...GLASS_MOTION.spring,
      toValue: 0,
      useNativeDriver: GLASS_MOTION.nativeDriver,
    }).start();
  });

  useEffect(() => {
    if (released) settle(released);
  }, [released]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height: toastHeight, y } = event.nativeEvent.layout;

    setReach(y + toastHeight);
  };

  // The dismiss button stands beside the words, not under them.
  const message: ReactNode[] = [];
  const closers: ReactNode[] = [];

  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === GlassToastClose) {
      closers.push(child);
    } else {
      message.push(child);
    }
  }

  return (
    <ToastDismissContext.Provider value={dismiss}>
      <Animated.View
        {...swiper.panHandlers}
        onLayout={handleLayout}
        style={[
          styles.slot,
          {
            transform: [
              {
                translateY: Animated.add(
                  progress.interpolate({ inputRange: [0, 1], outputRange: [-travel, 0] }),
                  swipe,
                ),
              },
            ],
          },
        ]}
      >
        <GlassPanel
          ref={panelRef}
          accessibilityLiveRegion="polite"
          elevation="raised"
          preset="overlay"
          variant="card"
          style={[styles.toast, style]}
          {...rest}
        >
          <View style={styles.message}>
            {setInText(message, [styles.messageText, { color: colors.foreground }])}
          </View>
          {closers}
        </GlassPanel>
      </Animated.View>
    </ToastDismissContext.Provider>
  );
}

// React Native renders a bare string only inside Text.
function setInText(children: ReactNode, style: StyleProp<TextStyle>) {
  return Children.map(children, (child) =>
    child === null || child instanceof Object ? child : <Text style={style}>{child}</Text>,
  );
}

/** The toast's headline. */
export const GlassToastTitle = forwardRef<ComponentRef<typeof Text>, TextProps>(({ style, ...rest }, ref) => {
  const { colors } = useGlassTheme();

  return <Text ref={ref} style={[styles.title, { color: colors.foreground }, style]} {...rest} />;
});

GlassToastTitle.displayName = 'GlassToastTitle';

/** The toast's supporting text. */
export const GlassToastDescription = forwardRef<ComponentRef<typeof Text>, TextProps>(({ style, ...rest }, ref) => {
  const { colors } = useGlassTheme();

  return (
    <Text
      ref={ref}
      style={[styles.description, { color: colors.mutedForeground }, style]}
      {...rest}
    />
  );
});

GlassToastDescription.displayName = 'GlassToastDescription';

export type GlassToastActionProps = Omit<PressableProps, 'children' | 'style'> & {
  /**
   * How to do the same without the button, for screen-reader users who may not reach it before
   * the toast leaves. It is announced with the toast and read as the button's hint.
   */
  altText: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A pill under the message, such as Undo. Pressing it runs `onPress` and dismisses the toast. */
export const GlassToastAction = forwardRef<ComponentRef<typeof View>, GlassToastActionProps>(
  ({ altText, children, onPress, onPressIn, onPressOut, style, ...rest }, ref) => {
    const dismiss = useToastDismiss('GlassToastAction');
    const { colors, preferences } = useGlassTheme();
    const [scale] = useState(() => new Animated.Value(1));

    const settle = (toValue: number) => {
      if (preferences.reduceMotion) return;

      Animated.spring(scale, {
        ...GLASS_MOTION.spring,
        toValue,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }).start();
    };

    return (
      <Pressable
        ref={ref}
        accessibilityHint={altText}
        accessibilityRole="button"
        hitSlop={7}
        onPress={(event) => {
          onPress?.(event);
          dismiss();
        }}
        onPressIn={(event) => {
          onPressIn?.(event);
          settle(0.94);
        }}
        onPressOut={(event) => {
          onPressOut?.(event);
          settle(1);
        }}
        style={[styles.actionRoot, style]}
        {...rest}
      >
        <Animated.View
          style={[
            styles.action,
            {
              backgroundColor: CONTROL_SURFACE_PRESSED[preferences.theme],
              boxShadow: `inset 0px 0px 0px 1px ${colors.border}`,
              transform: [{ scale }],
            },
          ]}
        >
          <Text numberOfLines={1} style={[styles.actionLabel, { color: colors.foreground }]}>
            {children}
          </Text>
        </Animated.View>
      </Pressable>
    );
  },
);

GlassToastAction.displayName = 'GlassToastAction';

export type GlassToastCloseProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Replaces the drawn ×; its text then names the button. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A round button that dismisses the toast. It draws its own × and is named "Dismiss". */
export const GlassToastClose = forwardRef<ComponentRef<typeof View>, GlassToastCloseProps>(
  ({ accessibilityLabel, children, onPress, style, ...rest }, ref) => {
    const dismiss = useToastDismiss('GlassToastClose');
    const { colors, preferences } = useGlassTheme();
    const drawn = children === undefined;

    return (
      <Pressable
        ref={ref}
        accessibilityLabel={accessibilityLabel ?? (drawn ? 'Dismiss' : undefined)}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          onPress?.(event);
          dismiss();
        }}
        style={({ pressed }) => [
          styles.close,
          !drawn && styles.closeWithText,
          pressed && { backgroundColor: CLOSE_PRESSED[preferences.theme] },
          style,
        ]}
        {...rest}
      >
        {({ pressed }) =>
          drawn ? (
            <GlassIcon
              color={pressed ? colors.foreground : colors.mutedForeground}
              name="close"
              size={16}
              strokeWidth={1.6}
            />
          ) : (
            setInText(children, [
              styles.closeLabel,
              { color: pressed ? colors.foreground : colors.mutedForeground },
            ])
          )
        }
      </Pressable>
    );
  },
);

GlassToastClose.displayName = 'GlassToastClose';

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  // A 30-point pill answers a 44-point touch.
  actionRoot: { alignSelf: 'flex-start', marginTop: 10 },
  close: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    marginEnd: -6,
    marginStart: 12,
    marginTop: -4,
    minWidth: 28,
  },
  closeLabel: { fontSize: 13, fontWeight: '600' },
  closeWithText: { paddingHorizontal: 8 },
  description: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  message: { flex: 1 },
  messageText: { fontSize: 14, lineHeight: 20 },
  slot: { maxWidth: 352, width: '100%' },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  toast: { alignItems: 'flex-start', flexDirection: 'row' },
  viewport: {
    alignItems: 'center',
    gap: 12,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
});
