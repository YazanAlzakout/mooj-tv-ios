import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";
import { Focusable } from "@/components/Focusable";
import { ArcHero } from "@/components/ArcHero";
import { demoDetail } from "@/core/demo/demoMode";
import { BackButton } from "@/components/BackButton";
import { CachedImage } from "@/components/CachedImage";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MetaChip } from "@/components/MetaChip";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/Skeleton";
import { StarRating } from "@/components/StarRating";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useIsOffline } from "@/core/network/useIsOffline";
import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import type { SeriesDetails, SeriesEpisode } from "@/domain/series/types";
import { useDownloadState } from "@/domain/downloads/useDownloadState";
import type { DownloadStatus } from "@/db/repositories/downloadRepository";
import { getMostRecentIncompleteEpisodeForSeries } from "@/db/repositories/watchProgressRepository";
import { getSeriesDetails } from "@/providers/xtream/seriesAdapter";
import { getActiveSession } from "@/state/activeSessionStore";
import { useLibraryToggle, type UseLibraryToggleResult } from "@/state/useLibraryToggle";
import type { XtreamProviderConfig } from "@/domain/provider/types";

function firstPlayableEpisode(details: SeriesDetails): SeriesEpisode | null {
  return details.seasons[0]?.episodes[0] ?? null;
}

/**
 * "Series Play" (master prompt §22) predictable rule: resume the most
 * recently-watched unfinished episode (tracked in `watch_progress` —
 * master prompt §24.6) when one exists for this series; otherwise the
 * first episode of the first season.
 */
async function resolveSeriesPlayEpisode(details: SeriesDetails): Promise<SeriesEpisode | null> {
  const inProgress = await getMostRecentIncompleteEpisodeForSeries(details.providerItemId);
  if (inProgress) {
    for (const season of details.seasons) {
      const match = season.episodes.find((e) => e.providerItemId === inProgress.providerItemId);
      if (match) return match;
    }
  }
  return firstPlayableEpisode(details);
}

export default function SeriesDetailsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  /* Navigation-bar clearance — see live/player/[channelId].tsx. */
  const insets = useSafeAreaInsets();
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();
  const session = getActiveSession();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(height * 0.42);

  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  /*
   * ✕ on a finished episode deletes the file off the device, and it sits
   * 8dp from the 48dp button the thumb was aiming at. It asks first now,
   * exactly like the same action on the movie screen and the Delete row on
   * the downloads screen — this was the one of the three that took a 1.5 GB
   * episode away on a single tap, with nothing to undo it and no way back
   * except re-downloading over the metered line the download existed to
   * avoid. Found in the 2026-11-17 screen audit.
   *
   * The dialog lives up here and not inside EpisodeRow, for the reason the
   * row's own header gives: some series on this provider run to 200+
   * episodes and FlatList keeps a whole windowSize of rows alive at once,
   * while ConfirmDialog carries a shared value and two animated styles. One
   * dialog per screen holding the row that asked for it is what
   * downloads.tsx already does with the identical action; the row hands up
   * the title to name and the `remove` that owns its record.
   */
  const [pendingRemoval, setPendingRemoval] = useState<{ title: string; remove: () => void } | null>(null);

  const isOffline = useIsOffline();
  const noInternetMessage = isOffline && !details ? t("common", "noInternet") : null;

  useEffect(() => {
    if (!session || !seriesId || isOffline) return;
    let cancelled = false;
    getSeriesDetails(session.config, seriesId).then(
      (result) => {
        if (cancelled) return;
        setDetails(demoDetail(result));
        setSelectedSeason(result.seasons[0]?.seasonNumber ?? null);
        setErrorMessage(null);
      },
      (error) => {
        if (!cancelled) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    );
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per seriesId (plus an explicit retry), and again if connectivity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, reloadToken, isOffline]);

  const currentSeason = useMemo(
    () => details?.seasons.find((s) => s.seasonNumber === selectedSeason) ?? null,
    [details, selectedSeason]
  );

  const libraryItem = details
    ? {
        contentType: "series" as const,
        providerItemId: details.providerItemId,
        title: details.name,
        imageUrl: details.posterUrl,
        categoryId: details.categoryId,
        containerExtension: null,
      }
    : null;
  const favorite = useLibraryToggle("favorite", libraryItem);
  const watchLater = useLibraryToggle("watch_later", libraryItem);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  /* One handler, two call sites — the full-screen failure and the banner
     over a series that is already drawn both mean "ask the provider again". */
  function retry() {
    setReloadToken((n) => n + 1);
  }

  function playEpisode(episode: SeriesEpisode) {
    router.push({
      pathname: "/series/player/[episodeId]",
      params: {
        episodeId: episode.providerItemId,
        containerExtension: episode.containerExtension,
        title: episode.title,
        imageUrl: episode.thumbnailUrl ?? details?.posterUrl ?? "",
        seriesId: details?.providerItemId ?? "",
        seasonNumber: String(episode.seasonNumber),
        episodeNumber: String(episode.episodeNumber),
      },
    });
  }

  async function playSeries() {
    if (!details) return;
    const episode = await resolveSeriesPlayEpisode(details);
    if (episode) playEpisode(episode);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
        {/*
          `floating`: this one sits on the artwork rather than on the page,
          so it keeps a dark ground and a white mark. A hairline ring on an
          unknown photograph is not legible.
        */}
        <View style={styles.backButton}>
          <BackButton floating />
        </View>

        {/*
          `!details`: this is the state for a screen with nothing else on
          it, and only that. `errorState` is `flex: 1`, and it was being
          rendered as a sibling of the FlatList — so a refresh refused over
          a series that had already loaded put a flex-basis-0 box beside a
          list that grows and shrinks on exactly the same terms. The list
          kept the whole height, the message was laid out 0dp tall, and the
          failure was therefore silent: the viewer pressed nothing, saw
          nothing, and went on reading a page that was no longer being
          refreshed. A loaded series says so in its body instead — see
          `refreshErrorBanner` in SeriesHeader. Found in the 2026-11-18
          verification pass over the day before's fixes.
        */}
        {!details && (noInternetMessage || errorMessage) && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{noInternetMessage ?? errorMessage}</Text>
            <BouncePressable style={styles.retryButton} onPress={retry}>
              <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
            </BouncePressable>
          </View>
        )}

        {!details && !errorMessage && !noInternetMessage && (
          <ScrollView contentContainerStyle={styles.skeletonWrap} showsVerticalScrollIndicator={false}>
            <Skeleton width="100%" height={heroHeight} borderRadius={0} />
            <View style={styles.skeletonBody}>
              <Skeleton width="65%" height={26} borderRadius={7} />
              <Skeleton width="45%" height={14} borderRadius={5} />
              <Skeleton width="100%" height={48} borderRadius={Radii.md} />
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} width="100%" height={78} borderRadius={Radii.md} />
              ))}
            </View>
          </ScrollView>
        )}

        {details && (
          <FlatList
            data={currentSeason?.episodes ?? []}
            keyExtractor={(item) => item.providerItemId}
            ListHeaderComponent={
              <SeriesHeader
                details={details}
                heroHeight={heroHeight}
                selectedSeason={selectedSeason}
                onSelectSeason={setSelectedSeason}
                onPlay={playSeries}
                favorite={favorite}
                watchLater={watchLater}
                /*
                  `errorMessage` and not `noInternetMessage ?? errorMessage`:
                  the offline line is `isOffline && !details`, so by
                  definition it is null everywhere inside this branch. A
                  provider that refused the refresh is the only thing that
                  can speak here.
                */
                refreshError={errorMessage}
                onRetry={retry}
              />
            }
            renderItem={({ item }) => (
              <EpisodeRow
                episode={item}
                seriesDetails={details}
                config={session.config}
                providerId={session.provider.id}
                onPress={() => playEpisode(item)}
                onRequestRemove={(title, remove) => setPendingRemoval({ title, remove })}
              />
            )}
            contentContainerStyle={[styles.episodeList, { paddingBottom: Spacing.xxl + insets.bottom }]}
            initialNumToRender={8}
            windowSize={7}
            /*
              Off on the TV build. Android reassigns focus when the view
              holding it is detached, and clipping detaches exactly the
              rows a D-pad is stepping through — so the highlight jumps on
              its own mid-navigation (reported 2026-09-10 as "التنقل يقفز
              قفزات"). A phone scrolls this with a finger and never has
              focus to lose, and it still wants the clipping. See
              core/layout/listWindow.ts.
            */
            removeClippedSubviews={!isTvBuild}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/*
        Outside the SafeAreaView, exactly where the movie screen keeps its
        own copy of this dialog: a Modal is portalled to the root window, so
        the FlatList that asked for it never gets a chance to clip it.
        The title named is the episode's own — the download record's title is
        "<series> — <episode>", but what the viewer just pressed ✕ on is a
        row showing the episode alone, and the sentence should name what they
        are looking at.
      */}
      <ConfirmDialog
        visible={pendingRemoval !== null}
        title={t("downloads", "deleteConfirmTitle")}
        message={t("downloads", "deleteConfirmBody", { title: pendingRemoval?.title ?? "" })}
        confirmLabel={t("downloads", "delete")}
        danger
        onConfirm={() => {
          pendingRemoval?.remove();
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </ScreenBackground>
  );
}

function SeriesHeader({
  details,
  heroHeight,
  selectedSeason,
  onSelectSeason,
  onPlay,
  favorite,
  watchLater,
  refreshError,
  onRetry,
}: {
  details: SeriesDetails;
  heroHeight: number;
  selectedSeason: number | null;
  onSelectSeason: (n: number) => void;
  onPlay: () => void;
  favorite: UseLibraryToggleResult;
  watchLater: UseLibraryToggleResult;
  /**
   * A refresh the provider refused, while this series was already on
   * screen. Null in the ordinary case; the screen's own full-screen
   * `errorState` answers for a series that never arrived at all.
   */
  refreshError: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [heroFailed, setHeroFailed] = useState(false);
  const heroUri = details.backdropUrl ?? details.posterUrl;

  return (
    <View>
      <ArcHero height={heroHeight}>
        {heroUri && !heroFailed ? (
          <CachedImage
            uri={heroUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setHeroFailed(true)}
          />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroFallbackText}>{details.name}</Text>
          </View>
        )}
        {/*
            No scrim over the artwork, and no straight edge under it
            either.

            Three flat rectangles used to sit here, stacked at bottom:
            120 / 60 / 0, standing in for a gradient the app has no
            dependency for. Flat layers have hard edges, so what they
            actually drew over the poster was two black horizontal lines
            across the picture — visible in a framebuffer scan on
            2026-09-16 as luminance steps at the exact rows where the
            rectangles met, and reported as "الخطوط موجودة على صورة
            البوستر".

            The instruction is that there are to be no black gradients
            anywhere (see the note in the live player), and that stands.
            What the picture ends in instead is a shape rather than a
            cut — see ArcHero.
        */}
      </ArcHero>

      <View style={styles.body}>
        {/*
          In the body, under the arc, and not at the top of the screen where
          the full-screen error sits: the back button floats over the
          artwork at top: Spacing.xl and is 38dp tall, so a strip at y=0
          would land in its band — the very collision `errorState` was
          given `flex: 1` to escape on 2026-11-17. Here it is the first line
          of the page the viewer is already reading, it scrolls away once
          read, and the artwork keeps the top of the screen.

          No `entering` on it either. The animations below are an entrance,
          played once when the series arrives; this appears later, on a
          failure, and a thing that fades in 420ms after the fact reads as
          decoration rather than as news.
        */}
        {refreshError && (
          <View style={styles.refreshErrorBanner}>
            <Text style={styles.errorText}>{refreshError}</Text>
            <BouncePressable style={styles.retryButton} onPress={onRetry}>
              <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
            </BouncePressable>
          </View>
        )}

        <Animated.Text entering={FadeInDown.duration(420).delay(60)} style={styles.title}>
          {details.name}
        </Animated.Text>

        {details.rating !== null && (
          <Animated.View entering={FadeInDown.duration(420).delay(110)} style={styles.ratingRow}>
            <StarRating rating={details.rating} />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(420).delay(160)} style={styles.chipRow}>
          {details.year && <MetaChip glyph="▤" label={details.year} />}
          {details.genre && <MetaChip label={details.genre} />}
          {details.seasons.length > 0 && (
            <MetaChip
              glyph="❏"
              tint="#EC4899"
              label={`${details.seasons.length} ${t("seriesDetails", "seasonsSuffix")}`}
            />
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(220)} style={styles.primaryActionRow}>
          <BouncePressable style={styles.playButton} onPress={onPlay}>
            <Text style={styles.playButtonText}>▶  {t("seriesDetails", "play")}</Text>
          </BouncePressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(280)} style={styles.secondaryActionsRow}>
          <BouncePressable style={styles.secondaryButton} onPress={favorite.toggle}>
            <Text style={[styles.secondaryButtonText, favorite.isSaved && styles.secondaryButtonTextActive]}>
              {favorite.isSaved ? `★ ${t("seriesDetails", "favorited")}` : `☆ ${t("seriesDetails", "favorite")}`}
            </Text>
          </BouncePressable>
          <BouncePressable style={styles.secondaryButton} onPress={watchLater.toggle}>
            <Text style={[styles.secondaryButtonText, watchLater.isSaved && styles.secondaryButtonTextActive]}>
              {watchLater.isSaved
                ? `✓ ${t("seriesDetails", "inWatchLater")}`
                : `+ ${t("seriesDetails", "addWatchLater")}`}
            </Text>
          </BouncePressable>
        </Animated.View>

        {details.plot && (
          <Animated.View entering={FadeIn.duration(400).delay(340)} style={styles.section}>
            <SectionHeader title={t("seriesDetails", "plot")} />
            <Text style={styles.sectionText}>{details.plot}</Text>
          </Animated.View>
        )}

        {(details.cast || details.director) && (
          <Animated.View entering={FadeIn.duration(400).delay(380)} style={styles.section}>
            <SectionHeader title={t("seriesDetails", "cast")} />
            <View style={styles.infoCard}>
              {details.director && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("seriesDetails", "director")}</Text>
                  <Text style={styles.infoValue}>{details.director}</Text>
                </View>
              )}
              {details.cast && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("seriesDetails", "cast")}</Text>
                  <Text style={styles.infoValue}>{details.cast}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {details.seasons.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={t("seriesDetails", "episodesTitle")}
              action={{
                label: `${
                  details.seasons.find((s) => s.seasonNumber === selectedSeason)?.episodes.length ?? 0
                } ${t("seriesDetails", "episodesSuffix")}`,
                onPress: () => {},
              }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seasonPillRow}
            >
              {details.seasons.map((season) => {
                const active = selectedSeason === season.seasonNumber;
                return (
                  <BouncePressable
                    key={season.seasonNumber}
                    onPress={() => onSelectSeason(season.seasonNumber)}
                    style={[styles.seasonPill, active && styles.seasonPillActive]}
                  >
                    <Text style={[styles.seasonPillText, active && styles.seasonPillTextActive]}>{season.name}</Text>
                    <View style={[styles.seasonCountBadge, active && styles.seasonCountBadgeActive]}>
                      <Text style={[styles.seasonCountText, active && styles.seasonCountTextActive]}>
                        {season.episodes.length}
                      </Text>
                    </View>
                  </BouncePressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {details.seasons.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t("seriesDetails", "noEpisodesAvailable")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * One glyph per download status, as a map rather than a ternary chain.
 *
 * `DownloadStatus` carries six values and this row branched on three, so
 * "failed" and "queued" both fell through to the idle "⬇" — a lit,
 * focusable button whose only handler (`trigger`) refuses to act while a
 * record exists, so it bounced on press and did nothing, forever. Keying the
 * map by the union makes the compiler ask for all six, so the next status
 * added cannot fall through in silence. Found in the 2026-11-17 screen
 * audit.
 *
 * "canceled" is unreachable in practice — `cancelDownload` deletes the row
 * rather than marking it — but the type carries it, so it carries the idle
 * glyph and the inert treatment below.
 */
const EPISODE_DOWNLOAD_GLYPH: Record<DownloadStatus, string> = {
  queued: "⋯",
  downloading: "❙❙",
  paused: "▶",
  completed: "✓",
  failed: "↻",
  canceled: "⬇",
};

/**
 * No per-row `entering` animation and a plain `Pressable`: some series on
 * this provider run to 200+ episodes, and FlatList recycles rows during
 * scroll, so a per-row entrance would re-fire constantly. The header above
 * animates instead, which is a fixed, one-off cost.
 */
function EpisodeRow({
  episode,
  seriesDetails,
  config,
  providerId,
  onPress,
  onRequestRemove,
}: {
  episode: SeriesEpisode;
  seriesDetails: SeriesDetails;
  config: XtreamProviderConfig;
  providerId: string;
  onPress: () => void;
  /**
   * Hands a finished download up to the screen, which owns the one
   * ConfirmDialog for all of these rows — see the note on `pendingRemoval`
   * in SeriesDetailsScreen.
   */
  onRequestRemove: (title: string, remove: () => void) => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const download = useDownloadState({
    contentType: "episode",
    providerItemId: episode.providerItemId,
    providerId,
    title: `${seriesDetails.name} — ${episode.title}`,
    subtitle: `S${episode.seasonNumber} E${episode.episodeNumber}`,
    imageUrl: episode.thumbnailUrl ?? seriesDetails.posterUrl,
    containerExtension: episode.containerExtension,
    seriesId: seriesDetails.providerItemId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  });

  /* Everything below this point keys off the record's status — read it once. */
  const status = download.record?.status ?? null;
  /*
   * Nothing a tap can do with either of these. `trigger` refuses outright
   * whenever a record already exists (useDownloadState: `if (!item ||
   * !eligible || record) return`), and neither pause nor resume applies: a
   * queued episode is waiting for the single download slot
   * (MAX_ACTIVE_DOWNLOADS is 1, so starting a second episode queues it), and
   * a canceled row only exists in the type. Until the 2026-11-17 audit a
   * queued episode's button was lit, focusable and inert.
   */
  const downloadInert = status === "queued" || status === "canceled";

  const bytesDownloaded = download.progress?.bytesDownloaded ?? download.record?.bytesDownloaded ?? 0;
  const bytesTotal = download.progress?.bytesTotal ?? download.record?.bytesTotal ?? null;
  const fraction = bytesTotal && bytesTotal > 0 ? Math.min(1, bytesDownloaded / bytesTotal) : 0;

  return (
    <View style={styles.episodeWrap}>
      <View style={styles.episodeShell}>
        <Focusable style={styles.episodeRow} onPress={onPress}>
          <View style={styles.episodeNumberBadge}>
            <Text style={styles.episodeNumberText}>{episode.episodeNumber}</Text>
          </View>

          <View style={styles.episodeThumbWrap}>
            {episode.thumbnailUrl && !thumbFailed ? (
              <CachedImage
                uri={episode.thumbnailUrl}
                style={styles.episodeThumb}
                resizeMode="cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <View style={styles.episodeThumbFallback} />
            )}
            <View style={styles.episodePlayOverlay}>
              <Text style={styles.episodePlayGlyph}>▶</Text>
            </View>
          </View>

          <View style={styles.episodeInfo}>
            <Text style={styles.episodeTitle} numberOfLines={1}>
              {episode.title}
            </Text>
            {episode.plot && (
              <Text style={styles.episodePlot} numberOfLines={2}>
                {episode.plot}
              </Text>
            )}
            {episode.durationLabel && <Text style={styles.episodeDuration}>◷ {episode.durationLabel}</Text>}
          </View>
        </Focusable>

        {download.eligible && (
          <Focusable
            onPress={
              status === "downloading"
                ? download.pause
                : status === "paused" || status === "failed"
                  ? download.resume
                  : download.trigger
            }
            style={styles.episodeDownloadButton}
            /*
             * "failed" resumes rather than falling through to `trigger`:
             * `resumeDownload` restarts a row that has no resume data to
             * work from, which is exactly what a failed row is, and it is
             * what the downloads screen's Retry has always done.
             * "completed" was already disabled; `downloadInert` covers the
             * two left over, so every status either acts or says it cannot.
             */
            disabled={status === "completed" || downloadInert}
          >
            <Text
              style={[
                styles.episodeDownloadText,
                status === "completed" && styles.episodeDownloadTextDone,
                downloadInert && styles.episodeDownloadTextWaiting,
              ]}
            >
              {status ? EPISODE_DOWNLOAD_GLYPH[status] : "⬇"}
            </Text>
          </Focusable>
        )}

        {/*
          A finished download asks first — see `pendingRemoval` on the
          screen. An in-flight, queued or failed transfer still goes
          straight through to `cancel`: what that throws away is a partial
          file, not a watchable one, and a dialog over it would be noise.
        */}
        {download.record && (
          <Focusable
            onPress={status === "completed" ? () => onRequestRemove(episode.title, download.remove) : download.cancel}
            style={styles.episodeDownloadButton}
            hitSlop={4}
          >
            <Text style={styles.episodeDownloadTextDanger}>✕</Text>
          </Focusable>
        )}
      </View>

      {(status === "downloading" || status === "paused") && (
        <View style={styles.episodeProgressTrack}>
          <View style={[styles.episodeProgressFill, { width: `${fraction * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  /*
   * Three jobs, so three styles. One `centered` did all of it until the
   * 2026-11-17 audit, two until the 2026-11-18 pass — and the reason it
   * keeps splitting is that `flex: 1` is wrong, then right, then wrong
   * again in the opposite direction, in the three boxes they sit in, in
   * the order below.
   *
   * `centered` — "no episodes available", inside the auto-height list
   * header, where `flex: 1` would collapse it to nothing.
   *
   * `errorState` — the whole screen, when nothing has arrived to put on it.
   * Without `flex: 1` it shrank to its own content at y=0, and because this
   * screen deliberately takes no top safe-area inset
   * (edges=["left","right"], so the artwork can reach the status bar) the
   * message landed at y≈24 and Retry at y≈56 — the same band as the
   * floating back button, which is 38dp tall at top: Spacing.xl, so the two
   * overlapped. Offline on a series read as broken; the same markup on the
   * movie screen, which had `flex: 1` here all along, read as finished.
   *
   * `refreshErrorBanner` — a refresh the provider refused over a series
   * already drawn. `flex: 1` is wrong here the other way round: as a
   * sibling of the FlatList its flex basis is 0 while the list grows and
   * shrinks on the same terms, so the list took the full height and this
   * was laid out 0dp tall. No flex at all, and inside the body rather than
   * beside the list — it is a line of content, not a screen. `errorBlock`
   * on the Movies tab answers the same two failures and this borrows its
   * shape, plus a bottom margin: the body sets no row gap and the title
   * carries no `marginTop`, so without one the series name would sit flush
   * against the Retry button.
   */
  centered: { alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  refreshErrorBanner: {
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: C.error, fontSize: 14, fontFamily: FontFamily.medium, textAlign: "center" },
  emptyText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: C.surface,
    borderRadius: Radii.md,
  },
  retryButtonText: { color: C.text, fontFamily: FontFamily.bold },

  /*
   * Placement only. The disc, its border and the mark inside it all live
   * in BackButton now, which is also where the note about needing a dark
   * ground over unknown artwork went.
   */
  backButton: {
    position: "absolute",
    top: Spacing.xl,
    start: Spacing.lg,
    zIndex: 10,
  },

  skeletonWrap: { paddingBottom: Spacing.xxl },
  skeletonBody: { padding: Spacing.lg, gap: Spacing.md },

  heroFallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  heroFallbackText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.bold, textAlign: "center" },

  body: { paddingHorizontal: Spacing.lg, marginTop: -Spacing.sm },
  title: { color: C.text, fontSize: 24, fontFamily: FontFamily.extraBold, lineHeight: 31 },
  ratingRow: { marginTop: Spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.md },

  primaryActionRow: { marginTop: Spacing.lg },
  playButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  playButtonText: { color: "#fff", fontSize: 15, fontFamily: FontFamily.bold },

  secondaryActionsRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryButton: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  secondaryButtonText: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.semiBold },
  secondaryButtonTextActive: { color: Brand.primaryLight },

  section: { marginTop: Spacing.lg },
  sectionText: { color: C.textSecondary, fontSize: 13, fontFamily: FontFamily.regular, lineHeight: 20 },

  infoCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  infoRow: { gap: 2 },
  infoLabel: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },
  infoValue: { color: C.text, fontSize: 13, fontFamily: FontFamily.medium, lineHeight: 19 },

  seasonPillRow: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingEnd: Spacing.lg },
  seasonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  seasonPillActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  seasonPillText: { color: C.textSecondary, fontSize: 13, fontFamily: FontFamily.semiBold },
  seasonPillTextActive: { color: "#fff", fontFamily: FontFamily.bold },
  seasonCountBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: C.fillMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  seasonCountBadgeActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  seasonCountText: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.bold },
  seasonCountTextActive: { color: "#fff" },

  episodeList: { paddingBottom: Spacing.xxl },
  episodeWrap: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  episodeShell: { flexDirection: "row", alignItems: "stretch", gap: Spacing.sm },
  episodeProgressTrack: {
    height: 3,
    marginTop: Spacing.xs,
    borderRadius: 2,
    backgroundColor: C.fillMedium,
    overflow: "hidden",
  },
  episodeProgressFill: { height: "100%", backgroundColor: Brand.primary },
  episodeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  episodeNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeNumberText: { color: Brand.primaryLight, fontSize: 13, fontFamily: FontFamily.extraBold },
  episodeThumbWrap: {
    width: 88,
    height: 56,
    borderRadius: Radii.sm,
    overflow: "hidden",
    backgroundColor: C.surfaceElevated,
  },
  episodeThumb: { width: "100%", height: "100%" },
  episodeThumbFallback: { ...StyleSheet.absoluteFill, backgroundColor: C.surfaceElevated },
  episodePlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  episodePlayGlyph: { color: "#fff", fontSize: 13 },
  episodeInfo: { flex: 1, gap: 2, justifyContent: "center" },
  episodeTitle: { color: C.text, fontSize: 13, fontFamily: FontFamily.semiBold },
  episodePlot: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular, lineHeight: 15 },
  episodeDuration: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },

  episodeDownloadButton: {
    width: 48,
    borderRadius: Radii.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeDownloadText: { color: Brand.primaryLight, fontSize: 16 },
  episodeDownloadTextDone: { color: C.success },
  /* A queued row is waiting for the single download slot and its button is
     disabled, so its glyph is muted rather than action-coloured — a lit
     control that does nothing is the thing being fixed here, and colour is
     half of how a control says it is live. */
  episodeDownloadTextWaiting: { color: C.textMuted },
  /*
   * C.error, not Brand.primaryLight. ✕ removes the file and ⬇/✓ brings it
   * down, and until the 2026-11-17 audit both were drawn in the same blue,
   * 8dp apart, on 48dp targets. The downloads screen already paints its
   * destructive label with C.error (actionButtonTextDestructive); this is
   * that colour on that action.
   */
  episodeDownloadTextDanger: { color: C.error, fontSize: 14 },
  })
);
