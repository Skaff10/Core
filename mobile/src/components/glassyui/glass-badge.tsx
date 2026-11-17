import { ComponentRef, forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useGlassTheme } from './glass-provider';
import type { GlassTone } from './lib/tokens';

export type GlassBadgeTone = GlassTone;

export type GlassBadgeProps = ViewProps & {
  children?: ReactNode;
  /** Leading status dot in the tone colour. */
  dot?: boolean;
  tone?: GlassBadgeTone;
};

// Each tone keeps 4.5:1 text over a white or black backdrop in both themes.
const TONES = {
  dark: {
    neutral: { fill: 'rgba(44, 44, 46, 0.88)', ink: '#f5f5f7', tint: '142, 142, 147' },
    blue: { fill: 'rgba(13, 44, 82, 0.88)', ink: '#b2d6ff', tint: '0, 103, 217' },
    green: { fill: 'rgba(22, 60, 48, 0.88)', ink: '#7cebc0', tint: '51, 214, 159' },
    orange: { fill: 'rgba(70, 54, 22, 0.88)', ink: '#ffd27a', tint: '255, 189, 56' },
    red: { fill: 'rgba(76, 30, 44, 0.88)', ink: '#ffa6b7', tint: '255, 92, 122' },
    purple: { fill: 'rgba(44, 36, 92, 0.88)', ink: '#c7b8ff', tint: '155, 128, 255' },
  },
  light: {
    neutral: { fill: 'rgba(242, 242, 244, 0.88)', ink: '#222224', tint: '142, 142, 147' },
    blue: { fill: 'rgba(229, 241, 255, 0.88)', ink: '#0054b3', tint: '0, 103, 217' },
    green: { fill: 'rgba(224, 247, 238, 0.88)', ink: '#08603f', tint: '20, 168, 116' },
    orange: { fill: 'rgba(255, 243, 219, 0.88)', ink: '#824c00', tint: '232, 150, 12' },
    red: { fill: 'rgba(255, 229, 236, 0.88)', ink: '#a8113a', tint: '232, 52, 90' },
    purple: { fill: 'rgba(237, 232, 255, 0.88)', ink: '#5532d0', tint: '106, 76, 240' },
  },
} as const;

const HIGHLIGHT = { dark: 'rgba(255, 255, 255, 0.12)', light: 'rgba(255, 255, 255, 0.9)' } as const;

/** A small label in one of six tones, with an optional status dot. */
export const GlassBadge = forwardRef<ComponentRef<typeof View>, GlassBadgeProps>(
  ({ children, dot = false, style, tone = 'neutral', ...rest }, ref) => {
    const { preferences } = useGlassTheme();
    const colors = TONES[preferences.theme][tone];

    return (
      <View
        ref={ref}
        style={[
          styles.badge,
          {
            backgroundColor: colors.fill,
            boxShadow: `inset 0px 1px 0px ${HIGHLIGHT[preferences.theme]}, inset 0px 0px 0px 0.5px rgba(${colors.tint}, 0.4)`,
          },
          style,
        ]}
        {...rest}
      >
        {dot ? <View style={[styles.dot, { backgroundColor: `rgb(${colors.tint})` }]} /> : null}
        <Text numberOfLines={1} style={[styles.label, { color: colors.ink }]}>
          {children}
        </Text>
      </View>
    );
  },
);

GlassBadge.displayName = 'GlassBadge';

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderCurve: 'continuous',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dot: { borderRadius: 3, height: 6, width: 6 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
});
