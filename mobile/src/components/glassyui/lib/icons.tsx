import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type GlassIconName =
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'dash'
  | 'danger'
  | 'info'
  | 'success'
  | 'warning';

// The web components' own strokes, drawn on a 20-point grid.
const PATHS = {
  check: ['M4.5 10.5 8.25 14.25 15.5 6.25'],
  'chevron-down': ['M5 7.5l5 5 5-5'],
  'chevron-right': ['M7.5 4.4 13.1 10l-5.6 5.6'],
  close: ['M5.5 5.5l9 9m0-9l-9 9'],
  dash: ['M5 10h10'],
  danger: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M7.6 7.6l4.8 4.8', 'M12.4 7.6l-4.8 4.8'],
  info: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M10 9.2v4.1', 'M10 6.7h.01'],
  success: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M6.9 10.2l2.2 2.2 4-4.4'],
  warning: ['M10 3.6 17 16H3L10 3.6Z', 'M10 8.4v3.4', 'M10 14h.01'],
} as const satisfies Record<GlassIconName, readonly string[]>;

export type GlassIconProps = {
  color: string;
  name: GlassIconName;
  size?: number;
  strokeWidth?: number;
};

/** A stroked glyph from the library's small icon set. Decorative; label its control instead. */
export function GlassIcon({ color, name, size = 20, strokeWidth = 1.8 }: GlassIconProps) {
  // The hiding lives on a View: on the web, Svg passes its props to a bare <svg> element.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: size, width: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        {PATHS[name].map((path) => (
          <Path
            key={path}
            d={path}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        ))}
      </Svg>
    </View>
  );
}
