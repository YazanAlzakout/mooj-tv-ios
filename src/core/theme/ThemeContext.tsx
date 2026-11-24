import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { getAppState, setTheme as persistTheme, type ThemePreference } from "@/db/repositories/appStateRepository";

import { PALETTES, type ThemeColors, type ThemeName } from "./palettes";
import { getActiveTheme, setActiveTheme, subscribeToTheme } from "./themedStyles";

interface ThemeContextValue {
  /** What the user chose: an explicit theme, or "follow the device". */
  preference: ThemePreference;
  /** What that resolves to right now. */
  scheme: ThemeName;
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

function resolveScheme(preference: ThemePreference, device: string | null | undefined): ThemeName {
  if (preference === "system") return device === "light" ? "light" : "dark";
  return preference;
}

/**
 * Owns the theme preference: reads it at startup, follows the device when
 * the preference is "system", and persists changes.
 *
 * It does **not** remount anything. Screens repaint because each one calls
 * `useThemeRerender()`, which subscribes it to the same store the
 * stylesheets read. An earlier version re-keyed a Fragment around
 * `children` instead; that sat above the navigator and the intro flag, so
 * switching the theme discarded the navigation stack and replayed the
 * splash video, and "follow system" did the same thing mid-playback
 * whenever Android flipped to dark.
 *
 * The active theme is read with `useSyncExternalStore` rather than mirrored
 * into state: the stylesheets already depend on that module variable, so
 * making it the single source of truth avoids the two drifting apart — and
 * keeps the device-change effect free of a `setState` call.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme();
  const scheme = useSyncExternalStore(subscribeToTheme, getActiveTheme, getActiveTheme);
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [loaded, setLoaded] = useState(false);

  // The stored preference, once, at startup.
  useEffect(() => {
    let cancelled = false;
    getAppState()
      .then((state) => {
        if (cancelled) return;
        setActiveTheme(resolveScheme(state.theme, device));
        setPreferenceState(state.theme);
      })
      .catch(() => {
        // Falls through to the dark default — a theme is never worth
        // blocking startup over.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Startup-only; later device changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Following the device means reacting when the device flips.
  useEffect(() => {
    if (preference !== "system") return;
    setActiveTheme(resolveScheme("system", device));
  }, [device, preference]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      setActiveTheme(resolveScheme(next, device));
      setPreferenceState(next);
      await persistTheme(next);
    },
    [device]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, colors: PALETTES[scheme], setPreference }),
    [preference, scheme, setPreference]
  );

  // Nothing is painted until the stored preference is known, so the app
  // never starts dark and then flashes to light a frame later.
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
