import { ComponentRef,
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GLASS_RADIUS } from './lib/tokens';
import { useControllableState } from './lib/use-controllable-state';
import { useSelectionIndicator } from './lib/use-selection-indicator';

type SegmentedContextValue = {
  disabled: boolean;
  forgetItem: (value: string) => void;
  onItemLayout: (value: string, layout: LayoutRectangle) => void;
  select: (value: string) => void;
  selected: string;
};

const SegmentedContext = createContext<SegmentedContextValue | null>(null);

function useSegmentedControl() {
  const context = useContext(SegmentedContext);

  if (!context) {
    throw new Error('GlassSegmentedControlItem must be used within GlassSegmentedControl');
  }

  return context;
}

// The raised bubble under the chosen option, from .lg-segmented-indicator.
const BUBBLE = {
  dark: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    boxShadow:
      'inset 0px 1px 0px rgba(255, 255, 255, 0.22), inset 0px -1px 0px rgba(0, 0, 0, 0.12), 0px 1px 3px rgba(0, 0, 0, 0.24), 0px 4px 12px -4px rgba(0, 0, 0, 0.4)',
  },
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    boxShadow:
      'inset 0px 1px 0px rgba(255, 255, 255, 0.9), 0px 1px 3px rgba(0, 0, 0, 0.1), 0px 4px 12px -4px rgba(0, 0, 0, 0.16)',
  },
} as const;

// Light glass over a pale backdrop would hide the white bubble, so the track sinks into a faint
// slate well.
const LIGHT_WELL = 'rgba(100, 108, 140, 0.12)';

const INSET = 3;

export type GlassSegmentedControlProps = ViewProps & {
  defaultValue?: string;
  /** Turns every option off. */
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  value?: string;
};

/**
 * A single choice from two to six options, in a glass capsule. A raised bubble springs between
 * the options; Reduce Motion moves it at once.
 */
export const GlassSegmentedControl = forwardRef<ComponentRef<typeof View>, GlassSegmentedControlProps>(
  (
    { children, defaultValue, disabled = false, onLayout, onValueChange, style, value, ...rest },
    ref,
  ) => {
    const { preferences } = useGlassTheme();
    const [selected, select] = useControllableState(value, defaultValue ?? '', onValueChange);

    const { forgetItem, onItemLayout, onTrackLayout, placement } = useSelectionIndicator(
      selected,
      preferences.reduceMotion,
    );

    const handleLayout = useCallback(
      (event: LayoutChangeEvent) => {
        onTrackLayout(event);
        onLayout?.(event);
      },
      [onLayout, onTrackLayout],
    );

    const context = useMemo(
      () => ({ disabled, forgetItem, onItemLayout, select, selected }),
      [disabled, forgetItem, onItemLayout, select, selected],
    );

    return (
      <SegmentedContext.Provider value={context}>
        <GlassSurface
          ref={ref}
          accessibilityRole="radiogroup"
          accessibilityState={{ disabled }}
          elevation="base"
          onLayout={handleLayout}
          preset="control"
          style={[styles.track, style]}
          {...rest}
        >
          {preferences.theme === 'light' && !preferences.reduceTransparency ? (
            <View
              style={[
                { pointerEvents: 'none' },
                StyleSheet.absoluteFill,
                styles.round,
                { backgroundColor: LIGHT_WELL },
              ]}
            />
          ) : null}
          {placement ? (
            <Animated.View
              style={[
                { pointerEvents: 'none' },
                styles.indicator,
                BUBBLE[preferences.theme],
                {
                  height: placement.height,
                  top: placement.top,
                  width: placement.width,
                  transform: [{ translateX: placement.offset }],
                },
              ]}
            />
          ) : null}
          {children}
        </GlassSurface>
      </SegmentedContext.Provider>
    );
  },
);

GlassSegmentedControl.displayName = 'GlassSegmentedControl';

export type GlassSegmentedControlItemProps = Omit<
  PressableProps,
  'children' | 'onPress' | 'style'
> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  value: string;
};

/** One option in a GlassSegmentedControl. Plain text children are set as its label. */
export const GlassSegmentedControlItem = forwardRef<ComponentRef<typeof View>, GlassSegmentedControlItemProps>(
  ({ children, disabled, onLayout, style, value, ...rest }, ref) => {
    const { colors } = useGlassTheme();
    const control = useSegmentedControl();
    const layout = useRef<LayoutRectangle | null>(null);
    const { forgetItem, onItemLayout, select } = control;
    const checked = control.selected === value;
    const off = control.disabled || Boolean(disabled);

    // Re-registers under a new value, and leaves the indicator nothing to find once unmounted.
    useEffect(() => {
      if (layout.current) onItemLayout(value, layout.current);

      return () => forgetItem(value);
    }, [forgetItem, onItemLayout, value]);

    const handleLayout = useCallback(
      (event: LayoutChangeEvent) => {
        layout.current = event.nativeEvent.layout;
        onItemLayout(value, event.nativeEvent.layout);
        onLayout?.(event);
      },
      [onItemLayout, onLayout, value],
    );

    const choose = useCallback(() => {
      if (!checked) select(value);
    }, [checked, select, value]);

    return (
      <Pressable
        ref={ref}
        accessibilityRole="radio"
        accessibilityState={{ checked, disabled: off }}
        disabled={off}
        onLayout={handleLayout}
        onPress={choose}
        style={[styles.item, off && styles.disabled, style]}
        {...rest}
      >
        {Children.toArray(children).every((child) => !isValidElement(child)) ? (
          <Text
            numberOfLines={1}
            style={[styles.label, { color: checked ? colors.foreground : colors.mutedForeground }]}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);

GlassSegmentedControlItem.displayName = 'GlassSegmentedControlItem';

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  indicator: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    position: 'absolute',
    start: 0,
  },
  // The web's 34-point option, raised to 38 so the 44-point track is the touch target.
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  label: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  round: { borderCurve: 'continuous', borderRadius: GLASS_RADIUS.capsule },
  track: {
    alignSelf: 'stretch',
    borderRadius: GLASS_RADIUS.capsule,
    flexDirection: 'row',
    padding: INSET,
  },
});
