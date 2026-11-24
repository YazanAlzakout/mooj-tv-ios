import type { VideoPlayer } from "expo-video";

export interface UsePlaybackSeekResult {
  /** Jump to an absolute position, clamped to the media's real duration. */
  seekTo: (seconds: number) => void;
  /** Jump forward (positive) or back (negative) from the current position. */
  skipBy: (deltaSeconds: number) => void;
  togglePlayPause: () => void;
}

/**
 * Seek/skip/play-pause against a native player.
 *
 * `player.currentTime` is a `SharedObject` property setter, not React state
 * — assigning it is the intended expo-video API (there is no method form;
 * `seekBy` exists but is documented as imprecise, which is wrong for an
 * exact scrub target). Kept in a hook, next to `usePlaybackSpeed` and
 * `useWatchProgress`, so every native-player write in this app lives behind
 * a hook boundary with one scoped `react-hooks/immutability` disable rather
 * than being scattered through screen components.
 */
export function usePlaybackSeek(player: VideoPlayer): UsePlaybackSeekResult {
  function seekTo(seconds: number) {
    const max = player.duration > 0 ? player.duration : Number.POSITIVE_INFINITY;
    player.currentTime = Math.min(Math.max(seconds, 0), max);
  }

  function skipBy(deltaSeconds: number) {
    seekTo(player.currentTime + deltaSeconds);
  }

  function togglePlayPause() {
    if (player.playing) player.pause();
    else player.play();
  }

  return { seekTo, skipBy, togglePlayPause };
}
