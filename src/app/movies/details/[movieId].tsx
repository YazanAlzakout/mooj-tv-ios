import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

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
import { formatBytes } from "@/core/utils/formatBytes";
import type { MovieDetails } from "@/domain/vod/types";
import type { DownloadTask } from "@/db/repositories/downloadRepository";
import { useDownloadState } from "@/domain/downloads/useDownloadState";
import { getVodDetails } from "@/providers/xtream/vodAdapter";
import { getActiveSession } from "@/state/activeSessionStore";
import { useLibraryToggle } from "@/state/useLibraryToggle";

export default function MovieDetailsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  /* Navigation-bar clearance — see live/player/[channelId].tsx. */
  const insets = useSafeAreaInsets();
  const { movieId } = useLocalSearchParams<{ movieId: string }>();
  const session = getActiveSession();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(height * 0.46);

  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const [pendingDownloadRemoval, setPendingDownloadRemoval] = useState(false);

  const isOffline = useIsOffline();
  const noInternetMessage = isOffline && !details ? t("common", "noInternet") : null;

  useEffect(() => {
    if (!session || !movieId || isOffline) return;
    let cancelled = false;
    getVodDetails(session.config, movieId).then(
      (result) => {
        if (!cancelled) {
          setDetails(demoDetail(result));
          setErrorMessage(null);
        }
      },
      (error) => {
        if (!cancelled) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    );
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per movieId (plus an explicit retry), and again if connectivity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, reloadToken, isOffline]);

  const libraryItem = details
    ? {
        contentType: "movie" as const,
        providerItemId: details.providerItemId,
        title: details.name,
        imageUrl: details.posterUrl,
        categoryId: details.categoryId,
        containerExtension: details.containerExtension,
      }
    : null;
  const favorite = useLibraryToggle("favorite", libraryItem);
  const watchLater = useLibraryToggle("watch_later", libraryItem);

  const download = useDownloadState(
    details && session
      ? {
          contentType: "movie",
          providerItemId: details.providerItemId,
          providerId: session.provider.id,
          title: details.name,
          subtitle: null,
          imageUrl: details.posterUrl,
          containerExtension: details.containerExtension,
          seriesId: null,
          seasonNumber: null,
          episodeNumber: null,
        }
      : null
  );

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  function play() {
    router.push({ pathname: "/movies/player/[movieId]", params: { movieId } });
  }

  /* One handler, two call sites — the full-screen failure and the banner
     over a movie that is already drawn both mean "ask the provider again". */
  function retry() {
    setReloadToken((n) => n + 1);
  }

  /*
   * Retry is `resume`, not `trigger`: `trigger` refuses outright while a
   * record exists (useDownloadState: `if (!item || !eligible || record)
   * return`), and `resumeDownload` already restarts a row with no resume
   * data to work from — which is exactly what a failed row is. The
   * downloads screen has offered Retry for this status all along
   * (`task.status === "failed"` → `onResume`); this screen offered a
   * disabled button reading "تم التنزيل…" and a frozen progress card whose
   * only control was Cancel. Found in the 2026-11-17 screen audit.
   */
  const downloadFailed = download.record?.status === "failed";
  const downloadLabel = downloadButtonLabel(t, download.record);

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
          rendered as a sibling of the ScrollView — so a refresh refused
          over a movie that had already loaded put a flex-basis-0 box beside
          a scroll view that grows and shrinks on exactly the same terms.
          The scroll view kept the whole height, the message was laid out
          0dp tall, and the failure was therefore silent. A loaded movie
          says so in its body instead — see `refreshErrorBanner` below.
          Found on the series twin in the 2026-11-18 verification pass; this
          screen had the identical defect, with `flex: 1` here all along.
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
              <Skeleton width="40%" height={14} borderRadius={5} />
              <Skeleton width="100%" height={48} borderRadius={Radii.md} />
              <Skeleton width="100%" height={13} borderRadius={4} />
              <Skeleton width="90%" height={13} borderRadius={4} />
              <Skeleton width="70%" height={13} borderRadius={4} />
            </View>
          </ScrollView>
        )}

        {/* Bottom clearance for the navigation bar — this screen omits the
            bottom safe-area edge so its artwork can bleed to the edge. */}
        {details && (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            <ArcHero height={heroHeight}>
              {details.posterUrl && !posterFailed ? (
                <CachedImage
                  uri={details.posterUrl}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  onError={() => setPosterFailed(true)}
                />
              ) : (
                <View style={styles.heroFallback}>
                  <Text style={styles.heroFallbackText}>{details.name}</Text>
                </View>
              )}
              {/*
                  No scrim over the artwork, and no straight edge under it
                  either.

                  Three flat rectangles used to sit here, stacked at
                  bottom: 120 / 60 / 0, standing in for a gradient the app
                  has no dependency for. Flat layers have hard edges, so
                  what they actually drew over the poster was two black
                  horizontal lines across the picture — visible in a
                  framebuffer scan on 2026-09-16 as luminance steps at the
                  exact rows where the rectangles met, and reported as
                  "الخطوط موجودة على صورة البوستر".

                  The instruction is that there are to be no black
                  gradients anywhere (see the note in the live player), and
                  that stands. What the picture ends in instead is a shape
                  rather than a cut — see ArcHero.
              */}
            </ArcHero>

            <View style={styles.body}>
              {/*
                In the body, under the arc, and not at the top of the screen
                where the full-screen error sits: the back button floats
                over the artwork at top: Spacing.xl and is 38dp tall, so a
                strip at y=0 would land in its band. Here it is the first
                line of the page the viewer is already reading, it scrolls
                away once read, and the artwork keeps the top of the screen.

                `errorMessage` and not `noInternetMessage ?? errorMessage`:
                the offline line is `isOffline && !details`, so by
                definition it is null everywhere inside this branch. A
                provider that refused the refresh is the only thing that can
                speak here.

                No `entering` on it either. The animations below are an
                entrance, played once when the movie arrives; this appears
                later, on a failure, and a thing that fades in 420ms after
                the fact reads as decoration rather than as news.
              */}
              {errorMessage && (
                <View style={styles.refreshErrorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                  <BouncePressable style={styles.retryButton} onPress={retry}>
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

              {details.durationLabel && (
                <Animated.View entering={FadeInDown.duration(420).delay(160)} style={styles.chipRow}>
                  <MetaChip glyph="◷" label={details.durationLabel} />
                </Animated.View>
              )}

              <Animated.View entering={FadeInDown.duration(420).delay(220)} style={styles.primaryActionRow}>
                <BouncePressable style={styles.playButton} onPress={play}>
                  <Text style={styles.playButtonText}>▶  {t("movieDetails", "play")}</Text>
                </BouncePressable>
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(420).delay(280)} style={styles.secondaryActionsRow}>
                <BouncePressable style={styles.secondaryButton} onPress={favorite.toggle}>
                  <Text style={[styles.secondaryButtonText, favorite.isSaved && styles.secondaryButtonTextActive]}>
                    {favorite.isSaved ? `★ ${t("movieDetails", "favorited")}` : `☆ ${t("movieDetails", "favorite")}`}
                  </Text>
                </BouncePressable>
                <BouncePressable style={styles.secondaryButton} onPress={watchLater.toggle}>
                  <Text style={[styles.secondaryButtonText, watchLater.isSaved && styles.secondaryButtonTextActive]}>
                    {watchLater.isSaved
                      ? `✓ ${t("movieDetails", "inWatchLater")}`
                      : `+ ${t("movieDetails", "addWatchLater")}`}
                  </Text>
                </BouncePressable>
                {download.eligible && (
                  <BouncePressable
                    style={styles.secondaryButton}
                    onPress={downloadFailed ? download.resume : download.trigger}
                    disabled={download.record !== null && !downloadFailed}
                  >
                    <Text style={[styles.secondaryButtonText, download.record && styles.secondaryButtonTextActive]}>
                      {downloadLabel}
                    </Text>
                  </BouncePressable>
                )}
              </Animated.View>

              {download.record && download.record.status !== "completed" && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.downloadProgressCard}>
                  {/*
                    No bar on a failed transfer. The fill is driven by the
                    live progress entry, which is empty after a restart and
                    is never refilled for a row that died — so what the card
                    drew under a dead download was an empty track, and a
                    progress bar is a promise that something is still moving.
                  */}
                  {!downloadFailed && (
                    <View style={styles.downloadProgressTrack}>
                      <View
                        style={[
                          styles.downloadProgressFill,
                          {
                            width: `${
                              download.progress?.bytesTotal
                                ? Math.min(
                                    100,
                                    (download.progress.bytesDownloaded / download.progress.bytesTotal) * 100
                                  )
                                : 0
                            }%`,
                          },
                        ]}
                      />
                    </View>
                  )}
                  <View style={styles.downloadControlRow}>
                    {/* A byte count on a transfer that has stopped for good
                        says nothing about why it stopped. `downloads.failed`
                        is the same word the downloads screen prints in its
                        own row meta, in the same muted style. */}
                    <Text style={styles.downloadProgressText}>
                      {downloadFailed
                        ? t("downloads", "failed")
                        : `${formatBytes(download.progress?.bytesDownloaded ?? download.record.bytesDownloaded)}${
                            download.progress?.bytesTotal ?? download.record.bytesTotal
                              ? ` / ${formatBytes(download.progress?.bytesTotal ?? download.record.bytesTotal ?? 0)}`
                              : ""
                          }`}
                    </Text>
                    <View style={styles.downloadControlButtons}>
                      {download.record.status === "downloading" && (
                        <BouncePressable style={styles.downloadControl} onPress={download.pause}>
                          <Text style={styles.downloadControlText}>{t("downloads", "pause")}</Text>
                        </BouncePressable>
                      )}
                      {download.record.status === "paused" && (
                        <BouncePressable style={styles.downloadControl} onPress={download.resume}>
                          <Text style={styles.downloadControlText}>{t("downloads", "resume")}</Text>
                        </BouncePressable>
                      )}
                      <BouncePressable style={styles.downloadControl} onPress={download.cancel}>
                        <Text style={styles.downloadControlTextDanger}>{t("downloads", "cancel")}</Text>
                      </BouncePressable>
                    </View>
                  </View>
                </Animated.View>
              )}

              {download.record?.status === "completed" && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.downloadProgressCard}>
                  <View style={styles.downloadControlRow}>
                    <Text style={styles.downloadProgressText}>
                      {formatBytes(download.record.bytesDownloaded)}
                    </Text>
                    <BouncePressable style={styles.downloadControl} onPress={() => setPendingDownloadRemoval(true)}>
                      <Text style={styles.downloadControlTextDanger}>{t("downloads", "delete")}</Text>
                    </BouncePressable>
                  </View>
                </Animated.View>
              )}

              {details.plot && (
                <Animated.View entering={FadeIn.duration(400).delay(340)} style={styles.section}>
                  <SectionHeader title={t("movieDetails", "plot")} />
                  <Text style={styles.sectionText}>{details.plot}</Text>
                </Animated.View>
              )}

              {(details.cast || details.director) && (
                <Animated.View entering={FadeIn.duration(400).delay(400)} style={styles.section}>
                  <SectionHeader title={t("movieDetails", "cast")} />
                  <View style={styles.infoCard}>
                    {details.director && <InfoRow label={t("movieDetails", "director")} value={details.director} />}
                    {details.cast && <InfoRow label={t("movieDetails", "cast")} value={details.cast} />}
                  </View>
                </Animated.View>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDownloadRemoval}
        title={t("downloads", "deleteConfirmTitle")}
        message={t("downloads", "deleteConfirmBody", { title: details?.name ?? "" })}
        confirmLabel={t("downloads", "delete")}
        danger
        onConfirm={() => {
          setPendingDownloadRemoval(false);
          download.remove();
        }}
        onCancel={() => setPendingDownloadRemoval(false)}
      />
    </ScreenBackground>
  );
}

/**
 * One label per download status, as a switch over the union rather than a
 * chain of ternaries — the same shape, and for the same reason, as
 * `statusLabel` on the downloads screen.
 *
 * `DownloadStatus` carries six values and this button spoke about three:
 * anything that was neither absent nor "completed" read "⬇ تم التنزيل…" —
 * "Downloaded…" — over a download that was queued, paused, or (the case the
 * 2026-11-17 audit raised) dead, on a button that was `disabled` because a
 * record existed. A switch over the union makes the compiler ask for all
 * six, so the next status added cannot quietly inherit the wrong sentence.
 *
 * Every string below is already translated in all six locales; nothing new
 * was written for this.
 *
 * "canceled" is unreachable — `cancelDownload` deletes the row rather than
 * marking it — but the type carries it, so it carries the idle label.
 */
function downloadButtonLabel(t: ReturnType<typeof useI18n>["t"], record: DownloadTask | null): string {
  if (!record) return `⬇ ${t("movieDetails", "download")}`;
  switch (record.status) {
    case "completed":
      return `✓ ${t("movieDetails", "downloaded")}`;
    case "failed":
      return `↻ ${t("common", "retry")}`;
    case "queued":
      return `⋯ ${t("downloads", "queued")}`;
    case "paused":
      return `❙❙ ${t("downloads", "paused")}`;
    case "downloading":
      return `⬇ ${t("downloads", "downloading")}`;
    case "canceled":
      return `⬇ ${t("movieDetails", "download")}`;
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  /*
   * Two boxes, and `flex: 1` is right in one and wrong in the other — the
   * same split the series twin arrived at, under the same names, so the two
   * screens can be read against each other.
   *
   * `errorState` — the whole screen, when nothing has arrived to put on it.
   * It was called `centered`, which described the alignment and not the job;
   * it has exactly one caller and that caller is the failure state.
   * `flex: 1` is what keeps it off the floating back button, which is 38dp
   * tall at top: Spacing.xl over artwork that reaches the status bar
   * (edges=["left","right"], no top inset).
   *
   * `refreshErrorBanner` — a refresh the provider refused over a movie
   * already drawn. `flex: 1` is wrong here the other way round: as a sibling
   * of the ScrollView its flex basis is 0 while the scroll view grows and
   * shrinks on the same terms, so the scroll view took the full height and
   * this was laid out 0dp tall. No flex at all, and inside the body rather
   * than beside the scroll view — it is a line of content, not a screen.
   * `errorBlock` on the Movies tab answers the same two failures and this
   * borrows its shape, plus a bottom margin: the body sets no row gap and
   * the title carries no `marginTop`, so without one the film's name would
   * sit flush against the Retry button.
   */
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  refreshErrorBanner: {
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: C.error, fontSize: 14, fontFamily: FontFamily.medium, textAlign: "center" },
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

  scrollContent: { paddingBottom: Spacing.xxl },
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

  secondaryActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.semiBold },
  secondaryButtonTextActive: { color: Brand.primaryLight },

  downloadProgressCard: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  downloadProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.fillMedium,
    overflow: "hidden",
  },
  downloadProgressFill: { height: "100%", backgroundColor: Brand.primary },
  downloadProgressText: { flex: 1, color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },
  downloadControlRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  downloadControlButtons: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  downloadControl: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
  },
  downloadControlText: { color: C.textSecondary, fontSize: 11, fontFamily: FontFamily.semiBold },
  downloadControlTextDanger: { color: Brand.primaryLight, fontSize: 11, fontFamily: FontFamily.semiBold },

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
  })
);
