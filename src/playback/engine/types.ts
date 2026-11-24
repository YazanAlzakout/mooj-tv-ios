import type { StyleProp, ViewStyle } from "react-native";
import type { VideoContentFit, VideoPlayer } from "expo-video";

/**
 * The player surface the live screen is written against.
 *
 * ## Why this is `expo-video`'s own type and not an invented one
 *
 * There are two playback engines in this app — `expo-video` (Media3 on
 * Android, which is what ships on Google Play today) and libVLC (iOS, where
 * AVFoundation refuses this provider's bare progressive MPEG-TS; see
 * `react-native.config.js` for the measurement). A second engine normally
 * means a neutral interface that both implement.
 *
 * It does not here, deliberately. Four hooks take the player as a parameter
 * and are typed against `expo-video`'s `VideoPlayer`:
 *
 *   - `src/playback/useBackgroundPlayback.ts:22`  (`staysActiveInBackground`)
 *   - `src/playback/usePlayerMute.ts:22`          (`muted`)
 *   - `src/playback/usePlayerGestures.ts:206`     (`volume`, and two reads)
 *   - `src/playback/usePlaybackTracks.ts:128`     (tracks, four events)
 *
 * `usePlaybackTracks` is shared with the film and episode screens, which are
 * still on `expo-video`/AVPlayer, and its own comment at :117-125 warns that
 * its parameter list must not be touched because the three player screens pass
 * `preferredAudioLang` and `preferredSubtitleLang` positionally. Widening four
 * shared hooks to a union would therefore ripple into screens that have
 * nothing to do with iOS.
 *
 * "Still on", not "stay on". AVPlayer plays 13,018 of this account's 20,124
 * films, which are `.mp4`; the remaining ~7,100 are the `.mkv`/x265 share
 * AVFoundation refuses, and the plan in docs/IOS_READINESS.md was always
 * AVPlayer for the former and libVLC for the latter. Only the live half of
 * that is built. This seam cannot absorb the other half as it stands — it is
 * live-shaped (`useLivePlayer(setup)` with a null source, no position
 * readers), while the VOD screens construct the player *with* a source and
 * use `currentTime`, `duration` and `playbackRate`, every one of which
 * `VlcLivePlayer` deliberately does not implement. A VOD adapter is
 * outstanding work, not a gap in this file.
 *
 * So the libVLC adapter presents `expo-video`'s surface instead, and the one
 * cast that makes that legal lives in `vlc/VlcLivePlayer.ts` with the list of
 * members it actually implements. The screen, the four hooks and
 * `SplitChannelView` keep the type they already had.
 */
export type LivePlayer = VideoPlayer;

/**
 * The `setup` callback `useLivePlayer` runs while constructing the player.
 *
 * It runs during the **render** phase on both engines, because that is where
 * `useVideoPlayer` runs it (inside `useReleasingSharedObject`) and the live
 * screen reports `PlayerLifecycleMonitor.playerConstructed()` from it — see
 * that monitor's note at `PlayerLifecycleMonitor.ts:112-127` for why its own
 * notification is deferred to a microtask as a result.
 */
export type LivePlayerSetup = (player: LivePlayer) => void;

/**
 * The four statuses the live screen mirrors into React state, which are
 * `expo-video`'s own. Both engines emit `statusChange` with this set and
 * **only on an actual transition** — the screen depends on that twice, at
 * `[channelId].tsx:1075-1081` and `:148-152`.
 */
export type LivePlaybackStatus = "idle" | "loading" | "readyToPlay" | "error";

/**
 * The video surface. The prop names are `expo-video`'s `VideoView` props,
 * unchanged, so the Android engine can export that component directly rather
 * than wrapping it.
 *
 * `nativeControls` and `allowsPictureInPicture` are accepted and ignored by
 * the libVLC surface: libVLC draws no controls of its own, and there is no
 * picture-in-picture on that path — a feature gap accepted as a decision in
 * docs/DECISIONS.md.
 */
export interface LiveVideoViewProps {
  player: LivePlayer;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  nativeControls?: boolean;
  allowsPictureInPicture?: boolean;
}
