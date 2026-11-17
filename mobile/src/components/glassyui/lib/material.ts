import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * How glass is drawn: the system's own glass on iOS 26 and later, a blur of what lies
 * behind on earlier iOS, Android and the web, or an opaque fill under Reduce Transparency.
 */
export type GlassMaterial = 'liquid' | 'blur' | 'solid';

// Both checks return false off iOS. The second guards early iOS 26 builds that lack the API.
const systemGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function resolveGlassMaterial(reduceTransparency: boolean): GlassMaterial {
  if (reduceTransparency) return 'solid';

  return systemGlass ? 'liquid' : 'blur';
}
