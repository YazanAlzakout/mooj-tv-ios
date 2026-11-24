/**
 * The two colour palettes, and the shape every themed style reads from.
 *
 * `Colors` in tokens.ts stays exactly as it was — the dark palette, still
 * imported directly by the surfaces that are dark in *both* themes (the
 * controls painted over a running video). Everything that is a page rather
 * than an overlay reads from here instead, through `themedStyles`.
 */
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  overlay: string;
  success: string;
  error: string;

  /**
   * The three tints that used to be written inline as
   * `rgba(255,255,255,0.06 … 0.18)` — chip fills, inactive tabs, hairline
   * dividers, icon bubbles. They read as "slightly lighter than the
   * surface" on dark, so on light they have to invert to "slightly darker"
   * rather than keep their literal value, which would be invisible.
   */
  fillSubtle: string;
  fillMedium: string;
  fillStrong: string;

  /** Dimming behind a modal or over artwork. */
  scrim: string;

  /** Text and icons drawn on a brand-coloured or category-coloured surface. */
  onAccent: string;

  /** The soft brand glow bleeding into the top of every screen. */
  glowOuter: string;
  glowInner: string;

  /**
   * The two-step fade from a details screen's hero artwork into the page
   * below it. These have to end at the page colour, not at black: on light
   * they used to darken the poster to near-black and then cut hard to white.
   */
  scrimArtworkSoft: string;
  scrimArtworkStrong: string;
}

export const darkColors: ThemeColors = {
  background: "#0A0A0F",
  surface: "#12121A",
  surfaceElevated: "#1C1C28",
  border: "rgba(255,255,255,0.08)",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  overlay: "rgba(0,0,0,0.6)",
  success: "#22C55E",
  error: "#FF8A8A",

  fillSubtle: "rgba(255,255,255,0.06)",
  fillMedium: "rgba(255,255,255,0.12)",
  fillStrong: "rgba(255,255,255,0.18)",

  scrim: "rgba(0,0,0,0.6)",
  onAccent: "#FFFFFF",

  glowOuter: "rgba(25,137,198,0.07)",
  glowInner: "rgba(25,137,198,0.14)",

  scrimArtworkSoft: "rgba(10,10,15,0.35)",
  scrimArtworkStrong: "rgba(10,10,15,0.7)",
};

/**
 * Matched to the published app's own light palette (its
 * `constants/theme.ts`), so an updating user recognises the app rather
 * than meeting a different one: a pure white page with grey cards on it —
 * `background: #FFFFFF`, `surface: #F3F4F6` — which is the inverse of the
 * dark scheme's arrangement, where the page is darkest and cards sit
 * lighter on top of it.
 *
 * `error` and `success` are the two values not carried over: the dark
 * palette picks bright tints because they sit on near-black, and the same
 * tints on white fail contrast outright, so they are darkened here.
 */
export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#F3F4F6",
  surfaceElevated: "#FFFFFF",
  border: "rgba(0,0,0,0.08)",
  text: "#11181C",
  textSecondary: "#6B7280",
  textMuted: "#687076",
  overlay: "rgba(0,0,0,0.4)",
  success: "#15803D",
  error: "#C02718",

  fillSubtle: "rgba(0,0,0,0.05)",
  fillMedium: "rgba(0,0,0,0.09)",
  fillStrong: "rgba(0,0,0,0.14)",

  scrim: "rgba(0,0,0,0.4)",
  onAccent: "#FFFFFF",

  glowOuter: "rgba(25,137,198,0.05)",
  glowInner: "rgba(25,137,198,0.08)",

  scrimArtworkSoft: "rgba(255,255,255,0.45)",
  scrimArtworkStrong: "rgba(255,255,255,0.85)",
};

export type ThemeName = "dark" | "light";

export const PALETTES: Record<ThemeName, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};
