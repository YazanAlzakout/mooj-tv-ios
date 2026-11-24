import VLCPlayerView, { type VLCPlayerRef, type VLCResizeMode } from "@lunarr/vlc-player";
import type { VideoContentFit } from "expo-video";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BRAND } from "@/core/brand";

import type { LivePlayer, LivePlayerSetup, LiveVideoViewProps } from "./types";
import { asLivePlayer, asVlcLivePlayer, VlcLivePlayer } from "./vlc/VlcLivePlayer";

/**
 * The libVLC live playback engine — iOS only.
 *
 * ## Why iOS has a second engine at all
 *
 * `expo-video` on iOS is AVPlayer, and AVFoundation refuses the bare
 * progressive MPEG-TS that every one of this provider's 11,294 channels is
 * served as. That is not a guess: on a real iPhone, Safari — the same
 * AVFoundation stack — showed a white page for a channel while playing an mp4
 * film from the same account, and the free VLC app played that same channel
 * (2026-11-18, docs/IOS_READINESS.md:288-312). Android keeps `expo-video` +
 * Media3 + the vendored FFmpeg MP2 decoder exactly as it is, and
 * `react-native.config.js` keeps libVLC out of that build entirely.
 *
 * ## Why an adapter instead of a second screen
 *
 * `src/app/live/player/[channelId].tsx` is 2,521 lines and nearly all of it is
 * measured on hardware: channel switching that must not reconstruct the
 * player, connection-slot behaviour on a three-connection line, audio-focus
 * workarounds, bounded retries, a split layout that shares one player across
 * rotation. There is no iPhone on this project, so a second screen written
 * against a second engine could not be verified against any of it. This file
 * and `vlc/VlcLivePlayer.ts` present the surface that screen already calls,
 * so the screen's own change is its import line plus the two differences it
 * genuinely has to know about (`releaseLiveSource`, and the error category it
 * now prefers — see `enginePlaybackError.ts`).
 *
 * Every place the two engines cannot be made to agree is written down where
 * it happens, never papered over. The three that matter: a surface unmount
 * stops libVLC playback and the adapter re-opens the channel itself
 * (`VlcLivePlayer.attachSurface`), a libVLC failure carries no HTTP status so
 * one of 403/404 has to be assumed (`OPAQUE_OPEN_FAILURE_CATEGORY`), and
 * there is no picture-in-picture (below).
 */
export const LIVE_PLAYBACK_ENGINE = "libvlc" as const;

/**
 * `contentFit` straight across. libVLC calls the stretch mode `stretch`
 * (types.ts:71, applied at `ios/VLCPlayerView.swift:468-488`); the other two
 * share their names with `expo-video`.
 */
const RESIZE_MODES: Record<VideoContentFit, VLCResizeMode> = {
  contain: "contain",
  cover: "cover",
  fill: "stretch",
};

/**
 * `onProgress` cadence, in milliseconds.
 *
 * Nothing on the live screen reads a position — it is live television — and
 * this was 10s on that basis, as the cheapest cadence the binding allows
 * short of 0, which makes libVLC emit on every time change
 * (`ios/VLCPlayerView.swift:638`) and bridge an event per tick for nobody.
 *
 * The adapter now reads it, for one purpose: a position that stops advancing
 * while the connection stays open is the only evidence available that a
 * channel has died, since no state change is delivered for it. See
 * `STALL_TIMEOUT_MS` in `vlc/VlcLivePlayer.ts`. Five seconds gives four flat
 * readings inside that timeout, which is enough to be sure and still one
 * bridge event every five seconds — cheaper than the 1s cadence the VOD
 * screens run at on the other engine.
 */
const PROGRESS_INTERVAL_MS = 5_000;

/**
 * What the lock screen, Control Center, CarPlay and a paired watch are told
 * is playing.
 *
 * `showNowPlaying` is true (see `LiveVideoView` for why it has to be), so a
 * Now Playing entry is published for every channel whether or not anything
 * fills it in. Left empty, the binding falls back to libVLC's own media title
 * and then to the URL's last path component
 * (`ios/VLCPlayerView.swift:787-813`) — which for this provider is a bare
 * stream id like `283572.ts`, and for a libVLC-supplied title could be more
 * of the MRL than belongs on a lock screen, given these URLs carry the
 * viewer's username and password as path segments.
 *
 * A constant is used rather than the channel name because the adapter is
 * never told the channel name: `replaceAsync` takes the source shape the
 * screen already passes to `expo-video`, `{ uri, headers }`, and widening it
 * would mean changing a call the Android engine shares. The channel name
 * would be better and the prop supports it — an override title wins over the
 * media title at `swift:755` — so if it is ever wanted, the route is a small
 * adapter method the screen calls when it selects a channel, not a change to
 * `replaceAsync`.
 */
const NOW_PLAYING = { title: BRAND.displayName } as const;

/**
 * Constructs the player object the screen holds for its whole life.
 *
 * `useState` with an initializer rather than `useMemo`, because a player that
 * React is free to drop and rebuild is a dropped stream. `setup` is called
 * during the initializer — that is, during **render** — which is where
 * `useVideoPlayer` calls it too, and the live screen reports
 * `PlayerLifecycleMonitor.playerConstructed()` from there (the monitor defers
 * its own notification by a microtask for exactly this reason, see its note
 * at `PlayerLifecycleMonitor.ts:112-127`).
 *
 * The unmount effect is what gives the player the same lifetime as the screen.
 * `expo-video` gets that from `useReleasingSharedObject`; here it has to be
 * written down, and `detachSurface` is not enough on its own — see
 * `VlcLivePlayer.dispose` for the window the screen opens where timers are
 * armed with no surface to detach.
 */
export function useLivePlayer(setup: LivePlayerSetup): LivePlayer {
  const [player] = useState(() => {
    const created = asLivePlayer(new VlcLivePlayer());
    setup(created);
    return created;
  });

  useEffect(() => {
    return () => {
      asVlcLivePlayer(player).dispose();
    };
  }, [player]);

  return player;
}

export function releaseLiveSource(player: LivePlayer): Promise<void> {
  return asVlcLivePlayer(player).releaseSource();
}

/**
 * The video surface.
 *
 * Unlike `expo-video`'s `VideoView`, this **is** the player: the native
 * `VLCMediaPlayer` is built inside the view and bound to it as its drawable
 * (`ios/VLCPlayerView.swift:179-182`), and every unmount path —
 * `prepareForRecycle`, `invalidate`, `deinit` — releases it. The adapter owns
 * that difference; see `VlcLivePlayer.attachSurface`.
 *
 * `nativeControls` is accepted and ignored because libVLC draws no controls to
 * suppress. `allowsPictureInPicture` is accepted and ignored because there is
 * no counterpart at all — picture-in-picture, AirPlay and Now Playing are the
 * feature gap on this path, accepted as a decision in docs/DECISIONS.md.
 *
 * `showNowPlaying` is left at the library's default of true, and that is not
 * cosmetic: the `AVAudioSession` `.playback` category is set only inside
 * `setupNowPlayingControls` (`ios/VLCPlayerView.swift:665-667`), which only
 * runs when that prop is true. With it false the audio session is never
 * configured, so the ring/silent switch would silence the channel and
 * background playback would not work at all.
 */
export function LiveVideoView({ player, style, contentFit }: LiveVideoViewProps) {
  const engine = asVlcLivePlayer(player);
  const ref = useRef<VLCPlayerRef | null>(null);
  const surface = useSyncExternalStore(engine.subscribeSurface, engine.getSurfaceSnapshot);

  useEffect(() => {
    engine.attachSurface(ref);
    return () => engine.detachSurface(ref);
  }, [engine]);

  /*
    `key={surface.sourceKey}` re-mounts the native view for every source, and
    the two reasons are in `VlcLivePlayer.replaceAsync`: an identical source
    dictionary is compared against `_lastSource` and skipped
    (`VLCPlayerComponentView.mm:321`), which would make every same-channel
    retry a silent no-op; and a fresh native view means the imperative
    `release()` that precedes a switch can only ever reach the outgoing one.
  */
  return (
    <VLCPlayerView
      key={surface.sourceKey}
      ref={ref}
      style={style}
      source={surface.source}
      paused={surface.paused}
      volume={surface.volume}
      rate={1}
      repeat={false}
      resizeMode={RESIZE_MODES[contentFit ?? "contain"]}
      continueAudioInBackground={surface.continueAudioInBackground}
      showNowPlaying
      nowPlayingMetadata={NOW_PLAYING}
      progressUpdateInterval={PROGRESS_INTERVAL_MS}
      onProgress={engine.handleProgress}
      onLoadStart={engine.handleLoadStart}
      onLoad={engine.handleOpening}
      onBuffer={engine.handleBuffer}
      onPlaying={engine.handlePlaying}
      onPaused={engine.handlePaused}
      onStopped={engine.handleStopped}
      onEnd={engine.handleEnded}
      onError={engine.handleError}
      onTracks={engine.handleTracks}
    />
  );
}
