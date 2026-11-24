import type { VideoPlayer } from "expo-video";
import { useState } from "react";

export interface UsePlayerMuteResult {
  muted: boolean;
  toggleMute: () => void;
  /** Clears mute from somewhere other than the button — see the swipe gesture. */
  unmute: () => void;
}

/**
 * Mute toggle for the player chrome. Exists as a hook purely so the native
 * property write stays behind a hook boundary — the same convention as
 * `usePlaybackSeek` and `useWatchProgress` — instead of scattering
 * `react-hooks/immutability` suppressions through screen components.
 *
 * `player.muted` is deliberately mirrored into React state rather than
 * read during render: it is a native property with no change event, so
 * reading it in the render path would not re-render the button when it
 * flips.
 */
export function usePlayerMute(player: VideoPlayer): UsePlayerMuteResult {
  const [muted, setMuted] = useState(false);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.muted = next;
  }

  /*
    Separate from `toggleMute` because the caller is not a toggle: the
    volume swipe means "I want to hear this", which is the same request
    whether or not mute happens to be on. It has to come through here
    rather than writing `player.muted` directly, or this hook's mirrored
    state would go stale and the chip would offer to unmute audio that was
    already playing.
  */
  function unmute() {
    if (!muted) return;
    setMuted(false);
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.muted = false;
  }

  return { muted, toggleMute, unmute };
}
