import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  readSystemAccessibility,
  subscribeToSystemAccessibility,
  type GlassyUiPreferences,
  type GlassyUiTheme,
} from './lib/preferences';
import { GLASS_COLORS } from './lib/tokens';

type PreferenceState = Required<GlassyUiPreferences>;

type PreferenceContextValue = {
  preferences: PreferenceState;
  setPreferences: (prefs: Partial<GlassyUiPreferences>) => void;
};

const PreferencesContext = createContext<PreferenceContextValue | null>(null);

function ignorePreferences() {}

/** The device's appearance and accessibility settings, as glass preferences. */
function useSystemPreferences(): PreferenceState {
  const scheme = useColorScheme();

  const accessibility = useSyncExternalStore(
    subscribeToSystemAccessibility,
    readSystemAccessibility,
    readSystemAccessibility,
  );

  return useMemo(
    () => ({
      theme: scheme === 'light' ? 'light' : 'dark',
      mode: 'clear',
      reduceMotion: accessibility.reduceMotion,
      reduceTransparency: accessibility.reduceTransparency,
    }),
    [accessibility, scheme],
  );
}

/**
 * Holds the glass preferences every component follows. It starts from the device's appearance,
 * Reduce Motion and Reduce Transparency settings; `defaultTheme` overrides the appearance until
 * the app sets a theme. Choices made with `setPreferences` last while the provider is mounted;
 * persist them in your app's own storage if they should survive a restart.
 */
export function GlassProvider({
  children,
  defaultTheme,
}: {
  children: ReactNode;
  defaultTheme?: GlassyUiTheme;
}) {
  const system = useSystemPreferences();
  const [explicit, setExplicit] = useState<GlassyUiPreferences>({});

  const preferences = useMemo(() => {
    const merged: PreferenceState = { ...system, ...explicit };

    if (defaultTheme && explicit.theme === undefined) merged.theme = defaultTheme;

    return merged;
  }, [defaultTheme, explicit, system]);

  const setPreferences = useCallback((next: Partial<GlassyUiPreferences>) => {
    setExplicit((previous) => ({ ...previous, ...next }));
  }, []);

  const value = useMemo(() => ({ preferences, setPreferences }), [preferences, setPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export const PreferencesProvider = GlassProvider;

/** The provider's preferences, or the device's own settings when no provider is mounted. */
export function useOptionalPreferences(): PreferenceContextValue {
  const context = useContext(PreferencesContext);
  const system = useSystemPreferences();

  return context ?? { preferences: system, setPreferences: ignorePreferences };
}

export function usePreferences() {
  const context = useContext(PreferencesContext);

  if (!context) {
    throw new Error('usePreferences must be used within GlassProvider');
  }

  return context;
}

/** The colours for the current theme, with the preferences they came from. */
export function useGlassTheme() {
  const { preferences } = useOptionalPreferences();

  return { colors: GLASS_COLORS[preferences.theme], preferences };
}
