import type { PlaybackErrorCategory } from "@/core/errors/PlaybackError";

/**
 * The translation key that explains a failure to the person holding the
 * device.
 *
 * `toPlaybackError` already sorts whatever expo-video hands back into
 * categories, and nothing used them: the player printed the raw string, so a
 * channel that was simply off the air said "A playback exception has
 * occurred: Source error / Response code: 403" — English, a number, and a
 * server the viewer has no relationship with (seen on the device
 * 2026-09-16). Each category has exactly one thing worth saying about it,
 * and one of them is even actionable.
 *
 * `http_unauthorized` is the interesting one. On this kind of line a 401 or
 * 403 on a *stream* almost never means the credentials are wrong — the
 * catalogue loaded with the same ones moments earlier. It means the single
 * allowed connection is already in use.
 *
 * The wording deliberately does **not** say "on another device". It usually
 * is not another device: the operator confirmed on 2026-09-16 that nothing
 * else was signed in while this was happening, so the connection holding
 * the slot was this app's own previous channel, still letting go. Naming a
 * second device would send someone hunting through their house for a
 * television that is switched off. "Busy for a moment, wait or try another"
 * is true in both cases and points at the only two things that help.
 *
 * `unknown` deliberately promises nothing about the cause. Naming a reason
 * we have not established would send someone to look in the wrong place,
 * which is the whole complaint against the raw string.
 */
export function playbackReasonKey(category: PlaybackErrorCategory): string {
  switch (category) {
    case "http_unauthorized":
      return "playbackBusy";
    case "stream_unavailable":
      return "playbackOffAir";
    case "network_timeout":
      return "playbackSlow";
    case "unsupported_container":
    case "decoder_failure":
      return "playbackUnsupported";
    case "source_parse_failure":
    case "unknown":
    default:
      return "playbackUnknown";
  }
}

/**
 * The same idea for films and episodes, in wording that fits them.
 *
 * The VOD screens used to render `playbackReasonKey`, which is written for
 * live television — so a film the provider no longer carries told the viewer
 * "this channel is off the air right now, try another one" (seen 2026-09-17).
 * Nothing about that sentence is true of a film: there is no broadcast to be
 * off, and "another channel" is not the thing to try.
 *
 * The mapping is otherwise identical, deliberately: it is the same
 * `PlaybackErrorCategory` from the same `toPlaybackError`, and having two
 * different category groupings for live and VOD would be two things to keep
 * in step for no gain. Only the sentences differ.
 */
export function vodReasonKey(category: PlaybackErrorCategory): string {
  switch (category) {
    case "http_unauthorized":
      return "vodBusy";
    case "stream_unavailable":
      return "vodMissing";
    case "network_timeout":
      return "vodSlow";
    case "unsupported_container":
    case "decoder_failure":
      return "vodUnsupported";
    case "source_parse_failure":
    case "unknown":
    default:
      return "vodUnknown";
  }
}
