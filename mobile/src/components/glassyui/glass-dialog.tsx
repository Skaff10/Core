import { ComponentRef,
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  StyleSheet,
  useWindowDimensions,
  View,
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
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';

export type GlassDialogProps = ModalLayerRootProps;

export type GlassDialogTriggerProps = ModalLayerSlotProps;

export type GlassDialogCloseProps = ModalLayerSlotProps;

export type GlassDialogContentProps = ViewProps & {
  children?: ReactNode;
  /** Names the close button for assistive tech. Defaults to "Close dialog". */
  closeLabel?: string;
};

// The dialog rises 8 points into place as it grows from 96%; on exit it drops off the screen.
const ARRIVAL = { duration: 240, easing: LAYER_EASING.out };

const EXIT = { duration: 200, easing: LAYER_EASING.in };

/** Holds a dialog's open state for its trigger, content and close controls. */
export function GlassDialog(props: GlassDialogProps) {
  return <ModalLayerRoot {...props} />;
}

/** Opens the dialog when its single child, such as a GlassButton, is pressed. */
export function GlassDialogTrigger({ children }: GlassDialogTriggerProps) {
  return (
    <ModalLayerTrigger component="GlassDialogTrigger" root="GlassDialog">
      {children}
    </ModalLayerTrigger>
  );
}

/** Closes the dialog when its single child is pressed. */
export function GlassDialogClose({ children }: GlassDialogCloseProps) {
  return (
    <ModalLayerClose component="GlassDialogClose" root="GlassDialog">
      {children}
    </ModalLayerClose>
  );
}

type DialogLayerProps = GlassDialogContentProps & {
  onClose: () => void;
  onHidden: () => void;
  open: boolean;
  panelRef: ForwardedRef<ComponentRef<typeof View>>;
};

// Mounted while the dialog is on screen, so each opening starts from fresh values.
function DialogLayer({
  children,
  closeLabel = 'Close dialog',
  onClose,
  onHidden,
  open,
  panelRef,
  style,
  ...rest
}: DialogLayerProps) {
  const { preferences } = useGlassTheme();
  const insets = useSafeInsets();
  const { height, width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [drop] = useState(() => new Animated.Value(0));
  const reduceMotion = preferences.reduceMotion;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      drop.setValue(0);

      return;
    }

    const timing = open ? ARRIVAL : EXIT;

    const animation = Animated.parallel([
      Animated.timing(progress, {
        ...timing,
        toValue: open ? 1 : 0,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }),
      Animated.timing(drop, {
        ...timing,
        toValue: open ? 0 : 1,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished && !open) onHidden();
    });

    return () => animation.stop();
  }, [drop, onHidden, open, progress, reduceMotion]);

  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const fall = drop.interpolate({ inputRange: [0, 1], outputRange: [0, height] });

  return (
    <>
      <ModalLayerScrim onPress={onClose} progress={progress} />
      <View
        style={[
          { pointerEvents: 'box-none' },
          StyleSheet.absoluteFill,
          styles.stage,
          {
            paddingBottom: insets.bottom + 16,
            paddingEnd: insets.end + 16,
            paddingStart: insets.start + 16,
            paddingTop: insets.top + 16,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.frame,
            {
              transform: [
                { translateY: Animated.add(rise, fall) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <GlassSurface
            ref={panelRef}
            accessibilityViewIsModal
            elevation="raised"
            onAccessibilityEscape={onClose}
            preset="overlay"
            style={[styles.panel, { padding: width >= 640 ? 32 : 24 }, style]}
            {...rest}
          >
            {children}
            <ModalLayerCloseButton label={closeLabel} onPress={onClose} style={styles.close} />
          </GlassSurface>
        </Animated.View>
      </View>
    </>
  );
}

/** A modal glass panel that rises over a scrim, with a close button in its corner. */
export const GlassDialogContent = forwardRef<ComponentRef<typeof View>, GlassDialogContentProps>((props, ref) => {
  const { open, setOpen } = useModalLayer('GlassDialogContent', 'GlassDialog');
  const { preferences } = useGlassTheme();
  const [present, hide] = useLayerPresence(open, preferences.reduceMotion);
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <ModalLayerHost onRequestClose={close} present={present}>
      <DialogLayer {...props} onClose={close} onHidden={hide} open={open} panelRef={ref} />
    </ModalLayerHost>
  );
});

GlassDialogContent.displayName = 'GlassDialogContent';

/** The dialog's heading, announced as a header. */
export const GlassDialogTitle = forwardRef<ComponentRef<typeof Text>, TextProps>((props, ref) => (
  <ModalLayerTitle ref={ref} {...props} />
));

GlassDialogTitle.displayName = 'GlassDialogTitle';

/** The dialog's supporting text. */
export const GlassDialogDescription = forwardRef<ComponentRef<typeof Text>, TextProps>((props, ref) => (
  <ModalLayerDescription ref={ref} {...props} />
));

GlassDialogDescription.displayName = 'GlassDialogDescription';

const styles = StyleSheet.create({
  close: { end: 16, top: 16 },
  frame: { maxHeight: '100%', maxWidth: 520, width: '100%' },
  panel: { borderCurve: 'continuous', borderRadius: GLASS_RADIUS.lg, flexShrink: 1 },
  stage: { alignItems: 'center', justifyContent: 'center' },
});
