import { Platform } from "react-native";

/**
 * Shared design tokens: dark-first, one blue accent.
 *
 * Every colour below was sampled from the Mooj TV logo itself rather than
 * chosen by eye, so the app and the artwork cannot drift apart — the deep
 * navy is the sphere's lower edge, the royal blue is its middle, and the
 * light blue is the brightest wave.
 */

/**
 * Spread into a `Text` style whenever it sits inside a *fixed-height* pill,
 * chip, or button (a category tab, a badge, a small toggle) — anywhere a
 * single line of text must sit precisely centered in a box shorter than a
 * full paragraph's breathing room.
 *
 * Noto Kufi Arabic — this app's only font — carries unusually tall
 * ascent/descent metrics in its own font tables, taller than an ordinary
 * Latin face at the same `fontSize`. On Android, RN's default text
 * rendering (`includeFontPadding: true`) reserves extra vertical space
 * based on exactly those metrics, so even a deliberately generous
 * `lineHeight` on a fixed-height container was still clipping the top of
 * Arabic labels — confirmed recurring on three separate tab strips built
 * at three different times, each with its own `lineHeight` fix, each still
 * clipping. `includeFontPadding: false` removes Android's reserved
 * padding outright instead of guessing a `lineHeight` large enough to
 * outrun it; `textAlignVertical: "center"` is its required pairing to keep
 * the (now unpadded) glyph centered rather than pinned to the top. Both
 * are Android-only properties — a no-op object on iOS/web, where this
 * class of clipping does not occur.
 */
export const AndroidTextFix =
  Platform.OS === "android"
    ? ({ includeFontPadding: false, textAlignVertical: "center" } as const)
    : ({} as const);

export const Brand = {
  /** The sphere's middle. The accent on every surface. */
  primary: "#1989C6",
  /** The sphere's lower edge — pressed states and deep fills. */
  primaryDark: "#021753",
  /** The brightest wave. Hover, highlights, the active tab. */
  primaryLight: "#3EB9EB",
  primaryGlow: "rgba(25, 137, 198, 0.35)",
  primaryMuted: "rgba(25, 137, 198, 0.15)",
  /**
   * White, and deliberately not a blue.
   *
   * The app this was cloned from used a red accent with a cyan focus ring,
   * which told the two apart at a glance. With a blue brand that no longer
   * works: a blue ring around a blue-accented card is the one thing a
   * viewer cannot read quickly, and on a television that is the difference
   * between knowing where you are and not. So focus is separated by
   * brightness instead of hue, which stays legible whatever the brand.
   */
  focus: "#FFFFFF",

  /*
   * The backdrop's drifting bands (see WaveBands).
   *
   * Written with their alpha rather than taken from the solid tints above,
   * because these are the one place in the app where a colour exists only
   * to be barely seen: `primaryDark` is opaque, and a band painted with it
   * would be a navy stripe across the screen rather than a swell behind it.
   *
   * Tokens, not literals in the component. The glow circles on this same
   * backdrop were literals, and they stayed the previous brand's red
   * through a whole palette change on sixteen screens without anyone
   * noticing.
   */
  wave: {
    /*
     * The peak of each band's ramp, not a flat fill.
     *
     * History, because the number moved twice for opposite reasons. A band
     * began as a plain rounded rectangle at 0.55 alpha; far wider than the
     * screen, the only part of it anyone ever saw was its dead-straight top
     * edge, drawn as a one-pixel step across the whole width. The answer
     * then was to drop the alpha to 0.055 and declare the edge unfindable.
     *
     * It was findable. The owner spotted the top band's edge on the device
     * on 2026-11-17 with nobody pointing at it. Ten parts in 255 spread over
     * a hundred rows is invisible; the same ten parts in one row is a line,
     * and there is no alpha that hides a line while leaving a band.
     *
     * So the edge was removed instead of hidden — WaveBands now draws each
     * band through a sin² alpha ramp, the way ArtScrim and the home cards'
     * scrim already soften their edges. A ramp averages half its peak, so
     * these went back up to keep the same presence, and that is safe to
     * spend now that the strongest part of each band is its middle rather
     * than its edge.
     */
    deep: "rgba(25, 137, 198, 0.1)",
    mid: "rgba(25, 137, 198, 0.075)",
    soft: "rgba(62, 185, 235, 0.06)",
  },
} as const;

export const Colors = {
  /*
   * Near-black, tilted a few degrees towards navy so the ground belongs to
   * the same family as the logo instead of being a neutral the brand merely
   * sits on. The darkest pixel sampled from the artwork is #01030F, which
   * is this within a shade.
   */
  background: "#050A14",
  surface: "#0D1422",
  surfaceElevated: "#16203A",
  border: "rgba(255,255,255,0.08)",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  overlay: "rgba(0,0,0,0.6)",
  success: "#22C55E",
  error: "#FF8A8A",
} as const;

/**
 * Solid category accents (not gradients — expo-linear-gradient needs a
 * native rebuild we're not blocking on right now; see docs/DECISIONS.md).
 */
export const CategoryColors = {
  live: Brand.primary,
  movies: "#6D28D9",
  series: "#DB2777",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Registered in src/app/_layout.tsx from assets/fonts/NotoKufiArabic-*.ttf. */
export const FontFamily = {
  light: "NotoKufiArabic-Light",
  regular: "NotoKufiArabic-Regular",
  medium: "NotoKufiArabic-Medium",
  semiBold: "NotoKufiArabic-SemiBold",
  bold: "NotoKufiArabic-Bold",
  extraBold: "NotoKufiArabic-ExtraBold",
  black: "NotoKufiArabic-Black",
} as const;

export const TVSafeArea = {
  horizontal: 96,
  vertical: 48,
} as const;

/**
 * The tile a channel logo sits on, the same dark in both themes.
 *
 * Channel artwork comes from the provider and is overwhelmingly **white**:
 * a white wordmark or a white glyph on transparency, drawn for the black
 * background of a set-top box. On the dark theme that is invisible by
 * luck — the surface behind it is `#12121A`. On the light theme the
 * surface is `#F3F4F6`, and a white logo on near-white is nothing at all.
 * Whole categories looked like a grid of empty boxes.
 *
 * So the tile does not follow the theme. It is the one surface in the app
 * that is decided by what goes on it rather than by the palette, and the
 * alternative — forcing the whole app dark on the television, which is
 * what was first considered — throws away a setting the viewer chose in
 * order to fix one background.
 *
 * Slightly lifted from `Colors.surface` so the tile still reads as a tile
 * on the dark theme rather than merging into the page.
 */
export const ArtworkTile = {
  background: "#16161F",
  border: "rgba(255,255,255,0.10)",
} as const;
