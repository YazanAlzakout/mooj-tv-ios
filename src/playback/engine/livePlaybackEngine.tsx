import { useVideoPlayer, VideoView } from "expo-video";

import type { LivePlayer, LivePlayerSetup } from "./types";

/**
 * The `expo-video` live playback engine — Android today, and every platform
 * except iOS.
 *
 * This file is deliberately almost empty. Android plays this provider's
 * channels through `expo-video`/Media3 plus the vendored FFmpeg MP2 decoder in
 * `modules/decoder-ffmpeg-mp2`, and that combination is what ships on Google
 * Play. Nothing about it is re-implemented here: `useLivePlayer` *is*
 * `useVideoPlayer(null, setup)` with the same arguments, `LiveVideoView` *is*
 * `VideoView` (not a wrapper — the prop names in `LiveVideoViewProps` are its
 * own, so the component is re-exported and the React tree keeps exactly the
 * shape it has today), and `releaseLiveSource` *is* `replaceAsync(null)`.
 *
 * Metro picks `livePlaybackEngine.ios.tsx` instead of this file on iOS. That
 * is also why `@lunarr/vlc-player` can never reach the Android bundle: the
 * import that pulls it in is in a file Metro does not resolve for Android, the
 * same belt-and-braces as the autolinking exclusion in
 * `react-native.config.js`.
 */
export const LIVE_PLAYBACK_ENGINE = "expo-video" as const;

export function useLivePlayer(setup: LivePlayerSetup): LivePlayer {
  /*
    `null`, not a source. The live screen constructs one player for the
    screen's whole life and hands it sources afterwards, which is what keeps
    `expo-video`'s recreate key (`JSON.stringify(parsedSource)`,
    `VideoPlayer.tsx:58`) from ever changing — so the object is stable across
    every render, every rotation and every zap.
  */
  return useVideoPlayer(null, setup);
}

export const LiveVideoView = VideoView;

/**
 * Drops the source and lets go of the provider connection.
 *
 * A separate call rather than `replaceAsync(null)` because `null` has no
 * meaning on the libVLC side — see the iOS variant of this file. Here it is
 * literally `replaceAsync(null)`, including what its resolution means: the
 * command was accepted, not that the socket is shut (the close happens on
 * ExoPlayer's own thread, which is what `SOURCE_RELEASE_MS` in the live
 * screen is waiting for).
 */
export function releaseLiveSource(player: LivePlayer): Promise<void> {
  return player.replaceAsync(null);
}
