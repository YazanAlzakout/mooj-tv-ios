import { useSyncExternalStore } from "react";
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

import { PALETTES, type ThemeColors, type ThemeName } from "./palettes";

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * The theme in force, held outside React.
 *
 * It has to live here rather than in the context because `StyleSheet.create`
 * runs at *module import*, once, long before any provider mounts — which is
 * exactly why simply swapping the values in a `Colors` object could never
 * repaint anything.
 */
let active: ThemeName = "dark";
const listeners = new Set<() => void>();

export function getActiveTheme(): ThemeName {
  return active;
}

/**
 * Subscribing makes this a proper external store, which is what lets the
 * provider read it with `useSyncExternalStore` instead of mirroring it
 * into state and setting that state from an effect.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Only the provider calls this — from an event handler or an effect. */
export function setActiveTheme(name: ThemeName): void {
  if (name === active) return;
  active = name;
  for (const listener of listeners) listener();
}

/**
 * A `StyleSheet.create` that knows about both themes.
 *
 * Written at the same place a plain stylesheet was, and read the same way
 * (`styles.card`) — but the lookup resolves against whichever palette is
 * active at the moment the style is *read*, which is render time, instead
 * of freezing one palette in at import time.
 *
 * The alternative was a `useThemedStyles()` hook, which would have meant
 * finding and editing every component in all 36 themed files, including
 * the small ones nested at the bottom of a screen. This keeps the diff to
 * the stylesheet itself.
 *
 * Both sheets are built lazily and then cached, so a session that never
 * switches theme never pays for the other one.
 */
export function themedStyles<T extends NamedStyles<T>>(factory: (c: ThemeColors) => T): T {
  const sheets = {} as Record<ThemeName, T>;

  const sheet = (): T => {
    const existing = sheets[active];
    if (existing) return existing;
    const created = StyleSheet.create(factory(PALETTES[active]));
    sheets[active] = created;
    return created;
  };

  return new Proxy({} as T, {
    get: (_target, prop) => sheet()[prop as keyof T],
    has: (_target, prop) => prop in sheet(),
    ownKeys: () => Reflect.ownKeys(sheet()),
    getOwnPropertyDescriptor: (_target, prop) => ({
      value: sheet()[prop as keyof T],
      enumerable: true,
      configurable: true,
    }),
  });
}

/**
 * The active palette as plain values, for the handful of places that need
 * a colour as a prop rather than inside a stylesheet — `ActivityIndicator`
 * `color`, `RefreshControl` `tintColor`, a `StatusBar` style.
 */
export function themeColors(): ThemeColors {
  return PALETTES[active];
}

/**
 * Subscribes a component to theme changes so it re-renders when the theme
 * flips — nothing more.
 *
 * Stylesheets built by `themedStyles` resolve their colours when a style is
 * *read*, which happens during render, so a component that re-renders picks
 * up the new palette on its own. What it cannot do is notice that the theme
 * changed, because the active theme lives outside React.
 *
 * Calling this once in a screen covers everything that screen re-renders
 * with it — but **not a `memo`'d child**. A memo compares props, a theme
 * change touches none of them, and the child bails out still holding the
 * old palette's stylesheet. That is not theoretical: it left the artwork
 * tiles in all three browse grids painted with the dark theme's surface on
 * a white page, which a screenshot measured as #12121A on #FFFFFF.
 *
 * So a memoised component needs one of two things: its own call to this,
 * or a key that changes with the theme. The three grids take the key (they
 * already remount on a column change, and their scroll position is
 * restored); the category chips take the subscription.
 *
 * This replaced remounting the tree on a keyed Fragment. That worked, but
 * the key sat above the navigator and the intro flag, so changing the theme
 * threw away the navigation stack and replayed the splash — and with the
 * preference set to "follow system", Android flipping to dark mid-playback
 * tore down the player.
 */
export function useThemeRerender(): ThemeName {
  return useSyncExternalStore(subscribeToTheme, getActiveTheme, getActiveTheme);
}
