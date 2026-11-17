import { Platform } from 'react-native';
import type { GlassyUiTheme } from './preferences';

export type GlassTone = 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'purple';

export type GlassColors = {
  /** Selection, active controls and the prominent button. */
  accent: string;
  accentForeground: string;
  border: string;
  /** The resting fill of fields and unselected controls. */
  controlSurface: string;
  focusRing: string;
  foreground: string;
  /** Extra frost over blurred glass, for clear and tinted glass. */
  glassFill: Record<'clear' | 'tinted', string>;
  invalid: string;
  knob: string;
  mutedForeground: string;
  /** Where glass cannot be drawn: Reduce Transparency. */
  opaqueSurface: string;
  /** Floating layers that must hold 4.5:1 text over any backdrop. */
  overlaySurface: string;
  /** The hairline round a glass edge, and the light it catches along the top. */
  rim: string;
  rimHighlight: string;
  scrim: string;
  shadow: string;
  shadowRaised: string;
  tones: Record<GlassTone, string>;
  track: string;
};

/** Glass stays neutral. Blue marks actions and selection; the tones mark status. */
export const GLASS_COLORS = {
  dark: {
    accent: '#087EA4',
    accentForeground: '#ffffff',
    border: 'rgba(255, 255, 255, 0.12)',
    controlSurface: 'rgba(255, 255, 255, 0.07)',
    focusRing: '#38BDF8',
    foreground: '#F4F7FB',
    glassFill: { clear: 'rgba(255, 255, 255, 0.05)', tinted: 'rgba(13, 18, 28, 0.56)' },
    invalid: '#FB7185',
    knob: '#ffffff',
    mutedForeground: '#94A3B8',
    opaqueSurface: '#141923',
    overlaySurface: 'rgba(18, 24, 36, 0.88)',
    rim: 'rgba(255, 255, 255, 0.13)',
    rimHighlight: 'rgba(255, 255, 255, 0.26)',
    scrim: 'rgba(3, 6, 12, 0.62)',
    shadow: '0px 2px 6px rgba(0, 0, 0, 0.24), 0px 10px 28px -6px rgba(0, 0, 0, 0.42)',
    shadowRaised: '0px 4px 12px rgba(0, 0, 0, 0.30), 0px 28px 56px -16px rgba(0, 0, 0, 0.65)',
    tones: {
      neutral: '#94A3B8',
      blue: '#38BDF8',
      green: '#34D399',
      orange: '#FBBF24',
      red: '#FB7185',
      purple: '#A78BFA',
    },
    track: 'rgba(148, 163, 184, 0.22)',
  },
  light: {
    accent: '#0067d9',
    accentForeground: '#ffffff',
    border: 'rgba(0, 0, 0, 0.14)',
    controlSurface: 'rgba(255, 255, 255, 0.72)',
    focusRing: '#66666a',
    foreground: '#222224',
    glassFill: { clear: 'rgba(255, 255, 255, 0.18)', tinted: 'rgba(255, 255, 255, 0.55)' },
    invalid: '#c4153f',
    knob: '#ffffff',
    mutedForeground: '#505055',
    opaqueSurface: '#ffffff',
    overlaySurface: 'rgba(255, 255, 255, 0.82)',
    rim: 'rgba(255, 255, 255, 0.55)',
    rimHighlight: 'rgba(255, 255, 255, 0.9)',
    scrim: 'rgba(0, 0, 0, 0.16)',
    shadow: '0px 1px 2px rgba(0, 0, 0, 0.06), 0px 8px 24px -6px rgba(0, 0, 0, 0.14)',
    shadowRaised: '0px 2px 6px rgba(0, 0, 0, 0.06), 0px 28px 56px -18px rgba(0, 0, 0, 0.26)',
    tones: {
      neutral: '#8e8e93',
      blue: '#005ec6',
      green: '#14a874',
      orange: '#e8960c',
      red: '#e8345a',
      purple: '#6a4cf0',
    },
    track: 'rgba(118, 118, 128, 0.2)',
  },
} as const satisfies Record<GlassyUiTheme, GlassColors>;

export const GLASS_RADIUS = { md: 16, lg: 24, capsule: 999 } as const;

/** Arrivals ease out; physical responses spring and settle. Exits run shorter than arrivals. */
export const GLASS_MOTION = {
  duration: 200,
  /** React Native for Web has no native driver and warns when asked for one. */
  nativeDriver: Platform.OS !== 'web',
  spring: { damping: 18, mass: 1, stiffness: 260 },
} as const;
