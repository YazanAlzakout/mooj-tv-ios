import { Platform } from "react-native";

import { LIVE_PLAYBACK_ENGINE } from "./livePlaybackEngine";

/**
 * The live player's playback engine.
 *
 * Two implementations, one surface, picked by platform at exactly one point —
 * here, by Metro, from the file name:
 *
 *   - `livePlaybackEngine.tsx`     `expo-video` / Media3. Android, Android TV
 *                                  and web — every platform that is not
 *                                  Apple. A pass-through, not a
 *                                  reimplementation.
 *   - `livePlaybackEngine.ios.tsx` libVLC, through `@lunarr/vlc-player`,
 *                                  because AVFoundation refuses this
 *                                  provider's bare progressive MPEG-TS.
 *
 * Platform-extension resolution rather than a `Platform.OS` branch, so the
 * libVLC import cannot reach the Android bundle at all — the same
 * belt-and-braces as the autolinking exclusion in `react-native.config.js`,
 * which explains what linking libVLC on Android would cost.
 *
 * Both files export the same four names. Read the iOS one before changing
 * anything: it documents, in place, each behaviour that libVLC genuinely
 * cannot match and what the screen does about it.
 *
 * ## Both files must share one `sourceExt`, and the assertion below is why
 *
 * The fallback was first written as `livePlaybackEngine.ts`, and that made
 * `livePlaybackEngine.ios.tsx` **unreachable on every platform**. Metro's
 * `resolveSourceFile` (`metro-resolver/src/resolve.js:511-540`) loops over
 * `sourceExts` in the *outer* loop and, for each one, tries
 * `.{platform}{ext}`, then `.native{ext}`, then `{ext}`. Expo's `sourceExts`
 * are `ts tsx mjs js jsx json cjs scss sass css`, so on iOS the `.ts` pass
 * reached `livePlaybackEngine.ts` and returned before `tsx` was ever
 * considered. A platform extension only wins when it shares the `sourceExt`
 * of its fallback. Both files are `.tsx` for that reason and no other — the
 * Android one contains no JSX.
 *
 * The symptom was silence. Nothing in the app read `LIVE_PLAYBACK_ENGINE`, so
 * iOS simply used AVPlayer and failed exactly as it had before the work
 * started, with nothing to distinguish "libVLC is not loaded" from "libVLC
 * also cannot play this". It took two `expo export` runs and a grep of the
 * Hermes string tables to see it, and review had already passed.
 *
 * Hence the check. A `Platform.OS` *assertion* is not a `Platform.OS`
 * *branch*: it adds no libVLC import to any graph, costs one string compare
 * in development, and is the only thing in the project that can prove which
 * engine actually loaded.
 */
export {
  LIVE_PLAYBACK_ENGINE,
  LiveVideoView,
  releaseLiveSource,
  useLivePlayer,
} from "./livePlaybackEngine";
export { toEnginePlaybackError } from "./enginePlaybackError";
export type { EngineClassifiedError } from "./enginePlaybackError";
export type { LivePlaybackStatus, LivePlayer, LivePlayerSetup, LiveVideoViewProps } from "./types";

if (__DEV__) {
  const expected = Platform.OS === "ios" ? "libvlc" : "expo-video";
  if (LIVE_PLAYBACK_ENGINE !== expected) {
    throw new Error(
      `Live playback engine mismatch. Platform.OS is "${Platform.OS}", so Metro should have ` +
        `resolved the "${expected}" engine, but "${LIVE_PLAYBACK_ENGINE}" loaded instead. ` +
        `Every engine file in src/playback/engine/ must use the same source extension: a ` +
        `.ts file here shadows livePlaybackEngine.ios.tsx and sends iOS back to AVPlayer, ` +
        `which cannot play this provider's channels. See this file's comment.`
    );
  }
}
