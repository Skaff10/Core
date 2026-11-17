import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Animated, I18nManager, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import { GLASS_MOTION } from './tokens';

/** Where the indicator sits: the selected item's box, and the offset that slides it there. */
export type IndicatorPlacement = {
  height: number;
  offset: Animated.Value;
  top: number;
  width: number;
};

function sameBox(previous: LayoutRectangle | undefined, next: LayoutRectangle) {
  return (
    previous !== undefined &&
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height
  );
}

/**
 * Slides one indicator between the items of a track, such as a segmented control's options or
 * a tab list's triggers. Items report their layout; the indicator sits at the track's start edge
 * and springs to the selected item. It jumps instead on its first placement, after a layout
 * change and under Reduce Motion.
 */
export function useSelectionIndicator(selected: string, reduceMotion: boolean) {
  const [items, setItems] = useState<ReadonlyMap<string, LayoutRectangle>>(() => new Map());
  const [trackWidth, setTrackWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const placedOn = useRef<string | null>(null);
  const box = items.get(selected);
  const measured = box !== undefined;

  // Layout reports physical positions. In RTL the start edge is the track's right edge, so the
  // indicator travels left from there.
  const start = measured ? (I18nManager.isRTL ? box.x + box.width - trackWidth : box.x) : 0;

  useLayoutEffect(() => {
    if (!measured) {
      placedOn.current = null;

      return;
    }

    // A new selection slides; the first placement and a relayout of the same item jump.
    if (reduceMotion || placedOn.current === null || placedOn.current === selected) {
      offset.setValue(start);
    } else {
      Animated.spring(offset, {
        ...GLASS_MOTION.spring,
        toValue: start,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }).start();
    }

    placedOn.current = selected;
  }, [measured, offset, reduceMotion, selected, start]);

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const onItemLayout = useCallback((value: string, layout: LayoutRectangle) => {
    setItems((previous) =>
      sameBox(previous.get(value), layout) ? previous : new Map(previous).set(value, layout),
    );
  }, []);

  const forgetItem = useCallback((value: string) => {
    setItems((previous) => {
      if (!previous.has(value)) return previous;

      const next = new Map(previous);

      next.delete(value);

      return next;
    });
  }, []);

  const placement: IndicatorPlacement | null = measured
    ? { height: box.height, offset, top: box.y, width: box.width }
    : null;

  return { forgetItem, onItemLayout, onTrackLayout, placement };
}
