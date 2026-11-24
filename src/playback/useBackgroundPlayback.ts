import type { VideoPlayer } from "expo-video";
import { useEffect, useState } from "react";

import { getAppState } from "@/db/repositories/appStateRepository";

/**
 * Applies the viewer's background-playback preference to a player.
 *
 * Off by default, and deliberately so: an Xtream line is commonly limited
 * to a single connection, and a stream still running because the user
 * switched apps would silently lock every other device out of the account
 * — with no visible cause. Turning it on is a decision the user makes in
 * Settings, not something the app assumes.
 *
 * Returns the resolved preference (`null` until it has been read), because
 * `staysActiveInBackground: false` alone does not achieve what the
 * paragraph above describes: expo-video only `pause()`s on background, and
 * a paused progressive stream keeps its socket — so the account's one
 * connection stayed held for as long as the app sat in the background.
 * Callers that own a source use this to drop it properly.
 */
export function useBackgroundPlayback(player: VideoPlayer): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppState().then(
      (state) => {
        if (!cancelled) setEnabled(state.backgroundPlayback);
      },
      () => {
        if (!cancelled) setEnabled(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (enabled === null) return;
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.staysActiveInBackground = enabled;
  }, [enabled, player]);

  return enabled;
}
