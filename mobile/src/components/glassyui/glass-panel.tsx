import { ComponentRef, forwardRef } from 'react';
import type { View } from 'react-native';
import { GlassSurface, type GlassSurfaceProps } from './glass-surface';
import { GLASS_RADIUS } from './lib/tokens';

type PanelVariant = 'panel' | 'card' | 'pill';

type PanelElevation = 'base' | 'raised';

export type GlassPanelProps = Omit<GlassSurfaceProps, 'elevation'> & {
  variant?: PanelVariant;
  elevation?: PanelElevation;
};

// Shape and spacing come first, so a consumer's style always wins.
const VARIANT_STYLE = {
  panel: { borderRadius: GLASS_RADIUS.lg, padding: 24 },
  card: { borderRadius: GLASS_RADIUS.md, padding: 20 },
  pill: { borderRadius: GLASS_RADIUS.capsule, paddingHorizontal: 20, paddingVertical: 12 },
} as const;

/** Glass cards, panels and pills for anything that floats above your content. */
export const GlassPanel = forwardRef<ComponentRef<typeof View>, GlassPanelProps>(
  (
    {
      elevation = 'base',
      variant = 'panel',
      preset = variant === 'pill' ? 'control' : 'standard',
      style,
      ...rest
    },
    ref,
  ) => (
    <GlassSurface
      ref={ref}
      elevation={elevation}
      preset={preset}
      style={[VARIANT_STYLE[variant], style]}
      {...rest}
    />
  ),
);

GlassPanel.displayName = 'GlassPanel';
