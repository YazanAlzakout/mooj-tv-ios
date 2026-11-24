import { useEventListener } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { brandLogoOnDark } from "@/components/BrandLogo";
import { toPlaybackError } from "@/core/errors/PlaybackError";
import { vodReasonKey } from "@/core/errors/playbackReason";
import { useI18n } from "@/core/i18n/I18nContext";
import { PROVIDER_REQUEST_HEADERS } from "@/core/network/providerHeaders";
import { useIsOffline } from "@/core/network/useIsOffline";
import { Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { getAppState } from "@/db/repositories/appStateRepository";
import { getWatchProgress } from "@/db/repositories/watchProgressRepository";
import { movieStreamUrl } from "@/providers/xtream/vodAdapter";
import { TrackSelectorModal } from "@/playback/TrackSelectorModal";
import { useBackgroundPlayback } from "@/playback/useBackgroundPlayback";
import { useFullscreenOrientation } from "@/playback/useFullscreenOrientation";
import { usePlaybackSpeed } from "@/playback/usePlaybackSpeed";
import { usePlaybackTracks } from "@/playback/usePlaybackTracks";
import { useWatchProgress } from "@/playback/useWatchProgress";
import { VodPlayerControls } from "@/playback/VodPlayerControls";
import { getActiveSession } from "@/state/activeSessionStore";
import { getVodMovies } from "@/state/vodStore";

/**
 * How close two failures must be, in seconds of playback position, to
 * count as the same failure repeating rather than a new one.
 */
const ERROR_LOOP_WINDOW_S = 5;

interface ResolvedMovie {
  name: string;
  posterUrl: string | null;
  containerExtension: string;
}

/**
 * One-shot VOD playback — unlike the live player, there is no channel
 * zapping here, so a single `useVideoPlayer(source, ...)` construction is
 * the correct, idiomatic use (it's memoized on the stringified source, so
 * it won't reconstruct across re-renders). Uses `VodPlayerControls` — a
 * custom YouTube-style overlay (play/pause, ±10s skip, draggable seek bar)
 * — rather than expo-video's native controls, per master prompt §24.2.
 *
 * Movie info is resolved from the in-memory catalog when available, else
 * falls back to the `watch_progress` row — Continue Watching (the common
 * path for a returning user) can resume a movie before Movies has ever
 * been opened this session, so the catalog cache can't be the only source.
 */
export default function MoviePlayerScreen() {
  const { t } = useI18n();
  useKeepAwake();
  useFullscreenOrientation();

  const { movieId, localUri } = useLocalSearchParams<{ movieId: string; localUri?: string }>();
  const session = getActiveSession();

  const [movie, setMovie] = useState<ResolvedMovie | null | undefined>(undefined);

  useEffect(() => {
    if (!movieId) return;
    let cancelled = false;
    (async () => {
      const cached = getVodMovies()?.find((m) => m.providerItemId === movieId);
      const resolved: ResolvedMovie | null = cached
        ? { name: cached.name, posterUrl: cached.posterUrl, containerExtension: cached.containerExtension }
        : await getWatchProgress("movie", movieId).then((existing) =>
            existing
              ? { name: existing.title, posterUrl: existing.imageUrl, containerExtension: existing.containerExtension }
              : null
          );
      if (!cancelled) setMovie(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [movieId]);

  const isOffline = useIsOffline();
  /**
   * A downloaded file plays straight off disk regardless of connectivity —
   * that is the entire point of downloading it. Only the *streamed* path
   * needs a network, so a source is never even constructed for it while
   * offline: no doomed connection attempt, no generic playback error a few
   * seconds later. A provider stream carries the same browser headers the
   * JSON calls use, since the panel sits behind a WAF that rejects the
   * default player user agent.
   */
  const source = localUri
    ? { uri: localUri }
    : session && movie
      ? {
          uri: movieStreamUrl(session.config, movieId, movie.containerExtension),
          headers: { ...PROVIDER_REQUEST_HEADERS },
        }
      : null;
  const noInternetMessage = !localUri && isOffline ? t("common", "noInternet") : null;

  const player = useVideoPlayer(source, (p) => {
    p.play();
  });

  const backgroundPlaybackEnabled = useBackgroundPlayback(player);

  /**
   * Frees the provider's single connection while the app is in the
   * background — the same thing the live player does, and for the reason
   * `useBackgroundPlayback` documents: `staysActiveInBackground: false`
   * only *pauses*, and a paused progressive stream keeps its socket, so
   * the account stayed locked for as long as the viewer was in another app.
   * This screen called the hook and threw away its answer, which meant the
   * preference was read and then ignored here.
   *
   * The position is not tracked by hand: `useWatchProgress` seeks a
   * freshly-sourced player back to where it was, which is the same path a
   * mid-playback reload already takes.
   */
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });

  useEffect(() => {
    if (backgroundPlaybackEnabled !== false) return;
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") {
        /*
          `useWatchProgress` registers its own `change` listener after this
          one, and listeners fire in registration order — so by the time it
          reads `player.currentTime` to save the position, this has already
          cleared the source and it reads 0. Below the resume threshold that
          means no write at all, and the last stretch of watching was lost
          if the process was killed while backgrounded.

          Dropping the source is deferred by one tick so the save runs
          against a player that still has one. The connection is released a
          few milliseconds later than before, which is not a cost anyone can
          observe.
        */
        setTimeout(() => {
          void player.replaceAsync(null);
        }, 0);
      } else if (next === "active" && sourceRef.current) {
        void player.replaceAsync(sourceRef.current).then(
          () => player.play(),
          () => {
            // A failure here surfaces through the player's own status
            // listener, the same as any other source that will not open.
          }
        );
      }
    });
    return () => subscription.remove();
  }, [backgroundPlaybackEnabled, player]);

  useWatchProgress(player, {
    contentType: "movie",
    providerItemId: movieId,
    title: movie?.name ?? "",
    subtitle: null,
    imageUrl: movie?.posterUrl ?? null,
    containerExtension: movie?.containerExtension ?? "",
  });

  const [status, setStatus] = useState<"idle" | "loading" | "readyToPlay" | "error">("idle");
  /** A reason key, not the provider's words — see core/errors/playbackReason.ts. */
  const [errorReasonKey, setErrorReasonKey] = useState<string | null>(null);
  /** VOD retry policy (master prompt §25): one quiet transient retry, then a real error card. */
  const hasRetriedRef = useRef(false);
  /** Where the last failure happened, so the same one is not retried for ever. */
  const lastErrorAtRef = useRef(Number.NEGATIVE_INFINITY);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEventListener(player, "statusChange", ({ status: newStatus, error }) => {
    setStatus(newStatus);
    if (newStatus === "error" && error) {
      /*
        One retry per *place* in the file, not one per playback.

        `hasRetriedRef` was cleared on every `readyToPlay`, and
        `useWatchProgress` seeks a reloaded source back to where it left
        off — so a stream that fails at a fixed point (a bad segment, a
        cut-off file) went error → reload → seek → same error, for ever.
        The viewer saw a picture that restarted itself every few seconds
        and never got the message telling them why, and each cycle opened
        the stream again.

        Remembering where the last error happened breaks the loop without
        giving up the retry: a failure somewhere else in the film still
        gets its one attempt.
      */
      const erroredAt = player.currentTime;
      const loopingAtSamePoint = Math.abs(erroredAt - lastErrorAtRef.current) < ERROR_LOOP_WINDOW_S;
      if (!hasRetriedRef.current && source && !loopingAtSamePoint) {
        lastErrorAtRef.current = erroredAt;
        hasRetriedRef.current = true;
        player.replaceAsync(source).then(
          () => {
            if (!unmountedRef.current) player.play();
          },
          (retryError) => {
            if (!unmountedRef.current) setErrorReasonKey(vodReasonKey(toPlaybackError(retryError).category));
          }
        );
        return;
      }
      setErrorReasonKey(vodReasonKey(toPlaybackError(error).category));
    }
    if (newStatus === "readyToPlay") {
      hasRetriedRef.current = false;
    }
  });

  const playbackSpeed = usePlaybackSpeed(player);
  const [preferredTracks, setPreferredTracks] = useState<{ audio: string | null; subtitle: string | null }>({
    audio: null,
    subtitle: null,
  });
  useEffect(() => {
    getAppState().then((s) => setPreferredTracks({ audio: s.preferredAudioLang, subtitle: s.preferredSubtitleLang }));
  }, []);
  const tracks = usePlaybackTracks(player, preferredTracks.audio, preferredTracks.subtitle);
  const [tracksModalVisible, setTracksModalVisible] = useState(false);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  if (movie === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("moviePlayer", "movieNotFound")}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("common", "back")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    /*
      No safe-area padding at all on this branch, deliberately.

      The picture must fill the screen and never move. Every edge here is
      applied to the control layers instead — see `layerPadding` below.

      Anything padded on this view pads the video with it, and since the
      system bars now appear and disappear with the controls, an inset
      that lives here changes size on every tap: measured on the test
      phone, landscape three-button navigation puts the bar down the
      *left* edge at 105px, so a left inset here shifted and narrowed the
      video each time the viewer touched the screen. The same was true
      vertically for the status bar. Video full-bleed, controls inset, is
      the only arrangement where neither problem exists.
    */
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.playerArea}>
        <VideoView style={styles.video} player={player} nativeControls={false}
          allowsPictureInPicture contentFit="contain" />

        <VodPlayerControls
          player={player}
          title={movie?.name ?? ""}
          isBuffering={status === "loading" || movie === undefined}
          onBack={() => router.back()}
          topRightExtras={
            <>
              <Pressable onPress={playbackSpeed.cycleSpeed} style={styles.pillButton} hitSlop={10}>
                <Text style={styles.pillButtonText}>{playbackSpeed.speed}x</Text>
              </Pressable>
              <Pressable onPress={() => setTracksModalVisible(true)} style={styles.pillButton} hitSlop={10}>
                <Text style={styles.pillButtonText}>{t("trackSelector", "tracksButton")}</Text>
              </Pressable>
            </>
          }
        />

        {/*
          The brand mark and one sentence, in place of the picture — the
          same treatment the live player got, so a stopped film and a
          stopped channel look alike.

          The no-internet case keeps its own wording rather than being
          folded into the other: telling someone whose Wi-Fi is off that
          the broadcast is paused sends them hunting the wrong problem,
          which is the exact mistake this replaced. Only the provider's own
          string is swapped out — it reads "HTTP 403 from http://…/movie/…"
          and is long, English, and carries a credentialed path.

          `pointerEvents="none"` and no button inside, so a tap goes
          straight through and raises the player's controls as usual.
        */}
        {(noInternetMessage || errorReasonKey) && (
          <View style={styles.overlayCenter} pointerEvents="none">
            <Image source={brandLogoOnDark()} style={styles.errorLogo} resizeMode="contain" />
            <Text style={styles.errorText}>
              {noInternetMessage ?? t("livePlayer", (errorReasonKey ?? "vodUnknown") as "streamPaused")}
            </Text>
          </View>
        )}
      </View>

      <TrackSelectorModal
        visible={tracksModalVisible}
        onClose={() => setTracksModalVisible(false)}
        tracks={tracks}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg, padding: Spacing.xl },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: "center" },
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
  },
  backButtonText: { color: Colors.text, fontFamily: FontFamily.bold },

  playerArea: { flex: 1, backgroundColor: "#000", position: "relative" },
  video: { width: "100%", height: "100%" },

  overlayCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  /*
    Twice the previous size, and no smaller in one orientation than the
    other: this screen is locked to landscape (`useFullscreenOrientation`),
    so it always has the full width of the phone to itself, and the overlay
    replaces the picture entirely rather than sitting in a corner of it. At
    220x124 the mark read as a small badge adrift in a lot of black
    (2026-09-17: "يجب تكبير اللوغو * 2").
  */
  errorLogo: { width: 440, height: 248, marginBottom: Spacing.lg },
  /*
    White and literal, not `Colors.error`.

    Red said "the app is broken" about a film the provider simply no longer
    carries, and it was theme-derived text on a surface that is always black
    — the same reason the mark above it uses `brandLogoOnDark`. Sized to be
    read across a room: 13pt was a caption under an icon, and this is the
    only thing on the screen. Matches the live player.
  */
  errorText: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 34,
    fontFamily: FontFamily.medium,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },

  pillButton: {
    paddingHorizontal: Spacing.md,
    height: 36,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillButtonText: { color: Colors.text, fontSize: 12, fontFamily: FontFamily.semiBold },
});
