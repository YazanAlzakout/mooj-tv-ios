import { useEventListener } from "expo";
import type { VideoPlayer } from "expo-video";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { getAppState } from "@/db/repositories/appStateRepository";
import {
  clearWatchProgress,
  getWatchProgress,
  saveWatchProgress,
  type WatchContentType,
} from "@/db/repositories/watchProgressRepository";

/** Only resume when saved progress is meaningfully beyond the start. */
const RESUME_MIN_FRACTION = 0.05;
/** Don't resume (or keep saving) once an item is basically finished. */
const RESUME_MAX_FRACTION = 0.95;
/**
 * How often `timeUpdate` fires. This is the player's *only* clock: the VOD
 * scrubber reads its position from this same event, so it also decides how
 * smoothly the progress bar moves and how quickly a skip is reflected on
 * screen. It used to be set to the save interval (15s), which meant the bar
 * jumped once every fifteen seconds and a ±10s skip looked like it had done
 * nothing at all until the next tick.
 */
const TIME_UPDATE_INTERVAL_SECONDS = 0.5;
/** Minimum gap between SQLite writes — throttled here rather than by starving the event (master prompt §24.6). */
const PROGRESS_SAVE_INTERVAL_SECONDS = 15;

export interface WatchProgressMeta {
  contentType: WatchContentType;
  providerItemId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  containerExtension: string;
  seriesId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

/**
 * Wires a VideoPlayer to watch-progress persistence (master prompt §24.6):
 * resumes from a saved position once the source is ready (only when
 * meaningfully beyond the start and not nearly finished), saves
 * periodically via the player's own throttled `timeUpdate` event, and
 * saves again on pause/background/unmount so nothing between throttled
 * ticks is lost. Clears the row once an item plays to the end or is nearly
 * finished, so a fully-watched item doesn't linger in Continue Watching.
 *
 * `player` is a native `SharedObject` wrapper, not React state/props —
 * writing its `currentTime`/`timeUpdateEventInterval` properties (there is
 * no method form for either; `seekBy` exists but is explicitly documented
 * as imprecise, wrong for exact resume) is the correct, intended
 * expo-video API, not an accidental prop mutation. The eslint-disable
 * comments below are scoped to exactly those two lines for that reason.
 */
export function useWatchProgress(player: VideoPlayer, meta: WatchProgressMeta): void {
  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  });

  const resumedRef = useRef(false);
  const pendingResumeRef = useRef<number | null>(null);
  const lastPersistAtRef = useRef(0);
  /**
   * Where playback had actually reached, kept so a *reloaded* source can be
   * put back there.
   *
   * `resumedRef` is one-shot per item, which is right for "restore the
   * saved position once". But a source can be reloaded without the item
   * changing — the quiet retry after a playback error, or the player being
   * rebuilt when connectivity flips — and ExoPlayer starts a replaced
   * source at zero. With only the one-shot flag, forty minutes into a film
   * a two-second Wi-Fi blip silently restarted it from the beginning.
   */
  const lastKnownPositionRef = useRef(0);

  useEffect(() => {
    resumedRef.current = false;
    pendingResumeRef.current = null;
    lastKnownPositionRef.current = 0;
    Promise.all([getWatchProgress(meta.contentType, meta.providerItemId), getAppState()]).then(
      ([existing, appState]) => {
        if (!existing || !appState.resumeEnabled) return;
        const fraction = existing.durationSeconds > 0 ? existing.positionSeconds / existing.durationSeconds : 0;
        if (fraction >= RESUME_MIN_FRACTION && fraction < RESUME_MAX_FRACTION) {
          pendingResumeRef.current = existing.positionSeconds;
        }
      }
    );
    // Re-run only when switching to a genuinely different item.
  }, [meta.contentType, meta.providerItemId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, see doc comment above.
    player.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SECONDS;
  }, [player]);

  function persist() {
    // On unmount this runs from the AppState-effect cleanup below, which
    // races against `useVideoPlayer`'s own cleanup releasing the native
    // player — there's no ordering guarantee between two independent
    // effects' cleanups in the same component. Reading a property on an
    // already-released SharedObject throws, so this is a real boundary
    // case (observed on-device), not a defensive-programming guess.
    let duration: number;
    let position: number;
    try {
      duration = player.duration;
      position = player.currentTime;
    } catch {
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;

    const fraction = position / duration;
    const m = metaRef.current;

    if (fraction >= RESUME_MAX_FRACTION) {
      clearWatchProgress(m.contentType, m.providerItemId).catch(() => {});
      return;
    }
    if (fraction < RESUME_MIN_FRACTION) return;

    saveWatchProgress({
      contentType: m.contentType,
      providerItemId: m.providerItemId,
      positionSeconds: position,
      durationSeconds: duration,
      updatedAt: Date.now(),
      title: m.title,
      subtitle: m.subtitle,
      imageUrl: m.imageUrl,
      containerExtension: m.containerExtension,
      seriesId: m.seriesId ?? null,
      seasonNumber: m.seasonNumber ?? null,
      episodeNumber: m.episodeNumber ?? null,
    }).catch(() => {});
  }

  /* eslint-disable react-hooks/immutability -- native player property setter, see doc comment above. */
  useEventListener(player, "statusChange", ({ status }) => {
    if (status !== "readyToPlay") return;

    if (!resumedRef.current) {
      resumedRef.current = true;
      if (pendingResumeRef.current !== null) {
        player.currentTime = pendingResumeRef.current;
      }
      return;
    }

    /*
     * Ready again for an item already resumed: the source was reloaded.
     * If the player is sitting at the start while playback had got further
     * than that, put it back. The one-second thresholds keep this from
     * firing on an ordinary ready event mid-playback, and from fighting a
     * viewer who deliberately seeks to the beginning.
     */
    if (lastKnownPositionRef.current > 1 && player.currentTime < 1) {
      player.currentTime = lastKnownPositionRef.current;
    }
  });
  /* eslint-enable react-hooks/immutability */

  useEventListener(player, "timeUpdate", () => {
    if (player.currentTime > 0) lastKnownPositionRef.current = player.currentTime;
    // The event now fires twice a second for the scrubber's benefit; the
    // database still only wants a row every PROGRESS_SAVE_INTERVAL_SECONDS.
    // Pause/background/unmount persist unconditionally below — those are
    // the paths that must never drop the last position.
    const now = Date.now();
    if (now - lastPersistAtRef.current < PROGRESS_SAVE_INTERVAL_SECONDS * 1000) return;
    lastPersistAtRef.current = now;
    persist();
  });

  useEventListener(player, "playingChange", ({ isPlaying }) => {
    if (!isPlaying) persist();
  });

  useEventListener(player, "playToEnd", () => {
    const m = metaRef.current;
    clearWatchProgress(m.contentType, m.providerItemId).catch(() => {});
  });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") persist();
    });
    return () => {
      subscription.remove();
      persist();
    };
    // `persist` reads live refs + the stable `player` object, never stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);
}
