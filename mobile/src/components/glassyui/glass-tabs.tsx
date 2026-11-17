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
import { GlassPanel, type GlassPanelProps } from './glass-panel';
import { useGlassTheme } from './glass-provider';
import { GlassSurface } from './glass-surface';
import { GLASS_RADIUS } from './lib/tokens';
import { useControllableState } from './lib/use-controllable-state';
import { useSelectionIndicator } from './lib/use-selection-indicator';

type TabsContextValue = {
  select: (value: string) => void;
  selected: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(part: string) {
  const context = useContext(TabsContext);

  if (!context) throw new Error(`${part} must be used within GlassTabs`);

  return context;
}

type TabsListContextValue = {
  forgetItem: (value: string) => void;
  onItemLayout: (value: string, layout: LayoutRectangle) => void;
};

const TabsListContext = createContext<TabsListContextValue | null>(null);

function useTabsList() {
  const context = useContext(TabsListContext);

  if (!context) throw new Error('GlassTabsTrigger must be used within GlassTabsList');

  return context;
}

// The raised bubble under the active trigger, from .lg-tabs-trigger[data-state='active'].
const BUBBLE = {
  dark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow:
      'inset 0px 1px 0px rgba(255, 255, 255, 0.22), inset 0px -1px 0px rgba(0, 0, 0, 0.12), 0px 1px 3px rgba(0, 0, 0, 0.24), 0px 4px 12px -4px rgba(0, 0, 0, 0.4)',
  },
  light: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    boxShadow:
      'inset 0px 1px 0px rgba(255, 255, 255, 0.9), 0px 1px 3px rgba(0, 0, 0, 0.1), 0px 4px 12px -4px rgba(0, 0, 0, 0.16)',
  },
} as const;

const INSET = 4;

// The list's inset tops a 36-point trigger up to a 44-point touch.
const TRIGGER_HIT_SLOP = { bottom: INSET, top: INSET } as const;

export type GlassTabsProps = ViewProps & {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

/** Tabs that show one GlassTabsContent at a time, chosen from a GlassTabsList. */
export const GlassTabs = forwardRef<ComponentRef<typeof View>, GlassTabsProps>(
  ({ defaultValue, onValueChange, value, ...rest }, ref) => {
    const [selected, select] = useControllableState(value, defaultValue ?? '', onValueChange);
    const context = useMemo(() => ({ select, selected }), [select, selected]);

    return (
      <TabsContext.Provider value={context}>
        <View ref={ref} {...rest} />
      </TabsContext.Provider>
    );
  },
);

GlassTabs.displayName = 'GlassTabs';

export type GlassTabsListProps = ViewProps;

/**
 * The row of triggers, in a glass capsule. One raised bubble springs between them; Reduce Motion
 * moves it at once.
 */
export const GlassTabsList = forwardRef<ComponentRef<typeof View>, GlassTabsListProps>(
  ({ children, onLayout, style, ...rest }, ref) => {
    const { preferences } = useGlassTheme();
    const { selected } = useTabs('GlassTabsList');

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

    const list = useMemo(() => ({ forgetItem, onItemLayout }), [forgetItem, onItemLayout]);

    return (
      <TabsListContext.Provider value={list}>
        <GlassSurface
          ref={ref}
          accessibilityRole="tablist"
          elevation="base"
          onLayout={handleLayout}
          preset="control"
          style={[styles.list, style]}
          {...rest}
        >
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
      </TabsListContext.Provider>
    );
  },
);

GlassTabsList.displayName = 'GlassTabsList';

export type GlassTabsTriggerProps = Omit<PressableProps, 'children' | 'onPress' | 'style'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  value: string;
};

/** Shows the GlassTabsContent with the same value. Plain text children are set as its label. */
export const GlassTabsTrigger = forwardRef<ComponentRef<typeof View>, GlassTabsTriggerProps>(
  ({ children, disabled, onLayout, style, value, ...rest }, ref) => {
    const { colors } = useGlassTheme();
    const { select, selected } = useTabs('GlassTabsTrigger');
    const { forgetItem, onItemLayout } = useTabsList();
    const layout = useRef<LayoutRectangle | null>(null);
    const active = selected === value;

    // Re-registers under a new value, and leaves the bubble nothing to find once unmounted.
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

    const show = useCallback(() => {
      if (!active) select(value);
    }, [active, select, value]);

    return (
      <Pressable
        ref={ref}
        accessibilityRole="tab"
        accessibilityState={{ disabled: Boolean(disabled), selected: active }}
        disabled={disabled}
        hitSlop={TRIGGER_HIT_SLOP}
        onLayout={handleLayout}
        onPress={show}
        style={[styles.trigger, disabled && styles.disabled, style]}
        {...rest}
      >
        {Children.toArray(children).every((child) => !isValidElement(child)) ? (
          <Text
            numberOfLines={1}
            style={[styles.label, { color: active ? colors.foreground : colors.mutedForeground }]}
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

GlassTabsTrigger.displayName = 'GlassTabsTrigger';

export type GlassTabsContentProps = Omit<GlassPanelProps, 'variant'> & {
  value: string;
};

/** The panel for one trigger, on a glass card. It renders only while its trigger is active. */
export const GlassTabsContent = forwardRef<ComponentRef<typeof View>, GlassTabsContentProps>(
  ({ children, style, value, ...rest }, ref) => {
    const { colors } = useGlassTheme();
    const { selected } = useTabs('GlassTabsContent');

    if (selected !== value) return null;

    return (
      <GlassPanel
        ref={ref}
        elevation="base"
        preset="subtle"
        variant="card"
        style={[styles.content, style]}
        {...rest}
      >
        {Children.toArray(children).every((child) => !isValidElement(child)) ? (
          <Text style={[styles.body, { color: colors.foreground }]}>{children}</Text>
        ) : (
          children
        )}
      </GlassPanel>
    );
  },
);

GlassTabsContent.displayName = 'GlassTabsContent';

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  content: { marginTop: 12 },
  disabled: { opacity: 0.45 },
  indicator: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    position: 'absolute',
    start: 0,
  },
  label: { fontSize: 14, lineHeight: 20 },
  list: {
    alignSelf: 'stretch',
    borderRadius: GLASS_RADIUS.capsule,
    flexDirection: 'row',
    gap: 4,
    padding: INSET,
  },
  trigger: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.capsule,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
