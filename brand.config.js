/**
 * Everything that makes a build *this* brand and not another one.
 *
 * This project began as a clone of a working app with a different name, and
 * the lesson from that clone is the reason this file exists: the brand was
 * spread over six unrelated places — the Expo config, the database file
 * name, a hard-coded string in the home screen, the theme tokens, the server
 * shortcut table and the translations — so changing it meant finding all six
 * and getting every one right. Here they are one object, read by both
 * `app.config.js` (build identity) and `src/core/brand/index.ts` (runtime).
 *
 * To stand up a further brand: copy this file, change the values, replace
 * the images in `assets/images/`, and nothing else needs to be touched.
 *
 * Plain CommonJS on purpose — `app.config.js` is loaded by Expo's config
 * resolver as CommonJS, before any TypeScript exists, so this file has to be
 * readable from there without a build step.
 */

/**
 * `packageId` is the app's permanent identity on Google Play. It cannot be
 * changed after the first publication — a different id is a different app,
 * with its own listing, its own install base and its own reviews. Decided
 * 2026-11-07, before anything was published, which is the only time it is
 * free to choose.
 */
const BRAND = {
  /** Short machine-readable key. Used in log lines and nowhere user-facing. */
  key: "mooj",

  /** The launcher label and the name shown inside the app. */
  displayName: "Mooj TV",
  /** The television build's label, kept separate in case the two diverge. */
  displayNameTv: "Mooj TV",
  /**
   * Drawn as the wordmark on the home screen. Latin, because the logo is,
   * and in the logo's own casing rather than set in capitals: the mark
   * beside it reads "Mooj TV", and a header shouting MOOJ TV next to it
   * made two different brands out of one.
   */
  wordmark: "Mooj Tv",

  /** Expo project slug. Lower-case, hyphenated, never changes after the first build. */
  slug: "mooj-tv",

  /** See the note above: permanent after publication. */
  packageId: "com.moojtv.player",

  /**
   * The same identity on Apple's side, and permanent in the same way.
   *
   * Deliberately identical to `packageId`. Nothing forces the two to match —
   * Apple and Google keep separate namespaces — but one app under two names is
   * a reliable source of confusion in signing, in deep links, and in every
   * later conversation about which build is which. The only reason to diverge
   * would be a collision on Apple's side, and there is none.
   *
   * Written down on 2026-11-18, before any iOS build existed, because a bundle
   * identifier cannot be changed after the first App Store publication any
   * more than a package id can after the first Play one.
   */
  bundleIdentifier: "com.moojtv.player",

  /**
   * Deep-link scheme, without `://`.
   *
   * The sideload copy gets its own (`<scheme>dev`) because two installed
   * copies claiming one scheme make Android stop resolving it to either —
   * it offers a chooser, or picks whichever it likes.
   */
  scheme: "moojtv",

  /**
   * The environment variable that switches a build to the sideload id, so a
   * test copy installs *beside* the published one rather than replacing it.
   */
  devEnvVar: "MOOJ_DEV_ID",

  /**
   * The SQLite file. Branded so that two brands installed on one device
   * never read each other's catalogue — belt and braces, since a different
   * package id already gives each app its own private storage.
   */
  databaseName: "mooj.db",

  /**
   * Adaptive-icon background. The logo is a blue sphere that needs a ground
   * dark enough for its own gradient to read, so this is the deepest navy
   * sampled from the artwork rather than a flat white.
   */
  /**
   * White, behind the launcher icon.
   *
   * It was the brand's deep navy, with a navy image on top of it, and on a
   * launcher the result was a dark plate with a small sphere floating in
   * the middle of it — the mark covers about 58% of the icon canvas and
   * the mask reveals around 90%, so a thick navy frame showed all the way
   * round.
   *
   * Android cannot simply be told to make it transparent: an adaptive icon
   * has to have a background layer, and a launcher handed a transparent
   * one substitutes a plate of its own choosing. White is the answer the
   * drawer on this device is already full of — the mark sits on it the way
   * Gmail, Maps, Photos and Drive sit on theirs — and a blue sphere on
   * white is the mark at its most legible.
   */
  adaptiveIconBackground: "#FFFFFF",
};

module.exports = BRAND;
