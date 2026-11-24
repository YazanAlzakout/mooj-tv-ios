import type { VideoPlayer } from "expo-video";
import { useState } from "react";

/** Master prompt §24.2: "playback speed 0.5x–2x". */
const SPEED_STEPS = [0.5, 1, 1.25, 1.5, 2];

export interface UsePlaybackSpeedResult {
  speed: number;
  cycleSpeed: () => void;
}

/**
 * `player.playbackRate` is a native `SharedObject` property setter, not
 * React state — see the longer explanation in `useWatchProgress.ts` for why
 * writing it directly (rather than treating it as an immutable prop) is the
 * correct, intended expo-video API.
 */
export function usePlaybackSpeed(player: VideoPlayer): UsePlaybackSpeedResult {
  const [speed, setSpeed] = useState(1);

  function cycleSpeed() {
    const currentIndex = SPEED_STEPS.indexOf(speed);
    const next = SPEED_STEPS[(currentIndex + 1) % SPEED_STEPS.length];
    setSpeed(next);
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, see doc comment above.
    player.playbackRate = next;
  }

  return { speed, cycleSpeed };
}
