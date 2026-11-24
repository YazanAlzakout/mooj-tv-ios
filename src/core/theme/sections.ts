/**
 * The three section colours, in one place.
 *
 * Live, Movies and Series each own a colour, and the app uses that ownership as
 * wayfinding: the home screen's card, the tab bar's disc and the browse
 * screen's header badge all wear the same one, so the app answers "where am I"
 * without a word being read.
 *
 * 2026-11-17: they were copied as hex literals into five files — home.tsx,
 * MoojTabBar.tsx and the three browse screens — which is five chances for one
 * of them to drift and break the only thing they exist for. They live here now.
 *
 * Literals rather than theme tokens, deliberately: these identify the sections
 * rather than the surface, so they must read the same on both themes.
 */
export const SECTION_LIVE = "#0C7FB8";
export const SECTION_MOVIES = "#6D28D9";
export const SECTION_SERIES = "#BE185D";

/**
 * A fourth colour for Home, because a neutral was the wrong idea twice over.
 *
 * Home began as #E6EEF5, a near-white coin. On the dark theme it read; on the
 * light theme it was #E6EEF5 on #FFFFFF, about 1.1 to 1, and simply was not
 * there — on the tab the app opens on. The next attempt made the neutral follow
 * the theme: near-white on dark, near-black on light. The owner rejected both
 * halves of that on 2026-11-17 — "ما عجبني لونو ولا لو الهوم بيج السوداء
 * والبيضاء في الدارك" — and chose a colour instead.
 *
 * Teal, chosen by the owner from four candidates. It is the one hue that is far
 * enough from all three section colours to never be mistaken for one, while
 * still belonging to the same cool family as the brand. 5.5 to 1 against its
 * white glyph, 3.2 against the dark bar and 4.4 against the light one — it
 * clears every floor on both themes with a single value, which is why it needs
 * no theme branch at all.
 *
 * More keeps a slate neutral on purpose: it is the "everything else" tab and
 * owns no section, and its grey already clears both grounds.
 */
export const SECTION_DISC: Record<string, { disc: string; ink: string }> = {
  home: { disc: "#0F766E", ink: "#FFFFFF" },
  "live-categories": { disc: SECTION_LIVE, ink: "#FFFFFF" },
  "movies-categories": { disc: SECTION_MOVIES, ink: "#FFFFFF" },
  "series-categories": { disc: SECTION_SERIES, ink: "#FFFFFF" },
  more: { disc: "#64748B", ink: "#FFFFFF" },
};

/** For a route this map does not know. */
export const SECTION_FALLBACK = { disc: "#64748B", ink: "#FFFFFF" };
