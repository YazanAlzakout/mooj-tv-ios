import Constants from "expo-constants";

/**
 * The brand, as the running app sees it.
 *
 * The single source is `brand.config.js` at the project root, which
 * `app.config.js` reads for build identity (package id, scheme, slug) and
 * copies into `extra.brand` for the handful of values the interface needs.
 * This module is the only thing that should read `extra.brand`.
 *
 * ## Why there are fallbacks here at all
 *
 * `Constants.expoConfig` can be null — it is read from a manifest that is
 * normally embedded at build time, but not on every path and not in every
 * tool that loads this code. For `isTvBuild` that costs nothing, because a
 * missing value just means "not the TV build". Here it would be worse than
 * nothing: `databaseName` arriving as `undefined` makes `openDatabaseSync`
 * open a *different* file, and the viewer's providers, library and history
 * all appear to have been wiped. So every value has a literal fallback, and
 * `tools/verify-brand.js` fails the build if a fallback drifts away from
 * brand.config.js.
 *
 * A further brand changes brand.config.js and these three literals, and the
 * verifier makes forgetting the second half impossible to miss.
 */
const FALLBACK = {
  key: "mooj",
  displayName: "Mooj TV",
  wordmark: "Mooj Tv",
  databaseName: "mooj-ios.db",
} as const;

interface BrandExtra {
  key?: unknown;
  displayName?: unknown;
  wordmark?: unknown;
  databaseName?: unknown;
}

/** A manifest value is only used when it is actually a non-empty string. */
function pick(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

const extra = (Constants.expoConfig?.extra?.brand ?? {}) as BrandExtra;

export const BRAND = {
  /** Short machine key. Log lines only, never shown to a viewer. */
  key: pick(extra.key, FALLBACK.key),
  /** The app's name in prose — settings, dialogs, the update notice. */
  displayName: pick(extra.displayName, FALLBACK.displayName),
  /** The wordmark drawn on the home screen, set in the brand's own casing. */
  wordmark: pick(extra.wordmark, FALLBACK.wordmark),
  /** The SQLite file name. See the note above on why this must never be undefined. */
  databaseName: pick(extra.databaseName, FALLBACK.databaseName),
} as const;
