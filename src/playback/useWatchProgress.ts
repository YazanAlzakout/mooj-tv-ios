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
  const metadataReadyRef = useRef(false);
  const lastPersistAtRef = useRef(0);

  function resumeWhenReady() {
    if (resumedRef.current || !metadataReadyRef.current || player.status !== "readyToPlay") return;
    resumedRef.current = true;
    const position = pendingResumeRef.current;
    if (position !== null && Number.isFinite(position) && position > 0) {
      const duration = player.duration;
      // eslint-disable-next-line react-hooks/immutability -- native player setter.
      player.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(position, duration) : position;
    }
  }

  // eslint-disable-next-line react-hooks/immutability -- resume writes a native SharedObject property, not React data.
  useEffect(() => {
    let cancelled = false;
    resumedRef.current = false;
    metadataReadyRef.current = false;
    pendingResumeRef.current = null;
    lastPersistAtRef.current = 0;
    // 2026-11-25: disk lookup and native ready events can finish in either
    // order. Try from both, and reject a late lookup for a previous episode.
    Promise.all([getWatchProgress(meta.contentType, meta.providerItemId), getAppState()]).then(
      ([existing, appState]) => {
        if (cancelled) return;
        const fraction = existing && existing.durationSeconds > 0 ? existing.positionSeconds / existing.durationSeconds : 0;
        if (existing && appState.resumeEnabled && fraction >= RESUME_MIN_FRACTION && fraction < RESUME_MAX_FRACTION) {
          pendingResumeRef.current = existing.positionSeconds;
        }
        metadataReadyRef.current = true;
        resumeWhenReady();
      },
      () => { if (!cancelled) metadataReadyRef.current = true; }
    );
    return () => { cancelled = true; };
    // Stable player for the screen; only a different item starts a new lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.contentType, meta.providerItemId, player]);

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

  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "readyToPlay") resumeWhenReady();
  });

  useEventListener(player, "timeUpdate", () => {
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
