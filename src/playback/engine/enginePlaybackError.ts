import type { PlaybackError, PlaybackErrorCategory } from "@/core/errors/PlaybackError";
import { toPlaybackError } from "@/core/errors/PlaybackError";

/**
 * The extra field the libVLC engine puts on a playback error, and the only
 * reason `toPlaybackError` is not called directly any more.
 *
 * ## The problem this exists to solve
 *
 * `toPlaybackError` (`core/errors/PlaybackError.ts:23-44`) categorises a
 * failure by substring-matching its **message**: "401"/"403"/"unauthorized"
 * becomes `http_unauthorized`, "404"/"not found" becomes
 * `stream_unavailable`. That works on Android only because ExoPlayer writes
 * the HTTP status into the message ("Source error / Response code: 403",
 * quoted at `core/errors/playbackReason.ts:9-11`).
 *
 * libVLC's error event carries no message at all. Its payload is
 * `{type, currentTime, duration}` and nothing else
 * (`@lunarr/vlc-player/specs/VLCPlayerNativeComponent.ts:17-25`, emitted at
 * `ios/VLCPlayerView.swift:625-629`), and there is no log channel anywhere in
 * that package to recover a status from. So on iOS every single failure would
 * come back `category: "unknown"`.
 *
 * That is not a wording problem, it is control flow. `[channelId].tsx:937`
 * and `:1125` branch the whole retry machine on
 * `failure.category !== "http_unauthorized"`: walk the four candidate URL
 * shapes or keep the shape, two retries at 1s or six at 2.5s. The two longest
 * comments in that file (`:901-923` and `:1103-1123`) exist because walking
 * the shapes on a *busy* connection slot was measured, twice, as the thing
 * that turns a one-second wait into a 23-second one and twelve stream opens
 * into an anti-flood block.
 *
 * So the libVLC engine classifies the failure itself — from libVLC's state
 * machine, which is the only evidence it has — and attaches the answer here.
 * `engineCategory` is deliberately a name nothing else in the app uses, so it
 * cannot collide with a property on a real `Error` or on `expo-video`'s
 * `PlayerError`.
 */
export interface EngineClassifiedError {
  message: string;
  /** Set by the libVLC engine only. Absent on the `expo-video` path. */
  engineCategory?: PlaybackErrorCategory;
}

/**
 * `toPlaybackError`, except that an engine which already knows what went
 * wrong gets to say so.
 *
 * On Android nothing sets `engineCategory`, so this is `toPlaybackError` and
 * only `toPlaybackError` — same category, same message, same `cause`. The
 * Android path is unchanged by construction.
 */
export function toEnginePlaybackError(cause: unknown): PlaybackError {
  const base = toPlaybackError(cause);

  if (cause && typeof cause === "object") {
    const engineCategory = (cause as { engineCategory?: unknown }).engineCategory;
    if (typeof engineCategory === "string") {
      return { ...base, category: engineCategory as PlaybackErrorCategory };
    }
  }

  return base;
}
