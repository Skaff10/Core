import { AccessibilityInfo, Platform } from 'react-native';

export type GlassyUiMode = 'clear' | 'tinted';

export type GlassyUiTheme = 'light' | 'dark';

export interface GlassyUiPreferences {
  theme?: GlassyUiTheme;
  /** Clear glass shows more of what lies behind it; tinted glass holds a denser frost. */
  mode?: GlassyUiMode;
  reduceTransparency?: boolean;
  reduceMotion?: boolean;
}

export type SystemAccessibility = {
  reduceMotion: boolean;
  reduceTransparency: boolean;
};

type Subscription = { remove: () => void };

// The system's accessibility settings, read once and shared by every glass component.
let snapshot: SystemAccessibility = { reduceMotion: false, reduceTransparency: false };

const listeners = new Set<() => void>();

let subscriptions: Subscription[] = [];

function update(next: Partial<SystemAccessibility>) {
  const merged = { ...snapshot, ...next };

  if (
    merged.reduceMotion === snapshot.reduceMotion &&
    merged.reduceTransparency === snapshot.reduceTransparency
  ) {
    return;
  }

  snapshot = merged;
  listeners.forEach((listener) => listener());
}

function warnReadFailure(cause: Error) {
  console.warn('Glassy UI could not read an accessibility setting', cause);
}

function startListening() {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((reduceMotion) => update({ reduceMotion }))
    .catch(warnReadFailure);

  subscriptions.push(
    AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) =>
      update({ reduceMotion }),
    ),
  );

  if (Platform.OS === 'ios') {
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((reduceTransparency) => update({ reduceTransparency }))
      .catch(warnReadFailure);

    subscriptions.push(
      AccessibilityInfo.addEventListener('reduceTransparencyChanged', (reduceTransparency) =>
        update({ reduceTransparency }),
      ),
    );
  }

  // React Native for Web has no reduce-transparency event; the browser reports it directly.
  if (Platform.OS === 'web' && window.matchMedia) {
    const query = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const handleChange = () => update({ reduceTransparency: query.matches });

    update({ reduceTransparency: query.matches });
    query.addEventListener('change', handleChange);
    subscriptions.push({ remove: () => query.removeEventListener('change', handleChange) });
  }
}

export function subscribeToSystemAccessibility(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) startListening();

  return () => {
    listeners.delete(listener);

    if (listeners.size > 0) return;

    subscriptions.forEach((subscription) => subscription.remove());
    subscriptions = [];
  };
}

export function readSystemAccessibility() {
  return snapshot;
}
