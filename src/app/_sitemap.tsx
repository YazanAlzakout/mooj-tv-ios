/**
 * The route table, taken off the air.
 *
 * expo-router answers `/_sitemap` with a generated screen that prints every
 * route in the app — in English, in the release build, one tap from the
 * "Unmatched Route" page that used to answer `moojtv://anything`. It is a
 * development convenience and it has no business inside a shipped player.
 * A file of this name is what removes it: `build/getLinkingConfig.js` skips
 * its own `_sitemap` linking entry once the app's own route tree claims
 * that path (`isPathInRootConfig`). Found 2026-11-17, with +not-found.tsx
 * beside it, and fixed the same way.
 *
 * What it renders is the same honest answer the app gives for any other
 * address it does not have: there is nothing here. A redirect would instead
 * hand the viewer a full app boot — see the note in +not-found.tsx on what
 * `/` actually costs — for a URL that was never a page of this app. One
 * component rather than a copy of it, because two copies of one screen is
 * how they drift; React Navigation keys screens by route name, so the two
 * routes sharing a component collide over nothing.
 *
 * Note what this does *not* do. `ExpoRoot.js` imports `views/Sitemap`
 * statically, so its code and its four PNGs are still in the bundle; the
 * screen is simply unreachable. Deleting this file hands `/_sitemap` back
 * to expo-router, which is the only way to get the listing back for
 * debugging — it is gone in development too, not only in release.
 */
export { default } from "./+not-found";
