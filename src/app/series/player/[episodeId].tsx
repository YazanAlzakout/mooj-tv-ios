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
import { Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { getAppState } from "@/db/repositories/appStateRepository";
import type { SeriesEpisode } from "@/domain/series/types";
import { episodeStreamUrl, getSeriesDetails } from "@/providers/xtream/seriesAdapter";
import { TrackSelectorModal } from "@/playback/TrackSelectorModal";
import { useBackgroundPlayback } from "@/playback/useBackgroundPlayback";
import { useFullscreenOrientation } from "@/playback/useFullscreenOrientation";
import { usePlaybackSpeed } from "@/playback/usePlaybackSpeed";
import { usePlaybackTracks } from "@/playback/usePlaybackTracks";
import { useWatchProgress } from "@/playback/useWatchProgress";
import { VodPlayerControls } from "@/playback/VodPlayerControls";
import { getActiveSession } from "@/state/activeSessionStore";

/**
 * How close two failures must be, in seconds of playback position, to
 * count as the same failure repeating rather than a new one.
 */
const ERROR_LOOP_WINDOW_S = 5;

/** Master prompt §24.7: start offering the next episode once this close to the end. */
const NEXT_EPISODE_TRIGGER_SECONDS = 20;
const NEXT_EPISODE_COUNTDOWN_SECONDS = 10;

/**
 * One-shot episode playback — same reasoning as the movie player
 * (src/app/movies/player/[movieId].tsx): a single `useVideoPlayer(source)`
 * construction, `VodPlayerControls` for a custom YouTube-style overlay
 * instead of expo-video's native controls. All metadata needed to
 * play AND to persist watch progress comes via route params rather than a
 * fetch — the caller (either the series details screen, which has the full
 * episode list in memory, or Home's Continue Watching, which has a
 * `watch_progress` row) already has everything for THIS episode. Finding
 * the *next* episode (§24.7) is the one case that still needs a fresh
 * `get_series_info` fetch — Xtream has no lighter endpoint for it, and
 * fetching it eagerly on every episode load just to have it ready for the
 * last 20 seconds would be wasted work most viewers never reach.
 */
/**
 * The episode before this one, walking back into the previous season when
 * this is the first of its own. Mirror of `findNextEpisode`.
 */
function findPreviousEpisode(
  seasons: { seasonNumber: number; episodes: SeriesEpisode[] }[],
  currentSeason: number,
  currentEpisode: number
): SeriesEpisode | null {
  const seasonIndex = seasons.findIndex((s) => s.seasonNumber === currentSeason);
  if (seasonIndex === -1) return null;

  const episodeIndex = seasons[seasonIndex].episodes.findIndex((e) => e.episodeNumber === currentEpisode);
  if (episodeIndex > 0) {
    return seasons[seasonIndex].episodes[episodeIndex - 1];
  }
  const previousSeason = seasons[seasonIndex - 1];
  if (!previousSeason || previousSeason.episodes.length === 0) return null;
  return previousSeason.episodes[previousSeason.episodes.length - 1];
}

function findNextEpisode(
  seasons: { seasonNumber: number; episodes: SeriesEpisode[] }[],
  currentSeason: number,
  currentEpisode: number
): SeriesEpisode | null {
  const seasonIndex = seasons.findIndex((s) => s.seasonNumber === currentSeason);
  if (seasonIndex === -1) return null;

  const episodeIndex = seasons[seasonIndex].episodes.findIndex((e) => e.episodeNumber === currentEpisode);
  if (episodeIndex !== -1 && episodeIndex + 1 < seasons[seasonIndex].episodes.length) {
    return seasons[seasonIndex].episodes[episodeIndex + 1];
  }
  const nextSeason = seasons[seasonIndex + 1];
  return nextSeason?.episodes[0] ?? null;
}

export default function EpisodePlayerScreen() {
  const { t } = useI18n();
  useKeepAwake();
  useFullscreenOrientation();

  const { episodeId, containerExtension, title, imageUrl, seriesId, seasonNumber, episodeNumber, localUri } =
    useLocalSearchParams<{
      episodeId: string;
      containerExtension: string;
      title?: string;
      imageUrl?: string;
      seriesId?: string;
      seasonNumber?: string;
      episodeNumber?: string;
      localUri?: string;
    }>();
  const session = getActiveSession();

  const isOffline = useIsOffline();
  // Same as the movie player: local files play regardless of connectivity,
  // so no source is even built for the streamed path while offline —
  // browser headers the panel's WAF expects, when there is a network.
  const source = localUri
    ? { uri: localUri }
    : session && episodeId && containerExtension
      ? {
          uri: episodeStreamUrl(session.config, episodeId, containerExtension),
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
    contentType: "episode",
    providerItemId: episodeId,
    title: title ?? "",
    subtitle: null,
    imageUrl: imageUrl ?? null,
    containerExtension: containerExtension ?? "",
    seriesId: seriesId ?? null,
    seasonNumber: seasonNumber ? Number(seasonNumber) : null,
    episodeNumber: episodeNumber ? Number(episodeNumber) : null,
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
  const tracks = usePlaybackTracks(player, preferredTracks.audio, preferredTracks.subtitle);
  const [tracksModalVisible, setTracksModalVisible] = useState(false);

  const [nextEpisode, setNextEpisode] = useState<SeriesEpisode | null>(null);
  const [previousEpisode, setPreviousEpisode] = useState<SeriesEpisode | null>(null);
  /**
   * Whether this episode is close enough to its end for the autoplay card.
   *
   * Separate from *knowing* what the next episode is, and that separation is
   * the whole point. The two used to be the same fact: the neighbour lookup
   * only ran in the last twenty seconds, so `nextEpisode` being non-null
   * implied the episode was ending, and the countdown effect relied on that
   * implication without stating it.
   *
   * Making the lookup eager — needed so the previous/next buttons exist from
   * the first frame — broke the implication and nothing was left to hold the
   * countdown back: the card appeared about a second after the episode
   * opened and autoplay moved on ten seconds later, which chained through
   * the whole season at roughly one episode every eleven seconds, opening a
   * stream and a metadata request each time on a one-connection line. Found
   * 2026-09-16, hours after the eager lookup was added.
   */
  const [nearEnd, setNearEnd] = useState(false);
  const [nextPromptDismissed, setNextPromptDismissed] = useState(false);
  const [countdown, setCountdown] = useState(NEXT_EPISODE_COUNTDOWN_SECONDS);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const nextLookupStartedRef = useRef(false);

  useEffect(() => {
    getAppState().then((state) => {
      setAutoplayEnabled(state.autoplayNextEpisode);
      setPreferredTracks({ audio: state.preferredAudioLang, subtitle: state.preferredSubtitleLang });
    });
  }, []);

  /**
   * Both neighbours, fetched once when the episode opens.
   *
   * This lookup used to wait until the last twenty seconds, on the
   * reasoning — written in this file's own header — that fetching it
   * eagerly was wasted work for viewers who never reach the end. That was
   * right while the only consumer was the autoplay card. It stops being
   * right once there are previous/next buttons, which have to be there
   * from the first frame or they are not buttons.
   *
   * The cost is one `get_series_info` per episode *opened* rather than per
   * episode *finished* — a metadata call, not a stream, so it does not
   * touch the account's single connection. The `timeUpdate` handler below
   * keeps its own guard and simply finds the work already done.
   *
   * Knowing the neighbours is deliberately **not** the same thing as the
   * episode ending — see `nearEnd`. Conflating the two is what made every
   * episode auto-advance eleven seconds after it opened.
   */
  useEffect(() => {
    if (!session || !seriesId || !seasonNumber || !episodeNumber) return;
    let cancelled = false;
    nextLookupStartedRef.current = true;
    getSeriesDetails(session.config, seriesId).then(
      (details) => {
        if (cancelled) return;
        const season = Number(seasonNumber);
        const episode = Number(episodeNumber);
        setNextEpisode(findNextEpisode(details.seasons, season, episode));
        setPreviousEpisode(findPreviousEpisode(details.seasons, season, episode));
      },
      () => {
        // No neighbours shown. The buttons render disabled, which is the
        // same thing the first and last episode of a series get.
        if (!cancelled) nextLookupStartedRef.current = false;
      }
    );
    return () => {
      cancelled = true;
    };
    // Route params for one episode; the screen is replaced, not updated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playEpisode(episode: SeriesEpisode) {
    /*
     * Free the connection before navigating, not after.
     *
     * `router.replace` mounts the next screen, and `useVideoPlayer`
     * constructs its native player during render — Android schedules
     * `prepare()` immediately, so the request for episode N+1 goes out
     * while this screen is still unmounting and its own player has not
     * been released yet. On a line that allows one connection, the new
     * request can simply be refused. Dropping the source here closes the
     * socket first, so the hand-off uses one connection instead of two.
     */
    player.pause();
    void player.replaceAsync(null);

    router.replace({
      pathname: "/series/player/[episodeId]",
      params: {
        episodeId: episode.providerItemId,
        containerExtension: episode.containerExtension,
        title: episode.title,
        imageUrl: episode.thumbnailUrl ?? imageUrl ?? "",
        seriesId: seriesId ?? "",
        seasonNumber: String(episode.seasonNumber),
        episodeNumber: String(episode.episodeNumber),
      },
    });
  }

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    /*
      The one thing that turns the autoplay card on. Set, never cleared:
      scrubbing backwards out of the last twenty seconds should not take a
      card away that the viewer may already be reading, and the screen is
      replaced rather than reused when the episode changes.
    */
    /*
      Tracks the position both ways.

      Latching it looked right — a card the viewer may be reading should not
      vanish — but the card is not the only thing this gates: the autoplay
      countdown runs off it too. Scrubbing into the last twenty seconds to
      look at the ending and then going back to the middle left the
      countdown ticking, and ten seconds later the next episode opened over
      an episode still being watched. Whatever the card costs in flicker, it
      costs less than that.
    */
    setNearEnd(duration - currentTime <= NEXT_EPISODE_TRIGGER_SECONDS);

    /*
      The lookup normally already ran on mount. This is the fallback for the
      case where that one failed — it clears `nextLookupStartedRef` so this
      can try again, which is worth doing only once the episode is actually
      ending.
    */
    if (nextLookupStartedRef.current) return;
    if (!session || !seriesId || !seasonNumber || !episodeNumber) return;
    if (duration - currentTime > NEXT_EPISODE_TRIGGER_SECONDS) return;

    nextLookupStartedRef.current = true;
    getSeriesDetails(session.config, seriesId).then(
      (details) => {
        const next = findNextEpisode(details.seasons, Number(seasonNumber), Number(episodeNumber));
        setNextEpisode(next);
      },
      () => {
        // Transient network/provider failure — allow the next timeUpdate tick to retry
        // rather than silently giving up on autoplay for the rest of this episode.
        nextLookupStartedRef.current = false;
      }
    );
  });

  useEffect(() => {
    if (!nearEnd || !nextEpisode || nextPromptDismissed || !autoplayEnabled) return;
    if (countdown <= 0) {
      playEpisode(nextEpisode);
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearEnd, nextEpisode, nextPromptDismissed, countdown, autoplayEnabled]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  if (!episodeId || !containerExtension) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("episodePlayer", "episodeNotFound")}</Text>
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
          title={title ?? ""}
          isBuffering={status === "loading"}
          onBack={() => router.back()}
          hasEpisodeTransport
          onPreviousEpisode={previousEpisode ? () => playEpisode(previousEpisode) : null}
          onNextEpisode={nextEpisode ? () => playEpisode(nextEpisode) : null}
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

        {nearEnd && nextEpisode && !nextPromptDismissed && (
          <View style={styles.nextEpisodeCard}>
            <Text style={styles.nextEpisodeLabel}>{t("episodePlayer", "nextEpisodeIn", { n: countdown })}</Text>
            <Text style={styles.nextEpisodeTitle} numberOfLines={1}>
              {nextEpisode.title}
            </Text>
            <View style={styles.nextEpisodeActions}>
              <Pressable
                style={styles.nextEpisodeDismiss}
                onPress={() => setNextPromptDismissed(true)}
                hitSlop={8}
              >
                <Text style={styles.nextEpisodeDismissText}>{t("episodePlayer", "dismiss")}</Text>
              </Pressable>
              <Pressable style={styles.nextEpisodePlay} onPress={() => playEpisode(nextEpisode)}>
                <Text style={styles.nextEpisodePlayText}>▶ {t("episodePlayer", "playNow")}</Text>
              </Pressable>
            </View>
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

  nextEpisodeCard: {
    position: "absolute",
    bottom: 72,
    end: Spacing.lg,
    start: Spacing.xxl * 3,
    backgroundColor: "rgba(18,18,26,0.95)",
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  nextEpisodeLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: FontFamily.regular },
  nextEpisodeTitle: { color: Colors.text, fontSize: 13, fontFamily: FontFamily.bold },
  nextEpisodeActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  nextEpisodeDismiss: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: "center",
  },
  nextEpisodeDismissText: { color: Colors.textSecondary, fontSize: 12, fontFamily: FontFamily.semiBold },
  nextEpisodePlay: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
    alignItems: "center",
  },
  nextEpisodePlayText: { color: Colors.text, fontSize: 12, fontFamily: FontFamily.bold },

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
