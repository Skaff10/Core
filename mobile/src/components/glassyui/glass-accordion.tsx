import { ComponentRef,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { GlassPanel } from './glass-panel';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GlassIcon } from './lib/icons';
import { wrapPlainText } from './lib/plain-text';
import { GLASS_MOTION, GLASS_RADIUS } from './lib/tokens';
import { useControllableState } from './lib/use-controllable-state';

type SingleAccordionProps = {
  /** One item open at a time. The default. */
  type?: 'single';
  /** The open item's value, or an empty string for none. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Lets the open item close again, leaving none open. */
  collapsible?: boolean;
};

type MultipleAccordionProps = {
  /** Any number of items open at once. */
  type: 'multiple';
  /** The open items' values. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Every item of a multiple accordion can close. */
  collapsible?: never;
};

export type GlassAccordionProps = ViewProps &
  (SingleAccordionProps | MultipleAccordionProps) & {
    /** Turns off every item. */
    disabled?: boolean;
  };

type AccordionState = {
  /** Whether an open item can close. */
  collapsible: boolean;
  disabled: boolean;
  open: readonly string[];
  toggle: (item: string) => void;
};

type ItemState = {
  disabled: boolean;
  open: boolean;
  value: string;
};

const AccordionContext = createContext<AccordionState | null>(null);

const ItemContext = createContext<ItemState | null>(null);

// Arrivals ease out on the web's curve; exits ease in and run shorter.
const EASE_OUT = Easing.bezier(0.32, 0.72, 0, 1);

const EASE_IN = Easing.bezier(0.42, 0, 1, 1);

// CSS's own ease, which the web chevron turns on.
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

function useAccordion(component: string) {
  const accordion = useContext(AccordionContext);

  if (!accordion) throw new Error(`${component} must be used within GlassAccordion`);

  return accordion;
}

function useItem(component: string) {
  const item = useContext(ItemContext);

  if (!item) throw new Error(`${component} must be used within GlassAccordionItem`);

  return item;
}

/** A stack of items that open to show more, one at a time or several at once. */
export const GlassAccordion = forwardRef<ComponentRef<typeof View>, GlassAccordionProps>(
  (
    { collapsible = false, defaultValue, disabled = false, onValueChange, type, value, ...rest },
    ref,
  ) => {
    // Both kinds keep their own state; only the one `type` names is used.
    const [single, setSingle] = useControllableState(
      type === 'multiple' ? undefined : value,
      type === 'multiple' ? '' : (defaultValue ?? ''),
      type === 'multiple' ? undefined : onValueChange,
    );

    const [many, setMany] = useControllableState(
      type === 'multiple' ? value : undefined,
      type === 'multiple' ? (defaultValue ?? []) : [],
      type === 'multiple' ? onValueChange : undefined,
    );

    const toggle = useCallback(
      (item: string) => {
        if (type === 'multiple') {
          setMany(many.includes(item) ? many.filter((entry) => entry !== item) : [...many, item]);

          return;
        }

        if (item !== single) setSingle(item);
        else if (collapsible) setSingle('');
      },
      [collapsible, many, setMany, setSingle, single, type],
    );

    const open = useMemo(
      () => (type === 'multiple' ? many : single ? [single] : []),
      [many, single, type],
    );

    const state = useMemo(
      () => ({ collapsible: type === 'multiple' || collapsible, disabled, open, toggle }),
      [collapsible, disabled, open, toggle, type],
    );

    return (
      <AccordionContext.Provider value={state}>
        <View ref={ref} {...rest} />
      </AccordionContext.Provider>
    );
  },
);

GlassAccordion.displayName = 'GlassAccordion';

export type GlassAccordionItemProps = ViewProps & {
  disabled?: boolean;
  /** Names the item. The accordion's value holds the names of the open items. */
  value: string;
};

/** One item of an accordion: a trigger and the content it opens. */
export const GlassAccordionItem = forwardRef<ComponentRef<typeof View>, GlassAccordionItemProps>(
  ({ disabled = false, value, ...rest }, ref) => {
    const accordion = useAccordion('GlassAccordionItem');
    const open = accordion.open.includes(value);
    const off = accordion.disabled || disabled;
    const item = useMemo(() => ({ disabled: off, open, value }), [off, open, value]);

    return (
      <ItemContext.Provider value={item}>
        <View ref={ref} {...rest} />
      </ItemContext.Provider>
    );
  },
);

GlassAccordionItem.displayName = 'GlassAccordionItem';

export type GlassAccordionTriggerProps = Omit<PressableProps, 'children' | 'style'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** The glass row that opens and closes its item; its chevron turns to show which. */
export const GlassAccordionTrigger = forwardRef<ComponentRef<typeof View>, GlassAccordionTriggerProps>(
  ({ children, disabled, onPress, onPressIn, onPressOut, style, ...rest }, ref) => {
    const { colors, preferences } = useGlassTheme();
    const accordion = useAccordion('GlassAccordionTrigger');
    const item = useItem('GlassAccordionTrigger');
    const [turn] = useState(() => new Animated.Value(item.open ? 1 : 0));
    const [press] = useState(() => new Animated.Value(0));
    const off = Boolean(disabled) || item.disabled;
    const reduceMotion = preferences.reduceMotion;

    useEffect(() => {
      if (reduceMotion) {
        turn.setValue(item.open ? 1 : 0);

        return;
      }

      const animation = Animated.timing(turn, {
        duration: GLASS_MOTION.duration,
        easing: EASE,
        toValue: item.open ? 1 : 0,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      });

      animation.start();

      return () => animation.stop();
    }, [item.open, reduceMotion, turn]);

    const handlePress = useCallback(
      (event: GestureResponderEvent) => {
        onPress?.(event);
        accordion.toggle(item.value);
      },
      [accordion, item.value, onPress],
    );

    // A finger lights the glass, as it lights a button.
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
      },
      [onPressIn, press, reduceMotion],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        onPressOut?.(event);

        if (reduceMotion) {
          press.setValue(0);

          return;
        }

        Animated.timing(press, {
          duration: GLASS_MOTION.duration,
          easing: EASE,
          toValue: 0,
          useNativeDriver: GLASS_MOTION.nativeDriver,
        }).start();
      },
      [onPressOut, press, reduceMotion],
    );

    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        // An open item that cannot close announces itself as unavailable, as on the web.
        accessibilityState={{
          disabled: off || (item.open && !accordion.collapsible),
          expanded: item.open,
        }}
        disabled={off}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[off && styles.disabled, style]}
        {...rest}
      >
        <GlassSurface elevation="none" preset="control" style={styles.trigger}>
          <View style={[StyleSheet.absoluteFill, styles.clip]}>
            <Animated.View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.rim, opacity: press }]}
            />
          </View>
          <View style={styles.label}>
            {wrapPlainText(children, (text) => (
              <Text style={[styles.labelText, { color: colors.foreground }]}>{text}</Text>
            ))}
          </View>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
                },
              ],
            }}
          >
            <GlassIcon
              color={colors.mutedForeground}
              name="chevron-down"
              size={16}
              strokeWidth={1.6}
            />
          </Animated.View>
        </GlassSurface>
      </Pressable>
    );
  },
);

GlassAccordionTrigger.displayName = 'GlassAccordionTrigger';

export type GlassAccordionContentProps = ViewProps;

/**
 * The glass card an item opens, unrolling like a curtain; Reduce Motion opens and closes it at
 * once. `style` lays out what sits inside the card.
 */
export const GlassAccordionContent = forwardRef<ComponentRef<typeof View>, GlassAccordionContentProps>(
  ({ children, onLayout, style, ...rest }, ref) => {
    const { colors, preferences } = useGlassTheme();
    const item = useItem('GlassAccordionContent');
    const [height, setHeight] = useState(0);
    const [unfold] = useState(() => new Animated.Value(item.open ? 1 : 0));

    useEffect(() => {
      if (preferences.reduceMotion) {
        unfold.setValue(item.open ? 1 : 0);

        return;
      }

      const animation = Animated.timing(unfold, {
        duration: item.open ? 300 : 220,
        easing: item.open ? EASE_OUT : EASE_IN,
        toValue: item.open ? 1 : 0,
        // Height is layout, which only the JavaScript driver can animate.
        useNativeDriver: false,
      });

      animation.start();

      return () => animation.stop();
    }, [item.open, preferences.reduceMotion, unfold]);

    // The content keeps its full height inside the folded card, so it can be measured shut.
    const measure = useCallback(
      (event: LayoutChangeEvent) => {
        onLayout?.(event);
        setHeight(event.nativeEvent.layout.height);
      },
      [onLayout],
    );

    return (
      <Animated.View
        accessibilityElementsHidden={!item.open}
        importantForAccessibility={item.open ? 'auto' : 'no-hide-descendants'}
        style={{
          // Until the content is measured, an open item takes its natural height.
          height:
            height > 0
              ? unfold.interpolate({ inputRange: [0, 1], outputRange: [0, height] })
              : item.open
                ? undefined
                : 0,
          marginTop: unfold.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
          pointerEvents: item.open ? 'auto' : 'none',
        }}
      >
        {/* The card clips what it holds, not its own shadow, and shrinks with the row. */}
        <GlassPanel style={styles.card} variant="card">
          <View ref={ref} onLayout={measure} style={[styles.content, style]} {...rest}>
            {wrapPlainText(children, (text) => (
              <Text style={[styles.contentText, { color: colors.foreground }]}>{text}</Text>
            ))}
          </View>
        </GlassPanel>
      </Animated.View>
    );
  },
);

GlassAccordionContent.displayName = 'GlassAccordionContent';

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexShrink: 1, overflow: 'hidden', padding: 0 },
  clip: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.md,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  content: { flexShrink: 0, padding: 20 },
  contentText: { fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.45 },
  label: { flex: 1 },
  labelText: { fontSize: 16, fontWeight: '500', lineHeight: 24 },
  // The trigger shares the content card's corner radius, as on the web.
  trigger: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.md,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
