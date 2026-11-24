import type { RefObject } from "react";
import type { AudioTrack, SubtitleTrack } from "expo-video";
import type {
  VLCPlayerRef,
  VLCPlayerSource,
  VLCPlayerTracks,
  VLCProgressEvent,
  VLCStateChangeEvent,
  VLCTrack,
} from "@lunarr/vlc-player";

import type { PlaybackErrorCategory } from "@/core/errors/PlaybackError";
import { PROVIDER_REQUEST_HEADERS } from "@/core/network/providerHeaders";
import type { EngineClassifiedError } from "../enginePlaybackError";
import type { LivePlaybackStatus, LivePlayer } from "../types";

/**
 * How long a channel may sit in "opening" before the adapter calls it a
 * failure.
 *
 * libVLC has no open timeout of its own that reaches JS, and without this a
 * channel that never answers leaves the screen spinning for ever with no
 * message and no retry — worse than any wrong message. ExoPlayer's own
 * connect/read timeouts are 8s apiece, so 15s is comfortably past a slow but
 * working open on a `.ts` stream while still inside a viewer's patience.
 *
 * A watchdog failure is reported as `network_timeout`, which reaches the
 * candidate-shape walk at `[channelId].tsx:1148` — as does every category
 * except `http_unauthorized`, since `:1125` tests for that one and nothing
 * else. `decoder_failure` from `handleError` is the other route, so this is
 * not the only one; an earlier draft of this comment said it was. See
 * `OPAQUE_OPEN_FAILURE_CATEGORY` for which failures are kept off that path
 * and why, and `handleError` for the two that are not.
 */
const OPEN_WATCHDOG_MS = 15_000;

/**
 * How long a channel that has started playing may stop advancing before the
 * adapter calls it dead.
 *
 * The open watchdog above only covers the open. After the first `Playing`
 * there was nothing at all, and the gap it leaves is the ordinary way an IPTV
 * channel fails rather than an exotic one: when the server closes the
 * progressive `.ts` response libVLC reaches `.ended` and `handleEnded` deals
 * with it — but when the upstream dies while the edge holds the TCP
 * connection open, no bytes arrive, no state change is delivered, libVLC's
 * HTTP access has no read timeout that reaches this binding, and the adapter
 * went on reporting `readyToPlay` for ever over a frozen picture.
 *
 * It is detected from `onProgress` rather than from a timer of our own,
 * because the binding's progress timer is a repeating `Timer` on the main
 * RunLoop (`ios/VLCPlayerView.swift:867-876`) that calls `emitProgress`
 * unconditionally — so it keeps firing with a frozen `p.time` and the stall
 * arrives as an event rather than as an absence. Nothing extra to arm, cancel
 * or leak.
 *
 * Twenty seconds against a five-second cadence means four flat readings
 * before it fires, which no ordinary rebuffer survives: libVLC emits
 * `Buffering` for those, and they move the clock again within a second or
 * two on a working stream.
 */
const STALL_TIMEOUT_MS = 20_000;

/**
 * What the adapter reports when libVLC fails before a single byte has been
 * demuxed — the case where Android would have read "403" or "404" out of
 * ExoPlayer's message and branched on it.
 *
 * ## Why this is `http_unauthorized` and not `unknown`
 *
 * libVLC's error event carries no status and no message (see
 * `enginePlaybackError.ts` for where that is proved), and 403 and 404 both
 * fail at exactly the same point in its state machine: `Opening` → `Error`,
 * nothing demuxed. The two are genuinely indistinguishable without a second
 * HTTP request, and this adapter does not make one — the panel's anti-flood
 * block is driven by request *rate* (AGENTS.md, docs/DECISIONS.md), and a
 * probe per failure is more requests on exactly the failure path where the
 * app is already retrying.
 *
 * So one of the two has to be assumed, and `http_unauthorized` is the safer
 * assumption on this line:
 *
 *   - it keeps the URL shape and retries the *timing* — six attempts at 2.5s
 *     (`MAX_BUSY_RETRIES`/`BUSY_RETRY_DELAY_MS`), which is what
 *     `[channelId].tsx:1122` asks for and what a busy connection slot needs,
 *     since the slot frees by itself when the previous stream lets go;
 *   - the alternative walks all four candidate URL shapes on every failure,
 *     which is precisely the regression the file's two longest comments
 *     (`:901-923`, measured 2026-09-16, and `:1103-1123`, found by audit
 *     2026-11-14) say must never come back: twelve stream opens in a few
 *     seconds against an edge that answers bursts with empty 404s;
 *   - and the viewer is told "the stream is busy for a moment, wait a second
 *     or try another channel", which is the one actionable sentence in the
 *     set, instead of a shrug.
 *
 * **What it costs, stated plainly.** A channel that is genuinely off the air
 * spends 15 seconds being patient and then says "busy" rather than "off the
 * air". And the candidate-shape walk no longer runs for an immediate
 * failure, so a panel that serves a shape other than the first candidate
 * would never play on iOS. That is safe for this provider and not in general:
 * `buildLiveStreamCandidates` (`src/providers/xtream/xtreamAdapter.ts:141`)
 * puts `/live/user/pass/id.ts` first, and this panel's
 * `allowed_output_formats` is `["ts","rtmp"]`, so an `.m3u8` is never even
 * offered — measured against the real account and recorded in
 * docs/IOS_READINESS.md under what Safari established.
 * A panel that needs a different shape, or an operator who would rather pay
 * one extra request per failure for a true 403/404 answer, is the reason this
 * is a named constant: changing it to `"stream_unavailable"` restores the
 * walk and loses the busy handling, and the only way to have both is a
 * status-code probe fired *after* `onError` (the native player is already
 * released by then, `ios/VLCPlayerView.swift:630`, so the slot is free) and
 * routed outside `core/network/requestQueue.ts` so a 404 cannot call
 * `noteProviderRefusal` and open the catalogue backoff window.
 */
const OPAQUE_OPEN_FAILURE_CATEGORY: PlaybackErrorCategory = "http_unauthorized";

/**
 * libVLC reveals the elementary streams of a bare MPEG-TS progressively, as
 * the demuxer finds them, and **nothing** in the binding pushes a track list:
 * `onEvent?("Tracks", ...)` appears exactly once in the whole Swift file,
 * inside `getTracks()` (`ios/VLCPlayerView.swift:302`), and libVLC's own
 * `.esAdded` state — the natural trigger — falls into `default: break` at
 * `:631-632`. The package's doc comment claims `onTracks` fires by itself; on
 * iOS that is simply not true.
 *
 * So the adapter polls. The call is local (it reads
 * `audioTrackIndexes`/`audioTrackNames` off the player), costs no provider
 * request, and returns silently when there is no player (`:280`), so polling
 * through the open phase is free. One series per media, starting with the
 * source: twenty seconds is far longer than any open and leaves room for a
 * late audio stream on a channel that starts video-first.
 */
const TRACK_POLL_DELAY_MS = 400;
const TRACK_POLL_INTERVAL_MS = 2_000;
const TRACK_POLL_COUNT = 10;

/** What the live screen hands `replaceAsync`, which is `{ uri, headers }`. */
export interface VlcLiveSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * Everything the mounted `VLCPlayerView` renders from. Replaced whole on
 * every change so `useSyncExternalStore` can compare it with `Object.is`.
 */
export interface VlcSurfaceSnapshot {
  /** `undefined` means "no source": the native side skips the whole source block. */
  readonly source: VLCPlayerSource | undefined;
  /**
   * Bumped with every source. The surface uses it as a React `key` — see
   * `replaceAsync` for the two reasons that is not optional.
   */
  readonly sourceKey: number;
  readonly paused: boolean;
  /** libVLC's own 0..200 scale, with mute already folded in as a zero. */
  readonly volume: number;
  readonly continueAudioInBackground: boolean;
}

type EngineListener = (payload: unknown) => void;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * libVLC's index arrays carry a "Disable" pseudo-entry at id -1
 * (`ios/VLCPlayerView.swift:283` and `:295` read them straight out of
 * `audioTrackIndexes` / `videoSubTitlesIndexes`). Left in, it puts an
 * untranslated "Disable" row in the audio section of the track sheet,
 * duplicates that sheet's own "off" row for subtitles, and — worst — makes a
 * single-audio channel report two tracks, which falsely trips
 * `tracks.audioTracks.length > 1` at `[channelId].tsx:1456` and `:2240` and
 * rebinds the remote's left/right arrows on a channel with nothing to choose.
 */
function isSelectableTrack(track: VLCTrack): boolean {
  return track.id >= 0;
}

/**
 * libVLC gives one display name per track and no language field (`VLCTrack`
 * is `{id, name}`, types.ts:53-58), so `language` is left empty rather than
 * guessed out of the name.
 *
 * The consequence is bounded and known: `findPreferredTrack`'s exact pass
 * (`usePlaybackTracks.ts:76`) compares primary subtags and can never match on
 * iOS. Both preferred-language arms of that hook have been inert since
 * 2026-11-18 (its comment at :107-125 — the two Settings rows that fed them
 * were removed and so were the repository setters), so nothing reads
 * `language` today. Parsing a subtag out of "Track 1 - [Arabic]" would be a
 * guess that silently selects the wrong language the day those settings come
 * back; an empty string simply does not match, which is the honest answer.
 *
 * `id` is set on **every** track, always. With `expo-video` on iOS it is
 * `undefined` for all of them, and `TrackSelectorModal.tsx:99` then evaluates
 * `undefined === undefined` and renders every row as the active one — a
 * pre-existing bug on the AVPlayer path that this adapter must not inherit.
 * The libVLC integer is carried inside the string id and read back out in the
 * setter, rather than by object identity, because every poll mints a fresh
 * array of fresh objects and the sheet may be tapped between two polls.
 */
function toAudioTrack(track: VLCTrack, index: number): AudioTrack {
  return {
    id: String(track.id),
    language: "",
    label: track.name.trim() || `Track ${index + 1}`,
    name: track.name,
  };
}

function toSubtitleTrack(track: VLCTrack, index: number): SubtitleTrack {
  return {
    id: String(track.id),
    language: "",
    label: track.name.trim() || `Track ${index + 1}`,
    name: track.name,
  };
}

/** The libVLC id carried inside a synthesized track id, or null if it is not one of ours. */
function vlcTrackId(track: AudioTrack | SubtitleTrack): number | null {
  if (track.id === undefined) return null;
  const parsed = Number(track.id);
  return Number.isInteger(parsed) ? parsed : null;
}

function trackSignature(tracks: (AudioTrack | SubtitleTrack)[]): string {
  return tracks.map((track) => `${track.id}:${track.label}`).join("|");
}

/**
 * The media libVLC is asked to open.
 *
 * ## The provider's User-Agent, which is not optional
 *
 * `VLCPlayerSource` has no headers field at all (types.ts:37-50) — uri,
 * mediaOptions, initOptions, isNetwork, autoplay, hwDecoderEnabled, and
 * nothing else. libVLC takes the agent as a media option instead, added raw
 * via `media.addOption` (`ios/VLCPlayerView.swift:199-201`), so the string is
 * interpolated unquoted and unescaped, exactly as it arrives.
 *
 * The value is whatever the caller put in `headers["User-Agent"]` —
 * `PROVIDER_REQUEST_HEADERS` from `core/network/providerHeaders.ts`, taken
 * from the source the screen already passes, so the string is never copied.
 * That same constant is the fallback if a future caller forgets the headers,
 * because the failure mode is invisible: without a browser agent this panel
 * answers 403 on every channel and the viewer is told the line is busy. Its
 * own comment records why it matters — the panel sits behind Cloudflare, and
 * Xtream panels behind a WAF routinely reject `okhttp`/`Dalvik`/`ExoPlayerLib`
 * agents while accepting a browser one.
 *
 * The wildcard `Accept` header, the other half of that pair, **cannot be
 * carried over**. libVLC exposes no generic header mechanism, so there is
 * nowhere to put it. Whether this panel's Cloudflare rule needs it as well as
 * the agent has never been tested and cannot be tested from here.
 *
 * (Its value is written out in `core/network/providerHeaders.ts` and
 * deliberately not quoted here: the wildcard pair ends with the two
 * characters that close a block comment, which is exactly how
 * `react-native.config.js` was committed as a syntax error on 2026-11-18.)
 *
 * `hwDecoderEnabled` is passed explicitly and that is load-bearing. Omitting
 * it does not mean "default": the codegen default for an `Int32` is 0, which
 * `ios/VLCPlayerView.swift:205-207` reads as `:avcodec-hw=none` — forced
 * *software* decoding, on a provider whose video is H.265. `-1` is the
 * library's documented `VLCHardwareDecoder.Automatic`, which adds no option at
 * all and lets VLCKit choose; the literal is used rather than the exported
 * constant so this file needs no runtime import from the package.
 */
function buildVlcSource(uri: string, userAgent: string | undefined): VLCPlayerSource {
  const agent = userAgent ?? PROVIDER_REQUEST_HEADERS["User-Agent"];
  return {
    uri,
    mediaOptions: [`:http-user-agent=${agent}`],
    isNetwork: true,
    autoplay: true,
    hwDecoderEnabled: -1,
  };
}

/**
 * libVLC behind `expo-video`'s surface, for live channels on iOS.
 *
 * ## What this object is
 *
 * `expo-video` gives the live screen a player that exists independently of any
 * view: `useVideoPlayer(null, setup)` at `[channelId].tsx:266` constructs one
 * for the screen's whole life, and `VideoView` is only a surface onto it.
 * libVLC has no such object. The native `VLCMediaPlayer` is created inside
 * `buildPlayerAndMedia` (`ios/VLCPlayerView.swift:179`), which is reached only
 * from `setSource`, which is reached only from `updateProps` when the source
 * prop carries a non-empty uri (`ios/VLCPlayerComponentView.mm:300-325`), and
 * `newPlayer.drawable = self` binds it to that one `UIView`.
 *
 * So this class *is* the player object the screen holds: a plain JS instance
 * that owns the event emitter, the state the surface renders from, and the
 * commands queued for whatever surface is mounted. It is created once per
 * screen and never replaced, which is what keeps the four hooks' and
 * `useEventListener`'s identity-based subscriptions stable.
 *
 * ## Which members are real
 *
 * `asLivePlayer` casts this to `expo-video`'s `VideoPlayer` (see `types.ts`
 * for why the surface is imitated rather than abstracted). The cast is only
 * honest because the live path uses a known, narrow set of members, and all of
 * them are implemented here:
 *
 *   `replaceAsync`, `play`, `pause`, `muted` (r/w), `volume` (r/w),
 *   `staysActiveInBackground` (w), `audioTrack` (w), `subtitleTrack` (w),
 *   `addListener` — and six events: `statusChange`, `playingChange`,
 *   `availableAudioTracksChange`, `availableSubtitleTracksChange`,
 *   `audioTrackChange`, `subtitleTrackChange`.
 *
 * Nothing else is touched by the live screen or by the four hooks it hands the
 * player to. In particular it reads none of `currentTime`, `duration`,
 * `playing` or `playbackRate` and writes none of them — those are the VOD
 * screens, which stay on `expo-video`. That is why libVLC's total lack of
 * synchronous position readers, the gap that looks fatal on paper, costs
 * nothing here. Anything outside that list is absent, and a caller that
 * reached for it would get `undefined` rather than a lie.
 */
export class VlcLivePlayer {
  private readonly listeners = new Map<string, Set<EngineListener>>();

  /** The source the screen last asked for, or null once it has been dropped. */
  private wantedUri: string | null = null;
  private wantedUserAgent: string | undefined;
  private sourceGeneration = 0;

  private statusValue: LivePlaybackStatus = "idle";
  private playingValue = false;
  private mutedValue = false;
  private volumeValue = 1;

  /** Per-media, reset with every source. */
  private sawPlaying = false;
  private sawTracks = false;
  private failed = false;

  /**
   * Stall detection state. `positionAdvanced` is the arming condition and it
   * is not optional: a live `.ts` with no PCR mapping libVLC can use reports
   * a clock that never moves at all, and on such a channel a position that
   * has never advanced is normal rather than a fault. Only a channel that has
   * been seen to advance once can be judged to have stopped.
   */
  private lastPosition = -1;
  private lastAdvanceAt = 0;
  private positionAdvanced = false;

  private audioTracksValue: AudioTrack[] = [];
  private subtitleTracksValue: SubtitleTrack[] = [];
  private currentAudioValue: AudioTrack | null = null;
  private currentSubtitleValue: SubtitleTrack | null = null;

  private surfaceRef: RefObject<VLCPlayerRef | null> | null = null;
  private readonly surfaceListeners = new Set<() => void>();
  private snapshot: VlcSurfaceSnapshot = {
    source: undefined,
    sourceKey: 0,
    paused: false,
    volume: 100,
    continueAudioInBackground: true,
  };
  /**
   * A fraction added to the volume prop so the next commit carries a
   * different `double` — see `reassertVolume`.
   */
  private volumeEpsilon = 0;

  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private trackPollTimer: ReturnType<typeof setTimeout> | null = null;
  private trackPollsLeft = 0;

  // ---------------------------------------------------------------- events

  /**
   * `useEventListener` needs nothing else.
   *
   * `node_modules/expo/src/hooks/useEvent.ts:97-111` calls
   * `eventEmitter.addListener(name, cb)` and `subscription.remove()`, and
   * that is the whole contract — no `SharedObject`, no native module, no
   * `EventEmitter` subclass. docs/IOS_READINESS.md:263-265 says this surface
   * "requires an Expo SharedObject"; it does not, and that line should be
   * corrected. A plain Map of callbacks satisfies every subscription on this
   * screen.
   */
  addListener(name: string, listener: EngineListener): { remove: () => void } {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener);
    return {
      remove: () => {
        set?.delete(listener);
      },
    };
  }

  /*
    Payloads are hand-written to `expo-video`'s own shapes at each call site
    (`VideoPlayerEvents.types.d.ts:73-99`), which is what the screen's and the
    hooks' handlers are typed against. They are `unknown` in here because the
    emitter is shared by six differently-shaped events; the cast that makes
    the screen's typing legal is `asLivePlayer`.
  */
  private emit(name: string, payload: unknown): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) listener(payload);
  }

  /**
   * Emitted **only on a real transition**, because the screen depends on that
   * in two places: `[channelId].tsx:1075-1081` (the retry budget is refilled
   * from the gap between failures precisely because `readyToPlay` does not
   * repeat) and `:148-152` (awaiting `idle` on an already-idle player hangs
   * for ever). libVLC flaps `Buffering` and `Playing` on a live `.ts`
   * (`ios/VLCPlayerView.swift:595-610`), and every duplicate `error` would
   * burn a retry at `:942`/`:1127` and reset the budget-refill clock at
   * `:1091`.
   */
  private setStatus(next: LivePlaybackStatus, error?: EngineClassifiedError): void {
    if (next === this.statusValue) return;
    const oldStatus = this.statusValue;
    this.statusValue = next;
    this.emit("statusChange", { status: next, oldStatus, error });
  }

  private setPlaying(next: boolean): void {
    if (next === this.playingValue) return;
    const oldIsPlaying = this.playingValue;
    this.playingValue = next;
    this.emit("playingChange", { isPlaying: next, oldIsPlaying });
  }

  /**
   * One failure per media, whatever libVLC says afterwards.
   *
   * The native player is released the instant libVLC reports an error
   * (`ios/VLCPlayerView.swift:630`), and the events that follow — `Stopped`,
   * a late `Buffering` — are the sound of it shutting down, not new
   * information. Letting them through would double-count against the retry
   * budget and walk the candidate list twice.
   */
  private fail(category: PlaybackErrorCategory, message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.clearWatchdog();
    this.cancelTrackPoll();
    /*
      Free the socket before the screen's retry opens the next one. libVLC
      has already done this for its own `.error` state; `Ended` and the
      watchdog arrive with the player still alive and holding a connection on
      a line that allows three.
    */
    this.releaseNative();
    /*
      And drop the source prop, which is not tidiness — it is the fix for a
      failure mode the release itself creates.

      `releaseNative()` sends the `clear` command (`src/VLCPlayerView.tsx:68`
      maps `release()` onto `Commands.clear`), and `clear` nils `_lastSource`
      as well as releasing the player (`VLCPlayerComponentView.mm:355-359`).
      Meanwhile `updateProps` runs its source block on **every** prop change,
      gated only on the uri being non-empty, and commits whenever the built
      dictionary differs from `_lastSource` — which nil always does
      (`.mm:300-325`). So a failed channel left in the prop is a live
      landmine: the error overlay is `pointerEvents="none"`
      (`[channelId].tsx:2059`), so the controls under it still work, and the
      first time the viewer taps mute or swipes volume the setter calls
      `update()`, the snapshot changes, `LiveVideoView` re-renders, and the
      channel that just failed is re-opened — with no error, no status
      change, no retry accounted for, and a connection taken on a line that
      allows three.

      Clearing it here makes the prop say what is true: there is nothing to
      play. Every legitimate retry goes through `replaceAsync`, which sets a
      fresh source and bumps `sourceKey`.
    */
    this.update({ source: undefined });
    this.setPlaying(false);
    this.setStatus("error", { message, engineCategory: category });
  }

  // ------------------------------------------------------------- commands

  /**
   * Hands libVLC a channel, or drops the current one.
   *
   * ## What the promise means, and why it must never reject
   *
   * It resolves as soon as the uri has been handed to the surface — "the
   * command was accepted", which is exactly what `replaceAsync` means on
   * Android and what `[channelId].tsx:810-814` and `:1093-1099` record
   * measuring. It resolves even when no surface is mounted yet (the screen's
   * first commit returns a bare `View` at `:1761-1763` while the split
   * preference loads, so the route-open effect at `:1269-1292` can genuinely
   * fire before any video view exists); the source is kept and applied the
   * moment one mounts.
   *
   * It never rejects. If a libVLC failure arrived both here and on
   * `statusChange`, the rejection arm at `:898-970` and the error arm at
   * `:1053-1198` would both run for one failure — two increments of
   * `retryCountRef` (`:942` and `:1127`) and two walks of the candidate list
   * (`:939` and `:1148`). On Android that rejection arm "almost never runs"
   * (`:1109-1113`); on iOS it never runs at all, and every failure routes
   * through `statusChange` alone.
   *
   * ## Why the surface is re-keyed per source
   *
   * Two independent reasons, both read out of the binding rather than
   * assumed:
   *
   * 1. **It keeps the source prop and the native view's idea of the source
   *    from drifting apart, in either direction.**
   *    `VLCPlayerComponentView.mm:321` compares the built source dictionary
   *    against `_lastSource` and calls `setSource` only when they differ, and
   *    the only things that clear `_lastSource` are the `clear` command
   *    (`.mm:355-359`) and unmount (`.mm:213-229`). That cuts both ways, and
   *    an earlier draft of this comment saw only one side of it:
   *
   *    - If `_lastSource` stands and the uri is re-supplied unchanged, the
   *      dictionaries compare equal and nothing happens. libVLC's own error
   *      state reaches that position — the Swift handler releases the player
   *      from inside (`VLCPlayerView.swift:625-630`) without going through
   *      the ObjC `clear` — so a retry of the same channel would be a silent
   *      no-op, killing the six busy retries at `[channelId].tsx:1126-1137`
   *      and the mid-playback retry at `:1182-1194`.
   *    - If `_lastSource` is nil and the uri prop still stands, the *next
   *      unrelated prop write* commits the source. `release()` is the `clear`
   *      command (`src/VLCPlayerView.tsx:68`), so this is the position the
   *      adapter itself creates on every failure, and it is the more
   *      dangerous half: a mute or a volume swipe re-opening a channel that
   *      has already failed, outside the retry budget. `fail()` drops the
   *      source prop for that reason; the note there has the sequence.
   *
   *    A fresh key per source sidesteps both, because a brand-new native view
   *    starts with `_lastSource` nil and a source prop that agrees with it.
   * 2. **It removes an ordering assumption.** `release()` is an imperative
   *    command and the source is a prop; they travel by different routes. A
   *    fresh key means the command can only ever reach the *outgoing* native
   *    view, so even if it arrived late it could not stop the stream it was
   *    supposed to precede.
   *
   * The cost is a native view rebuilt per channel change, which is close to
   * free here: `setSource` tears the `VLCMediaPlayer` down and builds a new
   * one anyway (`ios/VLCPlayerView.swift:159-165`), so the picture goes black
   * for the length of the open either way.
   *
   * ## Where this cannot match Android
   *
   * `releaseFirst` at `[channelId].tsx:875` is conditional there, because
   * stopping before opening costs audio quality through expo-video's
   * `AudioFocusManager` on a line with room to overlap. iOS cannot honour the
   * distinction: `setSource` always releases first. The adapter therefore
   * releases unconditionally — and the defect that made the condition worth
   * having does not exist on this path, since the focus loop measured at
   * `:820-873` is expo-video's, not libVLC's.
   */
  replaceAsync(source: VlcLiveSource | null): Promise<void> {
    if (!source) return this.releaseSource();

    this.wantedUri = source.uri;
    this.wantedUserAgent = source.headers?.["User-Agent"];
    this.sourceGeneration += 1;

    this.releaseNative();
    this.resetMediaState();

    this.update({
      source: buildVlcSource(source.uri, this.wantedUserAgent),
      sourceKey: this.sourceGeneration,
      /*
        Any paused state belongs to the channel that was playing. The screen
        calls `play()` in the resolve arm anyway (`:895`), but the prop has to
        agree or `buildPlayerAndMedia`'s `autoplay && !isPaused` check
        (`ios/VLCPlayerView.swift:215-217`) would decline to start the new
        channel on a player the viewer had paused.
      */
      paused: false,
    });

    this.setStatus("loading");
    this.armWatchdog();
    this.startTrackPoll();
    return Promise.resolve();
  }

  /**
   * Drops the source and lets go of the provider connection — the explicit
   * form of what `replaceAsync(null)` does on Android.
   *
   * It is a separate call because `null` has no libVLC meaning: a source with
   * an empty uri is ignored outright (`VLCPlayerComponentView.mm:301` gates
   * the whole block on `!src.uri.empty()`), so handing one over would leave
   * the old channel playing and the connection held. The `clear` command is
   * the only thing that actually stops it, and `releasePlayer`
   * (`ios/VLCPlayerView.swift:916-931`) calls `p.stop()`, which in libVLC 3.x
   * is synchronous — so unlike Android, where the close happens on
   * ExoPlayer's own thread after the promise resolves, the socket should
   * genuinely be shut when this returns. The screen's `SOURCE_RELEASE_MS`
   * beat is therefore pessimistic here rather than wrong, and it is left
   * alone: it costs 250ms on a one-connection line and nothing at all on
   * this operator's three-connection one.
   */
  releaseSource(): Promise<void> {
    this.wantedUri = null;
    this.wantedUserAgent = undefined;
    this.clearWatchdog();
    this.releaseNative();
    this.resetMediaState();
    this.update({ source: undefined });
    this.setPlaying(false);
    this.setStatus("idle");
    return Promise.resolve();
  }

  /**
   * `play()` is also how a paused libVLC player is unpaused for the *next*
   * media: `ios/VLCPlayerView.swift:230` clears `isPaused` even when there is
   * no player yet, which is what lets a channel tuned after a pause start by
   * itself. The command and the prop are both set — the command because
   * `setPaused` is only called when the prop actually changes, and the prop
   * because libVLC's own interruption handling (`:115-125`) can pause
   * playback behind the adapter's back and the two must not drift.
   */
  play(): void {
    this.surfaceRef?.current?.play();
    if (this.snapshot.paused) this.update({ paused: false });
    /*
      This can also be the start of an open rather than a resume, and then it
      needs everything an open gets.

      The case is a surface that mounted paused — the viewer paused a channel
      and turned the phone, so `attachSurface` deliberately armed nothing. The
      native player exists but has never decoded a frame, and the open does
      not actually begin until here. Without this the deferred open runs with
      no watchdog, so a channel that has gone off the air in the meantime
      would spin for ever, and with no track poll, so its audio tracks would
      never be discovered.

      `sawPlaying` is what separates the two: a media that has played is being
      resumed, and libVLC resumes from its own buffer with nothing to wait
      for.
    */
    if (this.snapshot.source !== undefined && !this.sawPlaying && !this.failed) {
      this.setStatus("loading");
      this.armWatchdog();
      this.startTrackPoll();
    }
  }

  pause(): void {
    this.surfaceRef?.current?.pause();
    if (!this.snapshot.paused) this.update({ paused: true });
  }

  // ------------------------------------------------------------ properties

  get muted(): boolean {
    return this.mutedValue;
  }

  /**
   * Mute is applied as a volume of zero, deliberately bypassing the library's
   * own `muted` prop.
   *
   * `ios/VLCPlayerView.swift:431-438` implements mute by stashing the current
   * volume in `preVolume` and writing 0. Two things break that here.
   * `VLCPlayerComponentView.mm` applies `muted` at :250 but the source at
   * :321, so a mute that arrives with the first mount runs against a player
   * that does not exist yet — the mute is dropped *and* `preVolume` is
   * poisoned to 0, so a later unmute sets the volume to zero. And every
   * channel switch builds a fresh `VLCMediaPlayer` at volume 100, which that
   * stashed value knows nothing about.
   *
   * Folding mute into the volume the adapter already owns has neither
   * problem, and `usePlayerMute` never reads the property back
   * (`usePlayerMute.ts:16-21` explains why it mirrors the value in React
   * state instead), so nothing notices the difference.
   */
  set muted(next: boolean) {
    if (next === this.mutedValue) return;
    this.mutedValue = next;
    this.update({ volume: this.vlcVolume() });
  }

  get volume(): number {
    return this.volumeValue;
  }

  /**
   * `expo-video`'s 0..1 scaled to libVLC's 0..200, where 100 is unity
   * (types.ts:87-88) and `VLCPlayerComponentView.mm:260` casts to `int`.
   *
   * `usePlayerGestures` throttles these writes to one per 60ms and re-asserts
   * the chosen level twice after the finger lifts (`:139`, `:161`). Every
   * reason for both is an expo-video Android defect — `AudioFocusManager`
   * halving the property on a duck, the player mirroring external changes
   * back in — and none of it exists on this path. They are left in place
   * rather than made conditional: they are harmless here, and the hook also
   * reads `player.volume` and `player.muted` back inside a trace template
   * (`:426`, `:465`) that is evaluated on every write even with
   * `GESTURE_DEBUG` off, so both getters above have to answer. The adapter's
   * own last-written values are the correct answer, and the hook already
   * treats them as the source of truth (`:216-241`).
   */
  set volume(next: number) {
    /*
      A non-finite value is dropped rather than clamped. `usePlayerGestures`
      already closes the three places a `NaN` could come from
      (`usePlayerGestures.ts:351-387`, which records what one cost on
      Android: `ExoPlayer.setVolume(NaN)` changed no gain and logged
      nothing), and clamping it here would turn a bad number into full
      volume, which is the loudest possible way to be wrong.
    */
    if (!Number.isFinite(next)) return;
    const clamped = clamp01(next);
    if (clamped === this.volumeValue) return;
    this.volumeValue = clamped;
    this.update({ volume: this.vlcVolume() });
  }

  get staysActiveInBackground(): boolean {
    return this.snapshot.continueAudioInBackground;
  }

  /**
   * A pass-through onto `continueAudioInBackground`: the two properties have
   * the same polarity, so the setter writes `next` unchanged. (An earlier
   * draft of this comment said "inverted", which it is not — libVLC keeps
   * playing while backgrounded when the prop is true and pauses when it is
   * false, `types.ts:93-96`. Anyone who "fixed" the setter to match the word
   * would invert background playback for every viewer.)
   *
   * The screen still needs its own `AppState` handler at
   * `[channelId].tsx:1491-1514`, and for a reason worth stating: libVLC's
   * `false` behaviour *auto-resumes* on foreground
   * (`ios/VLCPlayerView.swift:95-102`), which is the opposite of what that
   * effect wants — it drops the source entirely so the provider connection is
   * not held while the app is away. The two do not fight, because
   * `releasePlayer` clears `shouldResumePlaying` and the foreground handler
   * bails on a null player; the screen's own re-select on resume is what
   * brings the channel back.
   */
  set staysActiveInBackground(next: boolean) {
    if (next === this.snapshot.continueAudioInBackground) return;
    this.update({ continueAudioInBackground: next });
  }

  get audioTrack(): AudioTrack | null {
    return this.currentAudioValue;
  }

  /**
   * `expo-video` selects a track by handing back an object from the
   * `availableAudioTracks` payload; libVLC selects by integer id
   * (`selectAudioTrack` → `currentAudioTrackIndex`,
   * `ios/VLCPlayerView.swift:310-312`). The integer travels inside the
   * synthesized string id — see `toAudioTrack`.
   *
   * The echo is optimistic because libVLC confirms nothing: there is no
   * equivalent of `audioTrackChange` anywhere in the binding, and without an
   * echo `currentAudioTrack` would stay null for ever and no row in the track
   * sheet would ever show as selected (`TrackSelectorModal.tsx:99`).
   *
   * A `getTracks()` is requested straight after, so the echo is reconciled
   * against the player's real `currentAudioTrackIndex` and a selection libVLC
   * refused corrects itself. It cannot be left to the regular poll: that runs
   * for `TRACK_POLL_COUNT` ticks from the source and then stops, about
   * eighteen seconds in, while the track chip stays on screen for as long as
   * the channel plays (`[channelId].tsx:2240`). A viewer switching audio a
   * minute into a channel would otherwise see a permanently wrong row and
   * have no way to tell a refused selection from an applied one. The call is
   * local — it reads `audioTrackIndexes` off the player — and costs no
   * provider request.
   */
  set audioTrack(track: AudioTrack | null) {
    const id = track === null ? -1 : vlcTrackId(track);
    /*
      An id that is not one of ours would mean "disable audio" if it were
      passed through as -1, so it does nothing instead.
    */
    if (id === null) return;
    this.surfaceRef?.current?.selectAudioTrack(id);
    this.setCurrentAudio(id < 0 ? null : track);
    this.surfaceRef?.current?.getTracks();
  }

  get subtitleTrack(): SubtitleTrack | null {
    return this.currentSubtitleValue;
  }

  /** As `audioTrack`, with -1 for the sheet's explicit "off" row (types.ts:153-154). */
  set subtitleTrack(track: SubtitleTrack | null) {
    const id = track === null ? -1 : vlcTrackId(track);
    if (id === null) return;
    this.surfaceRef?.current?.selectSubtitleTrack(id);
    this.setCurrentSubtitle(id < 0 ? null : track);
    this.surfaceRef?.current?.getTracks();
  }

  // --------------------------------------------------------- the surface

  readonly subscribeSurface = (onStoreChange: () => void): (() => void) => {
    this.surfaceListeners.add(onStoreChange);
    return () => {
      this.surfaceListeners.delete(onStoreChange);
    };
  };

  readonly getSurfaceSnapshot = (): VlcSurfaceSnapshot => this.snapshot;

  /**
   * A surface has mounted, which on libVLC means a brand-new native player
   * for whatever source is current.
   *
   * This is the one behaviour the adapter cannot hide, and it is written down
   * here rather than faked. The live screen returns two mutually exclusive
   * trees — `[channelId].tsx:1795-1831` for the split layout and
   * `:1833-2377` for fullscreen — and at child position 0 the element types
   * differ, so React unmounts the whole subtree on every rotation. With
   * `expo-video` that is free: the player is a shared object the screen owns
   * and `VideoView` is only a window onto it, which is exactly the invariant
   * `SplitChannelView.tsx:28-33` describes. libVLC has no such separation:
   * `prepareForRecycle`, `invalidate` and the Swift `deinit` all call
   * `releasePlayer` unconditionally, so unmounting the view *is* stopping the
   * stream, and no adapter can deliver "one player, two render trees".
   *
   * What it does instead is re-open the channel itself, here, without
   * involving the screen: no error is emitted, so no retry budget is spent,
   * and the screen simply sees `loading` and then `readyToPlay` again. The
   * cost is one provider request and a re-buffer per rotation — a human
   * action, not a burst, so it is nowhere near the request rate the panel
   * objects to.
   *
   * The alternative is to restructure those two returns into one tree that
   * mounts the video surface exactly once and positions it by style. That is
   * the better answer and it is a layout edit, not a playback edit — but it
   * touches the render path of the Android build that ships today, which this
   * work is not allowed to change, and it cannot be verified on either
   * platform from here. It is the first thing to do if the rotation gap turns
   * out to be objectionable on a real iPhone.
   */
  attachSurface(ref: RefObject<VLCPlayerRef | null>): void {
    this.surfaceRef = ref;
    /*
      The gate is the source *prop*, not `wantedUri`, because the prop is what
      the incoming native view will actually commit — and the two differ in
      exactly the case that matters. `fail()` clears the prop and leaves
      `wantedUri` set, so a rotation on an error screen reaches here with
      nothing to open. Keyed on `wantedUri` this method would then reset
      `failed`, show a spinner and arm the watchdog against a view that can
      never emit `Playing`, and fifteen seconds later report a second failure
      in a different category than the first — which the screen would take for
      a fresh fault and spend a retry on. The error has to stand until the
      screen itself retries, because the screen owns the retry budget.
    */
    if (this.snapshot.source === undefined) return;
    this.resetMediaState();
    /*
      A surface that is going to mount paused has no open to wait for, so it
      gets neither the spinner nor the watchdog.

      `buildPlayerAndMedia` starts playback only when the prop agrees —
      `if autoplay && !isPaused { play() }` (`ios/VLCPlayerView.swift:214-216`)
      — so a channel the viewer paused before turning the phone mounts, sits
      there correctly paused, and never emits `Playing`. Arming the watchdog
      anyway meant fifteen seconds of spinner over a deliberately paused
      picture and then a manufactured `network_timeout`: the screen's error
      arm would take it for a real failure, walk the remaining candidate URL
      shapes or spend a mid-playback retry, and `replaceAsync` sets
      `paused: false` — so the channel the viewer paused would come back
      playing, from an error that never happened.
    */
    if (this.snapshot.paused) return;
    this.setStatus("loading");
    this.armWatchdog();
    this.startTrackPoll();
  }

  /**
   * Identity-guarded because a rotation mounts the replacement before or
   * after this runs depending on the commit, and the ref object is already
   * `null`-ed by React when a cleanup runs — so the object, never its
   * current value, is what identifies the surface being let go.
   *
   * The status is deliberately left alone: on a rotation `attachSurface`
   * sets it a moment later, and an `idle` in between would be a flicker the
   * screen would render as "nothing is happening".
   */
  detachSurface(ref: RefObject<VLCPlayerRef | null>): void {
    if (this.surfaceRef !== ref) return;
    this.surfaceRef = null;
    this.clearWatchdog();
    this.cancelTrackPoll();
    this.setPlaying(false);
  }

  // ---------------------------------------------------- libVLC callbacks

  /**
   * `LoadStart`, emitted at the end of `buildPlayerAndMedia` (Swift:218).
   *
   * This is also the earliest moment at which a volume can be written, and
   * writing it here is what stops every channel change from starting at full
   * volume. The order inside `buildPlayerAndMedia` is `player = newPlayer`
   * (Swift:211), then `play()` if the prop allows, then this event (Swift:218)
   * — so by the time it crosses the bridge the player exists. Before that it
   * does not: `setVolume` is `player?.audio?.volume = ...` (Swift:425-429),
   * which silently does nothing on a nil player, and the volume prop is
   * applied *before* the source in the same commit (`.mm:260` against
   * `:300`), so a level set alongside a channel change always lands on the
   * outgoing player. Waiting for `Playing` instead — which is what this
   * adapter did first — left the gap audible: a muted or quietened channel
   * played at libVLC's default 100 from the first decoded sample until the
   * `Playing` notification completed its round trip to JS.
   */
  readonly handleLoadStart = (): void => {
    if (this.failed) return;
    /*
      A player built paused announces LoadStart like any other, but it will
      not play and so will never answer with `Playing`. Reporting `loading`
      for it puts the screen's spinner (`[channelId].tsx:2034`, and
      `SplitChannelView`'s own) over a view that is deliberately stopped, with
      nothing coming to take it away. The volume still has to be written here
      — that is this handler's other job and it does not depend on playing.
    */
    if (!this.snapshot.paused) this.setStatus("loading");
    this.reassertVolume();
  };

  /**
   * libVLC's `.opening`, which the binding emits as `onLoad`
   * (`VLCPlayerComponentView.mm:149-156`). It means "about to open", not
   * "ready" — the first `Playing` is the ready signal.
   */
  readonly handleOpening = (): void => {
    if (!this.failed) this.setStatus("loading");
  };

  /**
   * `isBuffering` is the only boolean any libVLC payload actually fills
   * (Swift:600 sets it to `!p.isPlaying`); the rest of the struct is left nil
   * and arrives as `false` through `.mm:163-167`, `isPlaying` included — so
   * every "is playing" boolean in every payload is a lie and the state is
   * derived from *which* callback fired instead.
   *
   * Reading it is what keeps the spinner off the screen during an ordinary
   * mid-stream rebuffer, which on a live `.ts` happens often.
   */
  readonly handleBuffer = (event: VLCStateChangeEvent): void => {
    if (this.failed) return;
    if (event.isBuffering) this.setStatus("loading");
  };

  /*
    The `failed` guard is not symmetry with the other callbacks — it is the
    one place where its absence would be dangerous. `fail()` has already
    released the native player, so a `Playing` that was in flight across the
    bridge when it ran describes a player that no longer exists. Without the
    guard it would set `readyToPlay` over the error the screen has just been
    told about, clear the watchdog, and leave the adapter in a state where
    every further error callback is deaf (`failed` is still true) and nothing
    is armed to time out: a screen reporting a healthy channel, with no
    picture and no way back.
  */
  readonly handlePlaying = (): void => {
    if (this.failed) return;
    this.clearWatchdog();
    this.sawPlaying = true;
    this.lastAdvanceAt = Date.now();
    this.setStatus("readyToPlay");
    this.setPlaying(true);
    this.reassertVolume();
  };

  readonly handlePaused = (): void => {
    this.setPlaying(false);
  };

  /**
   * The only reader of a position in this adapter, and it reads it to decide
   * whether the stream is still alive — see `STALL_TIMEOUT_MS`.
   *
   * Everything here is a guard against calling a working channel dead:
   *
   *   - before the first `Playing` the open watchdog owns the timeout;
   *   - `positionAdvanced` keeps a channel whose clock never moves out of it
   *     entirely;
   *   - a paused channel is supposed to be frozen, so the clock is pushed
   *     forward rather than judged — otherwise a pause longer than the
   *     timeout would be reported as a dropped connection the moment the
   *     viewer came back;
   *   - and `fail` is once per media, so a stall cannot double-count against
   *     the screen's retry budget.
   */
  readonly handleProgress = (event: VLCProgressEvent): void => {
    if (this.failed || !this.sawPlaying) return;

    const position = event.currentTime;
    if (!Number.isFinite(position)) return;

    const now = Date.now();

    if (position > this.lastPosition) {
      this.lastPosition = position;
      this.lastAdvanceAt = now;
      this.positionAdvanced = true;
      return;
    }

    if (!this.positionAdvanced) return;

    if (this.snapshot.paused) {
      this.lastAdvanceAt = now;
      return;
    }

    if (now - this.lastAdvanceAt >= STALL_TIMEOUT_MS) {
      this.fail("network_timeout", "the stream stopped advancing while still connected");
    }
  };

  /**
   * `Stopped` is reported for the adapter's own `release()` as well as for a
   * real stop, so it only means `idle` when the source has actually been
   * dropped. Treating it as `idle` unconditionally would put an `idle` in the
   * middle of every channel switch, between the release and the open.
   */
  readonly handleStopped = (): void => {
    this.setPlaying(false);
    if (this.wantedUri === null) this.setStatus("idle");
  };

  /**
   * A live channel never legitimately ends, and this is how the common case
   * arrives: when a server closes a progressive `.ts` response, libVLC
   * reaches `.ended` rather than `.error` (`ios/VLCPlayerView.swift:611-623`).
   * Mapped to anything benign, a dropped channel would freeze with no message
   * and no retry.
   *
   * `repeat` is left false for the same reason. It would restart on `Ended`
   * inside the native view (`:612-614`), bypassing the screen's bounded retry
   * budget entirely and opening a connection the screen does not know it has.
   */
  readonly handleEnded = (): void => {
    if (this.sawPlaying) {
      this.fail("network_timeout", "libVLC reported end of stream on a live channel");
      return;
    }
    /*
      Closed before a frame arrived. The panel's anti-flood response is an
      empty-bodied 404 (AGENTS.md), which is exactly what an immediate,
      contentless end looks like from here — and the right answer to a rate
      block is the busy wait, not a walk through four more URL shapes.
    */
    this.fail(OPAQUE_OPEN_FAILURE_CATEGORY, "libVLC closed the stream before any data arrived");
  };

  /**
   * The error payload carries nothing — no code, no message
   * (`specs/VLCPlayerNativeComponent.ts:17-25`; emitted with only
   * type/currentTime/duration at `ios/VLCPlayerView.swift:625-629`) — so the
   * category comes from libVLC's own state machine, which is the only
   * evidence there is:
   *
   *   - it was playing a moment ago → the transport dropped;
   *   - a track list had arrived, so the container demuxed → a decode
   *     problem, which finally gives `decoder_failure` a real producer on a
   *     platform where ExoPlayer's "decod" wording will never appear. (libVLC
   *     carries MP2 natively, so the class of failure the vendored FFmpeg
   *     decoder exists to fix on Android should not occur here at all.)
   *   - nothing demuxed → the 403/404 pair, see
   *     `OPAQUE_OPEN_FAILURE_CATEGORY`.
   */
  readonly handleError = (): void => {
    if (this.sawPlaying) {
      this.fail("network_timeout", "libVLC error during playback — the connection dropped");
      return;
    }
    if (this.sawTracks) {
      this.fail("decoder_failure", "libVLC error after the container demuxed");
      return;
    }
    this.fail(OPAQUE_OPEN_FAILURE_CATEGORY, "libVLC error while opening, with no reason available");
  };

  /**
   * One `onTracks` carries both lists and both current indices, so it fans
   * out into up to four of `expo-video`'s events — and only on a real change,
   * because this is polled and most polls return what the last one did.
   */
  readonly handleTracks = (tracks: VLCPlayerTracks): void => {
    const audio = tracks.audio.filter(isSelectableTrack).map(toAudioTrack);
    const subtitle = tracks.subtitle.filter(isSelectableTrack).map(toSubtitleTrack);

    if (audio.length > 0 || subtitle.length > 0) this.sawTracks = true;

    if (trackSignature(audio) !== trackSignature(this.audioTracksValue)) {
      this.audioTracksValue = audio;
      this.emit("availableAudioTracksChange", { availableAudioTracks: audio });
    }
    if (trackSignature(subtitle) !== trackSignature(this.subtitleTracksValue)) {
      this.subtitleTracksValue = subtitle;
      this.emit("availableSubtitleTracksChange", { availableSubtitleTracks: subtitle });
    }

    this.setCurrentAudio(audio.find((track) => track.id === String(tracks.audioIndex)) ?? null);
    this.setCurrentSubtitle(
      subtitle.find((track) => track.id === String(tracks.subtitleIndex)) ?? null
    );
  };

  // ------------------------------------------------------------ internals

  private update(patch: Partial<VlcSurfaceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.surfaceListeners]) listener();
  }

  private vlcVolume(): number {
    const level = this.mutedValue ? 0 : Math.round(clamp01(this.volumeValue) * 100);
    return level + this.volumeEpsilon;
  }

  /**
   * Writes the volume again as soon as a player exists, which is not belt and
   * braces but a requirement.
   *
   * Every source builds a brand-new `VLCMediaPlayer` at libVLC's own default
   * volume, and the volume prop is applied *before* the source in the same
   * commit (`VLCPlayerComponentView.mm:260` against `:300`), so a level set
   * alongside a channel change lands on a player that is about to be
   * replaced. On the very first mount it is worse: `oldProps` is the codegen
   * default, so the prop is applied to a player that does not exist yet —
   * and `setVolume` is `player?.audio?.volume = ...` (Swift:425-429), which
   * fails silently rather than queueing.
   *
   * Called from `handleLoadStart`, not from `handlePlaying`: see that handler
   * for why the difference is audible on every zap. `handlePlaying` calls it
   * too, because libVLC rebuilds its audio output on some transitions and the
   * second write costs nothing.
   *
   * Re-sending it needs the `double` to differ, since Fabric applies a prop
   * only when `newProps.volume != old.volume` — and `.mm:260` casts to `int`,
   * so a half-unit offset passes that test and changes no gain. Flipping the
   * offset is therefore an inaudible way to say "apply this again".
   */
  private reassertVolume(): void {
    this.volumeEpsilon = this.volumeEpsilon === 0 ? 0.5 : 0;
    this.update({ volume: this.vlcVolume() });
  }

  private setCurrentAudio(next: AudioTrack | null): void {
    if ((next?.id ?? null) === (this.currentAudioValue?.id ?? null)) return;
    this.currentAudioValue = next;
    this.emit("audioTrackChange", { audioTrack: next });
  }

  private setCurrentSubtitle(next: SubtitleTrack | null): void {
    if ((next?.id ?? null) === (this.currentSubtitleValue?.id ?? null)) return;
    this.currentSubtitleValue = next;
    this.emit("subtitleTrackChange", { subtitleTrack: next });
  }

  /**
   * Clears the track state on every source, including a retry of the same
   * channel.
   *
   * `usePlaybackTracks` has a reset of its own, but it is keyed on
   * `providerItemId` (`[channelId].tsx:435-440`) and a retry of the same
   * channel does not change that — while the `VLCMediaPlayer` underneath is
   * new and its elementary-stream ids may have moved. Left alone, a stale
   * selection either highlights nothing or highlights the wrong language.
   */
  private resetMediaState(): void {
    this.sawPlaying = false;
    this.sawTracks = false;
    this.failed = false;
    this.lastPosition = -1;
    this.lastAdvanceAt = 0;
    this.positionAdvanced = false;
    this.cancelTrackPoll();

    if (this.audioTracksValue.length > 0) {
      this.audioTracksValue = [];
      this.emit("availableAudioTracksChange", { availableAudioTracks: [] });
    }
    if (this.subtitleTracksValue.length > 0) {
      this.subtitleTracksValue = [];
      this.emit("availableSubtitleTracksChange", { availableSubtitleTracks: [] });
    }
    this.setCurrentAudio(null);
    this.setCurrentSubtitle(null);
  }

  private releaseNative(): void {
    this.surfaceRef?.current?.release();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      this.fail("network_timeout", "libVLC did not start playing within the open timeout");
    }, OPEN_WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer === null) return;
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private startTrackPoll(): void {
    this.cancelTrackPoll();
    this.trackPollsLeft = TRACK_POLL_COUNT;
    this.trackPollTimer = setTimeout(this.pollTracks, TRACK_POLL_DELAY_MS);
  }

  private readonly pollTracks = (): void => {
    this.trackPollTimer = null;
    this.surfaceRef?.current?.getTracks();
    this.trackPollsLeft -= 1;
    if (this.trackPollsLeft > 0) {
      this.trackPollTimer = setTimeout(this.pollTracks, TRACK_POLL_INTERVAL_MS);
    }
  };

  private cancelTrackPoll(): void {
    this.trackPollsLeft = 0;
    if (this.trackPollTimer === null) return;
    clearTimeout(this.trackPollTimer);
    this.trackPollTimer = null;
  }

  // -------------------------------------------------------------- teardown

  /**
   * Called when the screen that owns this player unmounts — see
   * `useLivePlayer` in `../livePlaybackEngine.ios.tsx`.
   *
   * `detachSurface` covers the ordinary case, because the surface unmounts
   * with the screen and clears both timers on the way out. It does not cover
   * the case the screen actually creates: `[channelId].tsx` returns a bare
   * `View` on its first commit while the split preference loads, so no
   * surface is mounted yet, and its route-open effect can call `replaceAsync`
   * in that window. That arms the watchdog and starts the track poll with no
   * surface to detach. A viewer who presses back during the open — which is
   * precisely when a channel is slow — leaves a 15-second timer holding this
   * object, and `fail()` then emits a `statusChange` to listeners the screen
   * has already removed.
   *
   * Nothing catches fire either way; `useEventListener` unsubscribes on
   * unmount and the emit lands nowhere. But the player is meant to die with
   * its screen, and a timer that outlives it is the kind of thing that is
   * harmless until someone adds a retry to the failure path.
   *
   * The native side needs nothing from here: the surface's own unmount
   * releases the `VLCMediaPlayer` through `prepareForRecycle` / `invalidate`
   * (`VLCPlayerComponentView.mm:213-229`), which is the behaviour
   * `attachSurface` documents at length.
   */
  dispose(): void {
    this.clearWatchdog();
    this.cancelTrackPoll();
    this.surfaceRef = null;
    this.listeners.clear();
    this.surfaceListeners.clear();
  }
}

/**
 * The one cast in the engine, and the reason it is legal: see this class's
 * doc comment for the list of members the live path actually uses, every one
 * of which is implemented above. `types.ts` explains why the surface is
 * `expo-video`'s rather than an interface of our own.
 */
export function asLivePlayer(player: VlcLivePlayer): LivePlayer {
  return player as unknown as LivePlayer;
}

/** The inverse, for the engine's own entry points. */
export function asVlcLivePlayer(player: LivePlayer): VlcLivePlayer {
  return player as unknown as VlcLivePlayer;
}
