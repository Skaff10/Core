import { ComponentRef,
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  I18nManager,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type Text,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import {
  LAYER_EASING,
  ModalLayerClose,
  ModalLayerCloseButton,
  ModalLayerDescription,
  ModalLayerHost,
  ModalLayerRoot,
  ModalLayerScrim,
  ModalLayerTitle,
  ModalLayerTrigger,
  useLayerPresence,
  useModalLayer,
  useSafeInsets,
  type ModalLayerRootProps,
  type ModalLayerSlotProps,
} from './lib/modal-layer';
import { GLASS_MOTION } from './lib/tokens';

export type GlassSheetSide = 'top' | 'right' | 'bottom' | 'left';

export type GlassSheetProps = ModalLayerRootProps;

export type GlassSheetTriggerProps = ModalLayerSlotProps;

export type GlassSheetCloseProps = ModalLayerSlotProps;

export type GlassSheetContentProps = ViewProps & {
  children?: ReactNode;
  /** Names the close button for assistive tech. Defaults to "Close sheet". */
  closeLabel?: string;
  /**
   * The edge the sheet slides in from. Left and right follow the layout direction, so a left
   * sheet opens from the right in a right-to-left layout. Defaults to bottom.
   */
  side?: GlassSheetSide;
};

// The gap between the sheet and the screen's edges, and the panel's own padding.
const EDGE = 8;

const PAD = 24;

// A downward fling faster than this, in points per millisecond, dismisses the sheet.
const FLING_VELOCITY = 0.5;

// Where a drag of the grabber ended: its distance and its speed, in points per millisecond.
type GestureRelease = { dy: number; vy: number };

/** Holds a sheet's open state for its trigger, content and close controls. */
export function GlassSheet(props: GlassSheetProps) {
  return <ModalLayerRoot {...props} />;
}

/** Opens the sheet when its single child, such as a GlassButton, is pressed. */
export function GlassSheetTrigger({ children }: GlassSheetTriggerProps) {
  return (
    <ModalLayerTrigger component="GlassSheetTrigger" root="GlassSheet">
      {children}
    </ModalLayerTrigger>
  );
}

/** Closes the sheet when its single child is pressed. */
export function GlassSheetClose({ children }: GlassSheetCloseProps) {
  return (
    <ModalLayerClose component="GlassSheetClose" root="GlassSheet">
      {children}
    </ModalLayerClose>
  );
}

// Upward drags meet growing resistance instead of lifting the sheet off its edge.
function resist(distance: number) {
  return distance >= 0 ? distance : -Math.sqrt(-distance) * 2;
}

// Which way the sheet leaves: down and right are positive. A left sheet sits at the start edge.
function exitDirection(side: GlassSheetSide) {
  if (side === 'bottom') return 1;

  if (side === 'top') return -1;

  return (side === 'right') === !I18nManager.isRTL ? 1 : -1;
}

// Padding that keeps content clear of a safe-area inset the sheet's edge reaches into.
function clearOf(inset: number) {
  return Math.max(PAD, inset - EDGE);
}

type SheetLayerProps = GlassSheetContentProps & {
  onClose: () => void;
  onHidden: () => void;
  open: boolean;
  panelRef: ForwardedRef<ComponentRef<typeof View>>;
  side: GlassSheetSide;
};

// Mounted while the sheet is on screen, so each opening measures the sheet afresh.
function SheetLayer({
  children,
  closeLabel = 'Close sheet',
  onClose,
  onHidden,
  open,
  panelRef,
  side,
  style,
  ...rest
}: SheetLayerProps) {
  const { colors, preferences } = useGlassTheme();
  const insets = useSafeInsets();
  const { height, width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [extent, setExtent] = useState<number | null>(null);
  const [released, setReleased] = useState<GestureRelease | null>(null);
  const reduceMotion = preferences.reduceMotion;
  const vertical = side === 'top' || side === 'bottom';
  const measured = extent !== null;
  // Until the sheet has measured itself, a whole screen away keeps it out of sight.
  const travel = (extent ?? (vertical ? height : width)) + EDGE * 2;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      drag.setValue(0);

      return;
    }

    if (!measured) {
      // Closed before it was laid out, so there is nothing on screen to slide away.
      if (!open) onHidden();

      return;
    }

    const slide = Animated.timing(progress, {
      duration: open ? 500 : 300,
      easing: LAYER_EASING.out,
      toValue: open ? 1 : 0,
      useNativeDriver: GLASS_MOTION.nativeDriver,
    });

    // Reopened while dropping away after a drag, the sheet springs back to its edge too. A new
    // drag stops only that spring, not the slide.
    const animation = open
      ? Animated.parallel(
          [
            slide,
            Animated.spring(drag, {
              ...GLASS_MOTION.spring,
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
  }, [drag, measured, onHidden, open, progress, reduceMotion]);

  // The responder is built once, so a re-render mid-drag cannot reset the gesture. It hands each
  // release to an effect, which reads the latest props.
  const [grabber] = useState(() => {
    const release = (_event: GestureResponderEvent, gesture: PanResponderGestureState) =>
      setReleased({ dy: gesture.dy, vy: gesture.vy });

    return PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => drag.stopAnimation(),
      onPanResponderMove: (_event, gesture) => drag.setValue(resist(gesture.dy)),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
      onStartShouldSetPanResponder: () => true,
    });
  });

  const settle = useEffectEvent(({ dy, vy }: GestureRelease) => {
    // The exit continues from where the finger let go.
    if (resist(dy) > Math.min(120, (extent ?? 0) * 0.25) || vy > FLING_VELOCITY) {
      onClose();

      return;
    }

    if (reduceMotion) {
      drag.setValue(0);

      return;
    }

    Animated.spring(drag, {
      ...GLASS_MOTION.spring,
      toValue: 0,
      useNativeDriver: GLASS_MOTION.nativeDriver,
    }).start();
  });

  useEffect(() => {
    if (released) settle(released);
  }, [released]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height: sheetHeight, width: sheetWidth } = event.nativeEvent.layout;

    setExtent(vertical ? sheetHeight : sheetWidth);
  };

  const padding = {
    paddingBottom: side === 'top' ? PAD : clearOf(insets.bottom),
    paddingEnd: side === 'right' ? clearOf(insets.end) : PAD,
    paddingStart: side === 'left' ? clearOf(insets.start) : PAD,
    paddingTop: side === 'bottom' ? PAD : clearOf(insets.top),
  };

  // A sheet only moves along its own axis; only a bottom sheet is ever dragged.
  const offset = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [exitDirection(side) * travel, 0] }),
    drag,
  );

  return (
    <>
      <ModalLayerScrim onPress={onClose} progress={progress} />
      <View
        style={[
          { pointerEvents: 'box-none' },
          StyleSheet.absoluteFill,
          styles[side],
          vertical
            ? {
                paddingBottom: side === 'bottom' ? EDGE : insets.bottom + 40,
                paddingEnd: Math.max(EDGE, insets.end),
                paddingStart: Math.max(EDGE, insets.start),
                paddingTop: side === 'top' ? EDGE : insets.top + 40,
              }
            : styles.besideEdge,
        ]}
      >
        <Animated.View
          onLayout={handleLayout}
          style={[
            vertical ? styles.wideFrame : styles.tallFrame,
            { transform: vertical ? [{ translateY: offset }] : [{ translateX: offset }] },
          ]}
        >
          <GlassSurface
            ref={panelRef}
            accessibilityViewIsModal
            elevation="raised"
            onAccessibilityEscape={onClose}
            preset="overlay"
            style={[styles.panel, vertical ? styles.wide : styles.tall, padding, style]}
            {...rest}
          >
            {side === 'bottom' ? (
              <View {...grabber.panHandlers} style={styles.grabberZone}>
                <View style={[styles.grabber, { backgroundColor: colors.mutedForeground }]} />
              </View>
            ) : null}
            {children}
            <ModalLayerCloseButton
              label={closeLabel}
              onPress={onClose}
              style={{ end: padding.paddingEnd - EDGE, top: padding.paddingTop - EDGE }}
            />
          </GlassSurface>
        </Animated.View>
      </View>
    </>
  );
}

/** A modal glass panel that slides in from an edge; a bottom sheet drags down to dismiss. */
export const GlassSheetContent = forwardRef<ComponentRef<typeof View>, GlassSheetContentProps>(
  ({ side = 'bottom', ...props }, ref) => {
    const { open, setOpen } = useModalLayer('GlassSheetContent', 'GlassSheet');
    const { preferences } = useGlassTheme();
    const [present, hide] = useLayerPresence(open, preferences.reduceMotion);
    const close = useCallback(() => setOpen(false), [setOpen]);

    return (
      <ModalLayerHost onRequestClose={close} present={present}>
        <SheetLayer
          {...props}
          onClose={close}
          onHidden={hide}
          open={open}
          panelRef={ref}
          side={side}
        />
      </ModalLayerHost>
    );
  },
);

GlassSheetContent.displayName = 'GlassSheetContent';

/** The sheet's heading, announced as a header. */
export const GlassSheetTitle = forwardRef<ComponentRef<typeof Text>, TextProps>((props, ref) => (
  <ModalLayerTitle ref={ref} {...props} />
));

GlassSheetTitle.displayName = 'GlassSheetTitle';

/** The sheet's supporting text. */
export const GlassSheetDescription = forwardRef<ComponentRef<typeof Text>, TextProps>((props, ref) => (
  <ModalLayerDescription ref={ref} {...props} />
));

GlassSheetDescription.displayName = 'GlassSheetDescription';

const styles = StyleSheet.create({
  besideEdge: { padding: EDGE },
  bottom: { alignItems: 'center', justifyContent: 'flex-end' },
  grabber: { borderRadius: 2.5, height: 5, opacity: 0.5, width: 36 },
  // A 44-point strip across the top of a bottom sheet; the panel's top padding sits under it.
  grabberZone: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginHorizontal: -PAD,
    marginTop: -PAD,
  },
  left: { flexDirection: 'row', justifyContent: 'flex-start' },
  panel: { borderCurve: 'continuous', borderRadius: 40 },
  right: { flexDirection: 'row', justifyContent: 'flex-end' },
  tall: { flex: 1 },
  tallFrame: { maxWidth: 384, width: '100%' },
  top: { alignItems: 'center', justifyContent: 'flex-start' },
  wide: { flexShrink: 1 },
  wideFrame: { maxHeight: '100%', maxWidth: 640, width: '100%' },
});
