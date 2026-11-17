import { ComponentRef,
  Children,
  cloneElement,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  type AccessibilityState,
  type GestureResponderEvent,
  type ModalProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useGlassTheme } from '../glass-provider';
import { GlassIcon } from './icons';
import { useControllableState } from './use-controllable-state';

/** Arrivals ease out on the library's curve (`--lg-ease-out`); exits ease in. */
export const LAYER_EASING = {
  in: Easing.bezier(0.42, 0, 1, 1),
  out: Easing.bezier(0.32, 0.72, 0, 1),
};

/** The fill of a control on glass under a finger (`--lg-control-surface-hover`). */
export const CONTROL_SURFACE_PRESSED = {
  dark: 'rgba(245, 245, 247, 0.14)',
  light: 'rgba(255, 255, 255, 0.95)',
} as const;

// Without these, iOS turns a landscape screen back to portrait while a layer is open.
const ORIENTATIONS = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
] satisfies ModalProps['supportedOrientations'];

/**
 * The screen's safe-area insets, with start and end following the layout direction. Reads the
 * nearest SafeAreaProvider, or the window's first measurement when there is none.
 */
export function useSafeInsets() {
  const insets = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets;
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;

  return {
    bottom: insets?.bottom ?? 0,
    end: I18nManager.isRTL ? left : right,
    start: I18nManager.isRTL ? right : left,
    top: insets?.top ?? 0,
  };
}

/**
 * Whether a layer is on screen. It turns true with `open` and stays true until the layer calls
 * `hide` at the end of its exit, so the exit can play. Under Reduce Motion it turns false at once.
 */
export function useLayerPresence(open: boolean, reduceMotion: boolean) {
  const [present, setPresent] = useState(open);

  if (open && !present) setPresent(true);

  if (!open && present && reduceMotion) setPresent(false);

  const hide = useCallback(() => setPresent(false), []);

  return [present, hide] as const;
}

type ModalLayerState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ModalLayerContext = createContext<ModalLayerState | null>(null);

export type ModalLayerRootProps = {
  children?: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

/** Holds a modal layer's open state for its trigger, content and close controls. */
export function ModalLayerRoot({
  children,
  defaultOpen = false,
  onOpenChange,
  open,
}: ModalLayerRootProps) {
  const [current, setOpen] = useControllableState(open, defaultOpen, onOpenChange);
  const value = useMemo(() => ({ open: current, setOpen }), [current, setOpen]);

  return <ModalLayerContext.Provider value={value}>{children}</ModalLayerContext.Provider>;
}

/** The nearest modal layer's state. `component` and `root` name the parts in the error. */
export function useModalLayer(component: string, root: string) {
  const context = useContext(ModalLayerContext);

  if (!context) throw new Error(`${component} must be used within ${root}`);

  return context;
}

type PressableChildProps = {
  accessibilityState?: AccessibilityState;
  onPress?: ((event: GestureResponderEvent) => void) | null;
};

export type ModalLayerSlotProps = {
  /** One pressable element, such as a GlassButton. It keeps its own onPress. */
  children: ReactElement<PressableChildProps>;
};

type SlotOwnerProps = ModalLayerSlotProps & {
  component: string;
  root: string;
};

/** Gives its child an onPress that toggles the layer, and tells assistive tech whether it is open. */
export function ModalLayerTrigger({ children, component, root }: SlotOwnerProps) {
  const { open, setOpen } = useModalLayer(component, root);
  const child = Children.only(children);

  return cloneElement(child, {
    accessibilityState: { ...child.props.accessibilityState, expanded: open },
    onPress: (event: GestureResponderEvent) => {
      child.props.onPress?.(event);
      setOpen(!open);
    },
  });
}

/** Gives its child an onPress that closes the layer. */
export function ModalLayerClose({ children, component, root }: SlotOwnerProps) {
  const { setOpen } = useModalLayer(component, root);
  const child = Children.only(children);

  return cloneElement(child, {
    onPress: (event: GestureResponderEvent) => {
      child.props.onPress?.(event);
      setOpen(false);
    },
  });
}

type ModalLayerHostProps = {
  children: ReactNode;
  /** Android's back button and the web's Escape key. */
  onRequestClose: () => void;
  present: boolean;
};

/** React Native's Modal, set up for a layer that draws its own scrim and animates itself. */
export function ModalLayerHost({ children, onRequestClose, present }: ModalLayerHostProps) {
  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onRequestClose}
      statusBarTranslucent
      supportedOrientations={ORIENTATIONS}
      transparent
      visible={present}
    >
      {present ? children : null}
    </Modal>
  );
}

type ModalLayerScrimProps = {
  onPress: () => void;
  /** 0 hidden, 1 shown. */
  progress: Animated.Value;
};

/** The dimmed backdrop behind a modal layer. It fades with `progress`; a tap on it closes the layer. */
export function ModalLayerScrim({ onPress, progress }: ModalLayerScrimProps) {
  const { colors } = useGlassTheme();

  return (
    <>
      <Animated.View
        style={[
          { pointerEvents: 'none' },
          StyleSheet.absoluteFill,
          { backgroundColor: colors.scrim, opacity: progress },
        ]}
      />
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

type ModalLayerCloseButtonProps = {
  label: string;
  onPress: () => void;
  /** Places the button; it is absolutely positioned. */
  style?: StyleProp<ViewStyle>;
};

/** The round close button in a layer's top corner, with a 44-point target. */
export function ModalLayerCloseButton({ label, onPress, style }: ModalLayerCloseButtonProps) {
  const { colors, preferences } = useGlassTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.close,
        {
          backgroundColor: pressed
            ? CONTROL_SURFACE_PRESSED[preferences.theme]
            : colors.controlSurface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <GlassIcon
          color={pressed ? colors.foreground : colors.mutedForeground}
          name="close"
          size={16}
          strokeWidth={1.6}
        />
      )}
    </Pressable>
  );
}

/** A layer's heading, announced as a header and kept clear of the close button. */
export const ModalLayerTitle = forwardRef<ComponentRef<typeof Text>, TextProps>(({ style, ...rest }, ref) => {
  const { colors } = useGlassTheme();

  return (
    <Text
      ref={ref}
      accessibilityRole="header"
      style={[styles.title, { color: colors.foreground }, style]}
      {...rest}
    />
  );
});

ModalLayerTitle.displayName = 'ModalLayerTitle';

/** A layer's supporting text, in the muted ink. */
export const ModalLayerDescription = forwardRef<ComponentRef<typeof Text>, TextProps>(({ style, ...rest }, ref) => {
  const { colors } = useGlassTheme();

  return (
    <Text
      ref={ref}
      style={[styles.description, { color: colors.mutedForeground }, style]}
      {...rest}
    />
  );
});

ModalLayerDescription.displayName = 'ModalLayerDescription';

const styles = StyleSheet.create({
  close: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    width: 36,
  },
  description: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  // The close button sits 16 points in from the corner; the title stops 8 points short of it.
  title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, lineHeight: 25, paddingEnd: 36 },
});
