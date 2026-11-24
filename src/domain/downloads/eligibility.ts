import { Platform } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * Whether this build offers downloads at all.
 *
 * It does not on Android TV. A set-top box or a television typically has
 * 8-16 GB of storage shared with the system, which one film can take a
 * quarter of, and there is no practical way for a viewer to manage files
 * from the couch — so the feature is absent rather than present and
 * frustrating. Everything downstream keys off this, which is why the
 * buttons, the Downloads screen entry points and the boot-time recovery
 * all disappear together instead of leaving dead ends behind.
 *
 * Keyed to the build, not to `Platform.isTV` — see isTvBuild.ts. The
 * runtime check reported `false` on the test box, so the TV build was
 * offering downloads on a television after all.
 *
 * ## And not on iOS, for a completely different reason
 *
 * App Review Guideline 5.2.3 says an app may not "include the ability to
 * save, convert, or download media from third-party sources ... without
 * explicit authorization from those sources". A Downloads screen in a player
 * that connects to a provider the developer has no relationship with is that
 * sentence, point for point. Google raised none of this; Apple cites 5.2.3 at
 * apps in this category that download nothing at all, and an app with the
 * feature on screen has no good answer ready.
 *
 * So the first iOS release ships without it. This is a submission decision,
 * not a technical limit — expo-file-system downloads perfectly well on iOS —
 * and it is reversible: once the app has a review history, turning the arm
 * below back off is one line and a resubmission. Defending the feature on
 * submission number one is the expensive version of the same conversation.
 *
 * Decided 2026-11-18, before the iOS port began, so that nothing downstream
 * was ever written assuming it was there.
 */
export function downloadsSupported(): boolean {
  return !isTvBuild && Platform.OS !== "ios";
}

/**
 * Master prompt §27: only direct-file VOD is downloadable. `.m3u8` is a
 * playlist, not a single file, and live streams are never offered a
 * download action in the UI at all (no eligibility check needed for them).
 */
export function isDownloadEligible(containerExtension: string): boolean {
  if (!downloadsSupported()) return false;
  return containerExtension.trim().toLowerCase() !== "m3u8";
}
