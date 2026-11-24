import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { CachedImage } from "@/components/CachedImage";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { LiveGlyph, MoviesGlyph, SeriesGlyph } from "@/components/TabIcons";
import { SectionHeader } from "@/components/SectionHeader";
import { BRAND } from "@/core/brand";
import { useTabBarSpace } from "@/components/MoojTabBar";
import { SECTION_LIVE, SECTION_MOVIES, SECTION_SERIES } from "@/core/theme/sections";
import { useI18n } from "@/core/i18n/I18nContext";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import {
  clearAllWatchProgress,
  getRecentWatchProgress,
  type WatchProgressEntry,
} from "@/db/repositories/watchProgressRepository";
import { disconnectProvider, getActiveSession } from "@/state/activeSessionStore";
import {
  featured as pickFeatured,
  moviesOnly as pickMovies,
  newThisYear as pickNewThisYear,
  seriesOnly as pickSeries,
  topRated as pickTopRated,
  currentYear,
  hasUsableArt,
  type HomeItem,
} from "@/core/home/homeRows";
import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { getLibraryItems, type LibraryItem } from "@/db/repositories/libraryRepository";
import { getAllDownloadTasks, type DownloadTask } from "@/db/repositories/downloadRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";

/**
 * The name block under every poster card, to the pixel.
 *
 * Two lines at a fixed line height, always — see the note above
 * PosterCard. These two numbers and the box in the styles below are one
 * fact written twice; changing either alone is how a rail goes ragged.
 *
 * Both cards pin their name with `allowFontScaling={false}`, which is the
 * third copy of the same fact. 2026-11-17: React Native scales `fontSize`
 * *and* `lineHeight` by Android's Display → Font size setting, while a
 * container height written in dp is scaled by nothing — so at Large (1.15)
 * or Largest (1.30) two lines of a 14-point line height want 32 to 36 points
 * inside a 28-point box. Nothing clips them: a View's overflow is visible by
 * default and BouncePressable sets none, so the second line was drawn below
 * the card, through the rail's gap and into the next SectionHeader — and
 * only on the cards whose names run to two lines, which is the ragged rail
 * this box exists to prevent, arriving by another door.
 *
 * 2026-11-18: that pin was `maxFontSizeMultiplier={1}` for a day, and it
 * answered only half of the sentence above — the prop caps the glyphs and
 * not the leading. The proof is in our own copy of React Native (0.86.2-0,
 * `newArchEnabled: true`, so the Fabric path):
 * `TextAttributeProps.setFontSize` converts through
 * `PixelUtil.toPixelFromSP(fontSize, maxFontSizeMultiplier)`, while the
 * `lineHeight` setter at the top of the same class calls the one-argument
 * `toPixelFromSP(value)` — whose `maxFontScale` parameter then defaults to
 * NaN, so the `if (maxFontScale >= 1)` clamp inside `PixelUtil` never fires
 * and the leading keeps the system scale whole. (The old
 * `views/text/TextAttributes.kt` does hand the multiplier to both, which is
 * why the prop reads as though it should have worked; the new architecture
 * never goes through that class.) So at Largest the letters stayed at 10.5
 * while the two lines still asked for 36 points inside 28, and the overflow
 * above — second line through the rail gap and into the next SectionHeader —
 * was exactly as described, minus the bigger letters.
 * `allowFontScaling={false}` sends both figures through `toPixelFromDIP`
 * instead: 2 × 14 dp of text in a 2 × 14 dp box, at every font scale, which
 * is the agreement this box exists to keep.
 *
 * Capping the text rather than growing the box, and not for want of trying
 * it the other way. The box could be `… * PixelRatio.getFontScale()`, but a
 * `themedStyles` sheet is built once and cached per palette, so that figure
 * would be frozen at whatever the font scale was when the sheet was first
 * read — and nothing invalidates it, since a font-size change recreates
 * MainActivity (`fontScale` is not in its `configChanges`) while the JS
 * context, and the cached sheet with it, lives on.
 * Reading it live means a hook in every card of every rail — and `PosterCard`
 * is memoised precisely so that a hundred of them do not rebuild to resize
 * one hero (see `openFeatured`), which is the saving that hook would hand
 * straight back. And what is being pinned is a 10.5-point caption under a
 * 116×174 poster that does not scale either — a name growing by a third
 * while its card stays put helps nobody read it, since it has no more room
 * to grow into: the card is still 116 wide, so a third more ink fits *fewer*
 * characters, and `numberOfLines={2}` would cut more names short than it
 * does now. Every other label on this screen (the greeting, the section
 * headings, the Continue Watching captions) is left scalable; none of them
 * lives in a fixed box.
 */
const CARD_TITLE_LINE_HEIGHT = 14;
const CARD_TITLE_LINES = 2;


function formatRelativeTime(t: ReturnType<typeof useI18n>["t"], timestamp: number): string {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return t("common", "justNow");
  if (diffMinutes < 60) return t("common", "minutesAgo", { n: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("common", "hoursAgo", { n: diffHours });
  return t("common", "daysAgo", { n: Math.floor(diffHours / 24) });
}

/**
 * How many cards a row offers.
 *
 * Twelve, because a row is a recommendation and a recommendation that runs
 * to fifty is a catalogue. The browse tabs are where the catalogue lives.
 */
const ROW_COUNT = 12;


/**
 * Whether this device can draw the Live card's logo at all.
 *
 * 2026-11-17: that card's artwork is not an image laid on the card, it is a
 * `mixBlendMode: "multiply"` composite — the treatment the owner chose after
 * turning down three others ("بس اعمل شفافية وخلص / لاول قناة مثل ما كنت
 * عامل"), and the reason the white baked into every channel logo disappears
 * instead of sitting on the card as a slab. React Native applies that style
 * from Android 10 up and nowhere else: `BlendModeHelper.parseMixBlendMode`
 * returns null below `Build.VERSION_CODES.Q` (API 29), so no blend tag is
 * set, no isolated layer is made, and the style is dropped without a word.
 * This app's `minSdkVersion` is 26 (app.config.js), so Android 8.0, 8.1 and
 * 9 are three shipped versions on which it does nothing.
 *
 * Dropped does not leave the card as it was — it leaves the logo pasted on
 * whole, white background and all, which is exactly the slab that was
 * rejected: "لا مو حلوة". So those devices get no artwork rather than that
 * artwork: `SectionCard` already draws nothing when `artUrl` is null, and
 * what is left is flat section colour, glyph and label — how the card
 * shipped before the logo was added, and a finished card either way.
 *
 * Only the Live card is gated. Movie and series posters are photographs
 * drawn normally and look the same on every API level, and the card's own
 * `isolation: "isolate"` costs these devices nothing: `needsIsolatedLayer`
 * only answers yes when a child actually carries a blend tag, and below 29
 * none ever does.
 *
 * The `Platform.OS` half is not ceremony: `Platform.Version` is typed
 * `number | string` because it is a string on iOS, and the check narrows it
 * to the Android number an API level actually means. There is no iOS target
 * in app.config.js, so on everything this project builds today the test is
 * the API level alone — but if one is ever added, come back here first:
 * iOS draws `mixBlendMode` perfectly well and this line would hide the logo
 * from it for no reason.
 */
const CAN_BLEND_LOGO = Platform.OS === "android" && Platform.Version >= 29;


/* Hoisted so the three cards get a stable `onPress` and `memo` can do its job;
   they capture nothing from the screen. */
const openLive = () => router.push("/live-categories");
const openMovies = () => router.push("/movies-categories");
const openSeries = () => router.push("/series-categories");

export default function HomeScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  /* The bar floats over the screen, so the screen leaves room for it. */
  const tabBarSpace = useTabBarSpace();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const landscape = winWidth > winHeight;
  /**
   * Read live, never memoised.
   *
   * 2026-11-14: this was `useMemo(() => getActiveSession(), [])`, so `session`
   * stayed whatever it was on the very first render of a tab screen that is
   * mounted once and kept. The provider-switch reset below compares
   * `builtForProvider` against it, so with a frozen value the two could never
   * disagree and the reset was unreachable: after connecting a different
   * provider, Home went on showing account A's name and rows while the app
   * streamed B, and a tap in that state opened A's id against B's session.
   * Every other screen reads it live — live-categories, movies-categories,
   * series-categories, settings, search. This one now does too.
   */
  const session = getActiveSession();
  const [continueWatching, setContinueWatching] = useState<WatchProgressEntry[]>([]);
  const [newRow, setNewRow] = useState<HomeItem[]>([]);
  const [featuredRow, setFeaturedRow] = useState<HomeItem[]>([]);
  const [topRow, setTopRow] = useState<HomeItem[]>([]);
  const [movieRow, setMovieRow] = useState<HomeItem[]>([]);
  const [seriesRow, setSeriesRow] = useState<HomeItem[]>([]);
  const [favouriteRow, setFavouriteRow] = useState<LibraryItem[]>([]);
  const [downloadRow, setDownloadRow] = useState<DownloadTask[]>([]);
  const [builtForProvider, setBuiltForProvider] = useState<string | null>(session?.provider.id ?? null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  /** Set by `disconnect` so the effect below does not also navigate. */
  const leavingOnPurpose = useRef(false);

  /**
   * Forget everything the moment the account underneath changes.
   *
   * A tab screen is mounted once and kept. Connecting a different provider
   * does not take it down: `handleSelect` on the providers screen calls
   * `router.dismissAll()` and `router.replace("/home")`, and neither
   * unmounts a navigator that is already up. Every row on this screen was
   * built from the previous provider's catalogue, and `setActiveSession`
   * has already emptied the stores they came from — so without this the
   * screen would greet the viewer with account B's name over account A's
   * recommendations, with a hero that plays a stream on the wrong line.
   *
   * Checked during render rather than in an effect, which is the point:
   * React applies the reset before this render commits, so the wrong rows
   * are never painted. The focus effect below then refills them from the
   * new catalogue. Same pattern, same reason, as the three browse grids.
   */
  if (builtForProvider !== (session?.provider.id ?? null)) {
    setBuiltForProvider(session?.provider.id ?? null);
    setContinueWatching([]);
    setNewRow([]);
    setFeaturedRow([]);
    setTopRow([]);
    setMovieRow([]);
    setSeriesRow([]);
    setFavouriteRow([]);
    setDownloadRow([]);
  }

  /**
   * The Live TV card's artwork: the first channel logo in the lineup.
   *
   * 2026-11-17: this card shipped with no picture, on the reasoning that home
   * loads no live row and giving it one would cost a request per card on a
   * panel that answers bursts with empty 404s. That reasoning was wrong about
   * the facts — `getActiveSession().channels` is the whole lineup, already
   * loaded, and every channel carries a `logoUrl`. Nothing is fetched here.
   *
   * It was briefly a pool of twelve that changed between visits, because
   * always showing one channel looked frozen under a subtitle that says
   * "Channels playing now". The owner asked for the single channel back the
   * same day — "لاول قناة مثل ما كنت عامل" — so the loop stops at the first
   * again.
   *
   * `artworkIsKnownBad` as well as `hasUsableArt`, because the two ask
   * different questions. The first channel in a lineup is routinely one whose
   * logo host has already 404'd — `hasUsableArt` only inspects the shape of
   * the URL, so it says yes, `CachedImage` then renders nothing for a URL it
   * has already recorded as dead, and the card sits blank while eleven
   * thousand working logos go unasked.
   */
  const liveArt = useMemo(() => {
    for (const channel of session?.channels ?? []) {
      const url = channel.logoUrl;
      if (url && hasUsableArt(url) && !artworkIsKnownBad(url)) return url;
    }
    return null;
  }, [session]);

  const year = useMemo(() => currentYear(), []);

  const refreshContinueWatching = useCallback(() => {
    getRecentWatchProgress(10).then(setContinueWatching);
  }, []);

  /*
   * Everything the screen shows is rebuilt on focus, not on mount.
   *
   * A tab stays mounted while the viewer stars something, downloads
   * something or finishes an episode three screens away, and a home screen
   * that only read the database on its first visit would be stale for the
   * rest of the session — which is the state the rows most worth having are
   * in most of the time.
   *
   * The catalogue rows go through homeRows, which scans the lineup once and
   * caches against the arrays themselves, so returning here repeatedly
   * costs a lookup rather than a walk over 26,000 titles.
   */
  useFocusEffect(
    useCallback(() => {
      refreshContinueWatching();
      setNewRow(pickNewThisYear(ROW_COUNT));
      setFeaturedRow(pickFeatured(ROW_COUNT));
      setTopRow(pickTopRated(ROW_COUNT));
      setMovieRow(pickMovies(ROW_COUNT));
      setSeriesRow(pickSeries(ROW_COUNT));
      getLibraryItems("favorite").then((items) => setFavouriteRow(items.slice(0, ROW_COUNT)));
      if (downloadsSupported()) {
        getAllDownloadTasks().then((tasks) =>
          setDownloadRow(tasks.filter((d) => d.status === "completed").slice(0, ROW_COUNT))
        );
      }
    }, [refreshContinueWatching])
  );

  /**
   * The session can also go away for reasons the viewer did not ask for — a
   * provider deleted from another screen, a restore that failed. Then the
   * right place to be is "/", which works out where to send them.
   *
   * Not when they disconnected on purpose: see `disconnect` above.
   */
  useEffect(() => {
    if (!session && !leavingOnPurpose.current) router.replace("/");
  }, [session]);

  /*
   * Stable, so the memoised cards below can bail out.
   *
   * Above the early return, because a hook after one is a hook that is
   * not always called.
   *
   * Every row on this screen re-renders whenever the screen does, and the
   * screen re-renders on every rotation — about a hundred cards rebuilt to
   * resize one hero. Handing each card a fresh `() => openFeatured(item)`
   * made that unavoidable; taking the item as an argument instead means
   * the prop is identical from one render to the next and `memo` can do
   * its job. Shorter re-render, shorter stale frame.
   */
  const openFeatured = useCallback((item: HomeItem) => {
    if (item.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: item.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
    }
  }, []);

  if (!session) {
    return null;
  }

  /**
   * The viewer pressed the ✕ and confirmed.
   *
   * `leavingOnPurpose` is load-bearing. Clearing the session makes `session`
   * null, which wakes the effect below — and that effect sends the app to "/",
   * whose job is to find the active provider and reconnect it. Before
   * `disconnectProvider` cleared the provider too, that reconnected to the one
   * just disconnected from and landed back on this screen, so fast that the
   * button looked dead: "كبست حرف الx ... واخترت ديسكونكت. ماصار شي".
   *
   * The provider is cleared now, so that path would at least end on /providers
   * — but it would go there the long way, through a screen that re-reads the
   * database. The flag keeps the effect out of the way and lets this function
   * navigate once.
   */
  function disconnect() {
    leavingOnPurpose.current = true;
    void disconnectProvider().finally(() => {
      /*
       * The whole stack goes, not just this screen — the same reason Settings
       * gives: `replace` alone leaves the other tabs mounted underneath, and
       * one hardware back lands on a screen still showing the disconnected
       * provider's rows.
       */
      router.dismissAll();
      router.replace("/providers");
    });
  }

  function resumeWatching(entry: WatchProgressEntry) {
    if (entry.contentType === "movie") {
      router.push({ pathname: "/movies/player/[movieId]", params: { movieId: entry.providerItemId } });
    } else {
      router.push({
        pathname: "/series/player/[episodeId]",
        params: {
          episodeId: entry.providerItemId,
          containerExtension: entry.containerExtension,
          title: entry.title,
          imageUrl: entry.imageUrl ?? "",
          seriesId: entry.seriesId ?? "",
          seasonNumber: entry.seasonNumber !== null ? String(entry.seasonNumber) : "",
          episodeNumber: entry.episodeNumber !== null ? String(entry.episodeNumber) : "",
        },
      });
    }
  }



  return (
    /* The drifting particles run entirely on the native thread (Reanimated
       mutates the views directly — no React re-renders, no JS-thread work
       per frame), so they cost the scrolling rails below nothing. Kept to a
       low count regardless: this is a background accent, not an effect. */
    <ScreenBackground particles>
      {/* No bottom edge, and that is what lets the bar's scoop show content.
          The capsule floats over this screen rather than sitting below it, so
          the screen has to run all the way down and pass under it; a bottom
          inset here would stop the content short and put the page colour back
          in the gap. The room the capsule needs comes from useTabBarSpace()
          as padding inside the scroller instead. */}
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.xxl + tabBarSpace }]} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Image
              source={brandLogoSource()}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>{BRAND.wordmark}</Text>
              <Text style={styles.welcome} numberOfLines={2}>
                {t("home", "welcomeBack")} · {session.provider.name}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <BouncePressable
                style={styles.headerIconButton}
                onPress={() => router.push("/search")}
                accessibilityLabel={t("home", "search")}
              >
                <Text style={styles.headerIconText}>⌕</Text>
              </BouncePressable>
              <BouncePressable
                style={styles.disconnectButton}
                onPress={() => setConfirmDisconnect(true)}
                accessibilityLabel={t("settings", "disconnect")}
              >
                {/*
                  "✕", not the power symbol "⏻": that glyph is absent from
                  Noto Kufi Arabic *and* from Android's fallback chain, so it
                  rendered as an empty tofu box on the device. This one is in
                  every font the app can land on.
                */}
                <Text style={styles.disconnectButtonText}>✕</Text>
              </BouncePressable>
            </View>
          </Animated.View>

          {/*
            The three doors.

            The screen this replaces opened on one large recommendation. The
            approved design opens on the three places the viewer can go
            instead, because a home screen's first job is to say where things
            are — the rows below still do the recommending. Each card wears its
            section's colour, and the tab bar lights the same three, so the app
            answers "where am I" without a word being read.
          */}
          <Animated.View
            entering={FadeInDown.delay(40).duration(420)}
            style={[styles.sectionCards, landscape && styles.sectionCardsWide]}
          >
            <SectionCard
              wide={landscape}
              colour={SECTION_LIVE}
              Glyph={LiveGlyph}
              title={t("home", "liveTV")}
              subtitle={t("home", "liveTVSub")}
              /* Nothing to blend with below Android 10 — see CAN_BLEND_LOGO. */
              artUrl={CAN_BLEND_LOGO ? liveArt : null}
              artKind="logo"
              onPress={openLive}
            />
            <SectionCard
              wide={landscape}
              colour={SECTION_MOVIES}
              Glyph={MoviesGlyph}
              title={t("home", "movies")}
              subtitle={t("home", "moviesSub")}
              artUrl={movieRow[0]?.posterUrl ?? null}
              onPress={openMovies}
            />
            <SectionCard
              wide={landscape}
              colour={SECTION_SERIES}
              Glyph={SeriesGlyph}
              title={t("home", "series")}
              subtitle={t("home", "seriesSub")}
              artUrl={seriesRow[0]?.posterUrl ?? null}
              onPress={openSeries}
            />
          </Animated.View>

          {/*
            Rows, each of which disappears when it has nothing to say.

            An empty row is worse than a missing one: it spends a heading, a
            card-height of screen and a scroll on telling the viewer that
            there is nothing here. The screen that was here before kept a
            "Continue watching" heading over an empty box permanently, which
            is how a home screen ends up mostly furniture.
          */}

          {newRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(380)}>
              {/* The year is the point of the row, so it is in the heading. */}
              <SectionHeader title={`${t("home", "newIn")} ${year}`} />
              <FlatList
                {...NO_CLIP}
                data={newRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {topRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(215).duration(380)}>
              <SectionHeader title={t("home", "topRated")} />
              <FlatList
                {...NO_CLIP}
                data={topRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {movieRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(250).duration(380)}>
              <SectionHeader
                title={t("home", "movies")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/movies-categories") }}
              />
              <FlatList
                {...NO_CLIP}
                data={movieRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {seriesRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(285).duration(380)}>
              <SectionHeader
                title={t("home", "series")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/series-categories") }}
              />
              <FlatList
                {...NO_CLIP}
                data={seriesRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {favouriteRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(250).duration(380)}>
              <SectionHeader
                title={t("home", "favorites")}
                action={{
                  label: t("home", "seeAll"),
                  onPress: () =>
                    router.push({
                      pathname: "/library/[listType]",
                      params: { listType: "favorite" },
                    }),
                }}
              />
              <FlatList
                {...NO_CLIP}
                data={favouriteRow}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <SavedCard
                    title={item.title}
                    imageUrl={item.imageUrl}
                    onPress={() =>
                      router.push({
                        pathname: "/library/[listType]",
                        params: { listType: "favorite" },
                      })
                    }
                  />
                )}
              />
            </Animated.View>
          )}

          {downloadRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(320).duration(380)}>
              <SectionHeader
                title={t("home", "downloads")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/downloads") }}
              />
              <FlatList
                {...NO_CLIP}
                data={downloadRow}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <SavedCard
                    title={item.title}
                    imageUrl={item.imageUrl}
                    onPress={() => router.push("/downloads")}
                  />
                )}
              />
            </Animated.View>
          )}

          {featuredRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(390).duration(380)}>
              <SectionHeader title={t("home", "featured")} />
              <FlatList
                {...NO_CLIP}
                data={featuredRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {/*
            Last, not second.

            A resume row is the fastest way back into something already
            started, which is the argument for putting it at the top — and
            it is the wrong argument for this screen. Second place is where
            the eye lands after the hero, and giving it to a row of things
            the viewer has already seen means the screen opens on the past.
            Everything above this offers something new; this is the one row
            that offers something old, so it closes the screen rather than
            fronting it. Anyone looking for it knows it is there.

            Its entrance delay goes last with it — the cascade reads top to
            bottom or it reads as a mistake.
          */}
          {continueWatching.length > 0 && (
            <Animated.View entering={FadeInDown.delay(430).duration(380)}>
              <SectionHeader
                title={t("home", "continueWatching")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/history") }}
                secondaryAction={{
                  label: t("home", "clear"),
                  onPress: () => setConfirmClearHistory(true),
                  destructive: true,
                }}
              />
              <FlatList
                {...NO_CLIP}
                data={continueWatching}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <ContinueWatchingCard entry={item} onPress={() => resumeWatching(item)} />
                )}
              />
            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDisconnect}
        title={t("settings", "disconnect")}
        message={t("settings", "disconnectConfirmBody")}
        confirmLabel={t("settings", "disconnect")}
        danger
        onConfirm={() => {
          setConfirmDisconnect(false);
          disconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        visible={confirmClearHistory}
        title={t("home", "clearHistoryTitle")}
        message={t("home", "clearHistoryBody")}
        confirmLabel={t("home", "clear")}
        danger
        onConfirm={async () => {
          setConfirmClearHistory(false);
          await clearAllWatchProgress();
          refreshContinueWatching();
        }}
        onCancel={() => setConfirmClearHistory(false)}
      />

    </ScreenBackground>
  );
}

/**
 * A card for the rows that come out of the database rather than the
 * catalogue: things the viewer saved or downloaded.
 *
 * Those rows carry their own stored image, which can be absent on a row
 * the viewer built before the artwork was available — so unlike PosterCard
 * this one does have a fallback, and it has to: dropping a title somebody
 * explicitly saved, because its picture is missing, would be losing their
 * work to a cosmetic rule.
 */
function SavedCard({
  title,
  imageUrl,
  onPress,
}: {
  title: string;
  imageUrl: string | null;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const showArt = !failed && hasUsableArt(imageUrl);

  return (
    <BouncePressable style={styles.featuredCard} onPress={onPress}>
      <View style={styles.featuredImageWrap}>
        {showArt ? (
          <CachedImage
            uri={imageUrl}
            style={styles.featuredImage}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.featuredFallback} />
        )}
      </View>
      <View style={styles.featuredTitleBox}>
        <Text
          style={styles.featuredTitle}
          numberOfLines={CARD_TITLE_LINES}
          /*
            Size *and* line height in dp, the same unit as the box — a
            multiplier cap would leave the leading scaling on its own. See
            CARD_TITLE_LINE_HEIGHT.
          */
          allowFontScaling={false}
        >
          {title}
        </Text>
      </View>
    </BouncePressable>
  );
}

/**
 * One of the three doors at the top of the home screen.
 *
 * ## The gradient is an image, and it had to be
 *
 * The approved design puts artwork on the right of each card and fades the
 * section's colour across it from the left, so the title sits on flat colour
 * while the picture still shows beside it. React Native has no CSS gradients,
 * and `expo-linear-gradient` is the one thing this project deliberately does
 * not reach for — see the note in ArtScrim: it is a native module, and a few
 * hundred bytes of asset does not justify one.
 *
 * So the ramp is painted into a file the same way, turned on its side.
 * `assets/images/card-scrim.png` is 512 by 4 pixels of white whose alpha
 * holds at 255 to 44% of the width, falls to 115 at 66% and to 0 at 92% —
 * the design's own gradient stops, read off it. 152 bytes.
 *
 * White, because `tintColor` recolours what is opaque and leaves alpha
 * alone: one asset serves all three cards, and any section added later, with
 * no second file to keep in step.
 *
 * ## Where the artwork comes from
 *
 * All three take it from data already in memory, so none of them costs a
 * request on a panel that answers a burst of them with empty 404s (AGENTS.md).
 * The movie and series cards use the first poster of a row the screen has
 * already built; the live card uses the first channel logo in the session's
 * own lineup — see the note on `liveArt`.
 */
const SectionCard = memo(function SectionCard({
  wide,
  colour,
  Glyph,
  title,
  subtitle,
  artUrl,
  artKind = "poster",
  onPress,
}: {
  /** Laid out three across, because the phone is on its side. */
  wide: boolean;
  colour: string;
  Glyph: typeof LiveGlyph;
  title: string;
  subtitle: string;
  artUrl: string | null;
  /**
   * What the artwork IS, which decides how it is drawn.
   *
   * `poster` — Movies and Series. A picture: it bleeds across its half of the
   * card and the scrim fades it into the colour, the way every rail in the app
   * treats a poster.
   *
   * `logo` — Live. A mark, not a picture, and it is composited onto the card
   * with `mixBlendMode: "multiply"` instead of being drawn over it.
   *
   * That one word is the whole answer to a problem three other attempts did
   * not solve. A channel logo almost never carries transparency — the lineup's
   * are flattened onto white — so bleeding one across the card pasted a white
   * slab on it, containing it made the slab a smaller white rectangle, and a
   * white chip behind it only made the rectangle deliberate. The owner
   * rejected each in turn: "لا مو حلوة".
   *
   * Multiply makes the white genuinely disappear, because white is multiply's
   * identity: every channel multiplied by 1 is the backdrop unchanged. Only
   * the ink survives, darkened into the card's own blue, so the mark reads as
   * part of the card rather than as a sticker on it. No alpha channel needed,
   * no download, no decode, and it works the same on every logo the provider
   * sends.
   *
   * The card sets `isolation: "isolate"` so the blend stops at the card. Without
   * it the backdrop is whatever happens to be painted below, which on a
   * scrolling screen is not a fixed thing.
   *
   * None of that reaches a device that cannot blend: React Native drops
   * `mixBlendMode` below Android 10 and the Live card's caller withholds the
   * URL there rather than let the slab back in, so `logo` only ever arrives
   * with an `artUrl` on a device that draws it as described. See
   * `CAN_BLEND_LOGO`.
   */
  artKind?: "poster" | "logo";
  onPress: () => void;
}) {
  return (
    <BouncePressable
      style={[styles.sectionCard, wide && styles.sectionCardWide, { backgroundColor: colour }]}
      onPress={onPress}
      accessibilityLabel={title}
    >
      {artUrl ? (
        /* One width in both orientations, and it has to be — see `sectionArt`. */
        <View style={styles.sectionArt}>
          <CachedImage
            uri={artUrl}
            style={artKind === "logo" ? styles.sectionArtLogo : styles.sectionArtImage}
            resizeMode="cover"
          />
        </View>
      ) : null}
      <Image
        source={require("../../../assets/images/card-scrim.png")}
        style={[styles.sectionScrim, { tintColor: colour }]}
        /* a ramp, not a picture: its aspect ratio means nothing */
        resizeMode="stretch"
        /* Android fades a decoded image in by default; a scrim must not arrive late */
        fadeDuration={0}
      />
      <View style={[styles.sectionBody, wide && styles.sectionBodyWide]}>
        <View style={styles.sectionTitleRow}>
          <Glyph color="#FFFFFF" size={20} />
          <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
        </View>
        <Text style={styles.sectionSub} numberOfLines={1}>{subtitle}</Text>
      </View>
    </BouncePressable>
  );
});

/**
 * No `entering` animation: the rails are horizontal FlatLists, so cards
 * recycle as they scroll and an entrance would re-fire each time — a card
 * would fade in again every time it came back round, which reads as a
 * glitch rather than as motion.
 *
 * Home's entrance motion therefore lives on things that mount exactly
 * once. That used to mean the browse cards and the quick-action grid;
 * those moved to the tab bar and the more screen, so it is now the header
 * and the two section wrappers, each a beat behind the last.
 */
/**
 * Why no card in this app prints a title on its artwork any more.
 *
 * Almost every poster a provider sends already has the title printed on
 * it, usually across the bottom third, because that is what a film poster
 * is. Drawing our own name on top of that produces two titles in the same
 * place in two different typefaces — and on a screenshot of the home
 * screen taken on 2026-11-08, that was six cards out of nine: "Another
 * Life" over ANOTHER LIFE, "Biohackers" over BIOHACKERS, "الجواهرجى" over
 * its own Arabic lettering. Unreadable, and unmistakably a mistake.
 *
 * So the name moves under the card, which has a second effect worth as
 * much: the dark wash existed *only* to keep white text readable over
 * artwork. With the text gone the wash goes too, and the poster is seen
 * whole — the same change, and the same reason, as the channel logos.
 *
 * The cost is the one the old comment named: a two-line name under a card
 * makes that card taller than its neighbours and the row goes ragged. The
 * answer is the one the channel grid already uses — a name box of a fixed
 * height, two lines whether the name needs one or two, so every card in a
 * rail is exactly the same height and every grid row is exactly
 * `rowHeight()`.
 */

/**
 * One card in a row: a poster, its rating, its name underneath.
 *
 * No fallback for a missing picture, because there is no such card here —
 * homeRows filters anything without usable artwork out before a row is
 * built. That is the rule for this screen: a browse grid has to show the
 * whole catalogue, blanks and all, but a recommendation with no picture is
 * not a recommendation.
 */
const PosterCard = memo(function PosterCard({
  item,
  onPress,
}: {
  item: HomeItem;
  /** Takes the item, so one function serves every card — see openFeatured. */
  onPress: (item: HomeItem) => void;
}) {
  /*
   * Subscribed to the theme individually, like CategoryTabs' chips.
   *
   * 2026-11-17: `memo` compares props and a theme change touches none of
   * them — `item` comes out of a memoised row array and `onPress` is the
   * stable `openFeatured` — so every card bailed out still holding the
   * stylesheet it first resolved under. Switch to light in Settings and press
   * back, and all five rails keep the dark palette: every poster tile
   * #12121A, every failed tile #1C1C28, every name #9CA3AF, on a white page.
   * That is the same measurement themedStyles.ts records for the bug it says
   * it already fixed in the three browse grids. It happens the other way
   * round too, and whenever "follow system" flips while Home is sitting in
   * the stack.
   *
   * The grids answer it with a theme-dependent `key` on the list, which
   * remounts the whole thing; they can afford that because they already
   * remount on a column change and restore their scroll position. Doing the
   * same here means five more keys to keep in step and five rails that jump
   * back to their first card when the theme flips, so the rails take the
   * subscription instead — the same trade, and the same reasoning, as the
   * note above `Chip`.
   *
   * One `useSyncExternalStore` per mounted card is the price. On the phone
   * that is whatever is on screen plus the window; on the television
   * `NO_CLIP` keeps every cell of every rail mounted, so about sixty. The
   * store is a plain `Set` walked once per theme flip — a flip the viewer
   * caused — and CategoryTabs already pays the same per chip.
   *
   * `SectionCard` above needs nothing: its surfaces are the section colour
   * and white, with no palette lookup in them at all.
   */
  useThemeRerender();
  const [failed, setFailed] = useState(false);
  const press = useCallback(() => onPress(item), [onPress, item]);

  return (
      <BouncePressable style={styles.featuredCard} onPress={press}>
        <View style={styles.featuredImageWrap}>
          {!failed ? (
            <CachedImage
              uri={item.posterUrl}
              style={styles.featuredImage}
              resizeMode="cover"
              onError={() => setFailed(true)}
            />
          ) : (
            /*
              A plain tile, with no text in it.
              
              It used to carry the name, because the title then sat under
              the card and a card with no art was a blank box. The title is
              over the art now, so the name is already there — and a card
              whose poster failed was printing it twice, once greyed in the
              middle and once white at the foot.
            */
            <View style={styles.featuredFallback} />
          )}
          {item.rating !== null && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeText}>★ {item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {/* Under the poster, not on it — see the note above PosterCard. */}
        <View style={styles.featuredTitleBox}>
          <Text
            style={styles.featuredTitle}
            numberOfLines={CARD_TITLE_LINES}
            /*
              Size *and* line height in dp, the same unit as the box — a
              multiplier cap would leave the leading scaling on its own. See
              CARD_TITLE_LINE_HEIGHT.
            */
            allowFontScaling={false}
          >
            {item.name}
          </Text>
        </View>
      </BouncePressable>
  );
});

/** No `entering` animation — same reasoning as `FeaturedCard` above. */
function ContinueWatchingCard({ entry, onPress }: { entry: WatchProgressEntry; onPress: () => void }) {
  const { t } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const progress = entry.durationSeconds > 0 ? entry.positionSeconds / entry.durationSeconds : 0;

  return (
      <BouncePressable style={styles.continueCard} onPress={onPress}>
        <View style={styles.continueImageWrap}>
          {entry.imageUrl && !imageFailed ? (
            <CachedImage
              uri={entry.imageUrl}
              style={styles.continueImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.continueImageFallback}>
              <Text style={styles.continueImageFallbackText}>{entry.title.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Text style={styles.playCircleText}>▶</Text>
            </View>
          </View>
          <View style={styles.continueProgressTrack}>
            <View style={[styles.continueProgressFill, { width: `${Math.min(1, progress) * 100}%` }]} />
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {entry.contentType === "episode" && entry.seasonNumber !== null && entry.episodeNumber !== null
            ? `S${entry.seasonNumber} E${entry.episodeNumber} · ${formatRelativeTime(t, entry.updatedAt)}`
            : formatRelativeTime(t, entry.updatedAt)}
        </Text>
      </BouncePressable>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    /* ── the three doors ── */
    /**
     * No horizontal padding of its own.
     *
     * 2026-11-17: it had `paddingHorizontal: Spacing.lg`, and so does the
     * scroll container every row on this screen sits in — so the cards wore
     * 32 of inset against everything else's 16 and read as a narrow column
     * in a wide screen. The design draws them at 18 on a 390 stage, which is
     * what the container alone already gives.
     */
    sectionCards: { paddingTop: Spacing.xs, gap: 13 },
    /**
     * Three across, turned sideways.
     *
     * 2026-11-17: stacked, the cards kept their 112 height and took the whole
     * of a 2400px window — strips seven times wider than they are tall, with
     * only two of them above the fold and the bar sitting over the third. The
     * approved design is drawn for a phone held upright and says nothing about
     * this; a row is what the same three things want when the space is wide
     * and short rather than narrow and tall.
     */
    sectionCardsWide: { flexDirection: "row" },
    sectionCardWide: { flex: 1, height: 132 },
    sectionCard: {
      /* Scopes the logo's multiply to this card. See `artKind`. */
      isolation: "isolate", height: 112, borderRadius: 20, overflow: "hidden", justifyContent: "center" },
    /**
     * 56% of the card, not 205 of it — and not a different figure in
     * landscape either.
     *
     * The design draws 205 on a 366 stage, which is 56% — and as a fixed
     * number it was only ever right at that one width. On a landscape card it
     * became a quarter, so the colour ran out long before the picture started
     * and the soft edge the scrim exists to make turned hard again.
     *
     * 2026-11-18: that 56% is not a taste, it is where the scrim ends. The
     * ramp's alpha holds at 255 to 44% of the width and only then begins to
     * fall — the stops are read off the asset in the gradient note above
     * `SectionCard` — so artwork pinned to the right 56% puts its hard left
     * edge under the last fully opaque column of colour and is never seen to
     * begin, which is the whole trick. Give the art any less and that edge
     * lands inside the fade, where the colour over it is already half gone: a
     * visible seam straight down the card, which is the same seam a fixed 205
     * produces the moment the card is wider than the 366 it was measured on.
     *
     * Yesterday the landscape card was given its own 38% (a `sectionArtWide`)
     * on the grounds that at 132 tall and a third of a screen wide, 56% is a
     * box of about 1.05 aspect that cover-crops most of a 2:3 poster away.
     * That is true, and it is an improvement that cannot be had here: 38%
     * puts the edge at 62% of the width, between the asset's 44% and 66%
     * stops, where its alpha is down to about 140. The crop is a preference,
     * and the same one every rail in the app makes of a poster; the seam is a
     * defect, on a card whose look the owner approved after turning down
     * three others. So the crop stays and the seam goes, and both
     * orientations draw 56%.
     *
     * The words lost nothing in the trade. The 38% was credited with "the
     * room the words needed", and it never gave them any: this View is
     * `position: "absolute"`, so its width has never fed the text column's
     * layout at all. What widened the labels was letting the body out of its
     * own `maxWidth` cap — see `sectionBodyWide`, which does that whole job
     * on its own.
     */
    sectionArt: { position: "absolute", right: 0, top: 0, bottom: 0, width: "56%" },
    /**
     * The same box as a poster, multiplied instead of pasted.
     *
     * White is multiply's identity — every channel multiplied by 1 is the
     * backdrop unchanged — so the logo's baked-on white background simply is
     * not there, and only its ink survives, darkened into the card's own
     * colour. Three other attempts at the same problem (bleeding it, containing
     * it, putting it on a white chip) all ended with a white rectangle on a
     * blue card, which is what the owner kept rejecting.
     *
     * The card sets `isolation: "isolate"` so the blend stops there. Without it
     * the backdrop is whatever happens to be painted below, which on a
     * scrolling screen is not a fixed thing.
     */
    sectionArtLogo: { width: "100%", height: "100%", mixBlendMode: "multiply" },
    sectionArtImage: { width: "100%", height: "100%" },
    /**
     * The explicit width and height are load-bearing, not decoration.
     *
     * 2026-11-17: without them this drew nothing at all. Measured off the
     * device, the pixels under the artwork came back as the raw photo with no
     * tint on them whatsoever, while the bare left of the card was exactly
     * #6D28D9 — the card's own backgroundColor, with no scrim over it. An
     * Image given only left/right/top/bottom lays out, but does not paint;
     * every other absolutely-filled image in this file carries the same pair
     * (featuredImage), which is the clue that found it.
     *
     * No zIndex on any of the three layers, deliberately: child order already
     * gives artwork, then scrim, then title, and an explicit stack here pushed
     * BouncePressable's focus ring underneath the artwork — which costs the
     * television its focus state on the only control on the screen.
     */
    sectionScrim: {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
    },
    /* capped so a long translation cannot run under the artwork — in
       portrait; the landscape card trades that cap away, see `sectionBodyWide` */
    sectionBody: { paddingHorizontal: 18, maxWidth: "62%" },
    /**
     * Three across, so the text column has to give.
     *
     * 2026-11-17: `sectionCardsWide` lays the cards side by side at flex:1,
     * but the body kept the portrait `maxWidth: "62%"` and its 18 of padding
     * on each side while the type stayed at 21 and 12.5. The text column is
     * then 0.62·((W − 32 − 2·13)/3) − 36 — about 130 points on a landscape
     * phone before the left and right safe-area insets take their cut, where
     * the same formula gives about 185 in portrait, 0.62·(W − 32) − 36 on one
     * card instead of a third of one — so `numberOfLines={1}` cut the Arabic
     * default short on both lines ("البث المباشر", "كامل كتالوج الأفلام"), and
     * took French ("Tout le catalogue de films") and Kurmanji ("TV ya Zindî")
     * with it.
     *
     * Not a rotation edge case. The television build is locked to landscape
     * (`orientation: isTV ? "landscape"` in app.config.js), so the wide card
     * *is* the home screen on the TV box — three clipped labels, read from
     * across a room.
     *
     * So the wide card lets the body out of the cap altogether, which is safe
     * because the scrim fades the colour out *over* the artwork rather than
     * ending at it: a long label reaching into that fade is far less wrong
     * than a label with its end chopped off. This is the whole of the
     * landscape fix — the artwork's width was briefly part of it and is not
     * (see `sectionArt`), because an absolutely positioned sibling never
     * bounded this column in the first place.
     *
     * Portrait is untouched — the approved design is drawn for a phone held
     * upright and still gets exactly the 56/62 split it asks for.
     */
    sectionBodyWide: { maxWidth: "100%" },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    sectionTitle: { color: "#FFFFFF", fontSize: 21, fontFamily: FontFamily.bold, ...AndroidTextFix },
    sectionSub: {
      color: "rgba(255,255,255,0.82)",
      fontSize: 12.5,
      marginTop: 6,
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },
  safeArea: { flex: 1 },
  /* paddingBottom is added inline from useTabBarSpace(), which needs the insets. */
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  /**
   * One tight lockup — logo, wordmark and greeting read as a single unit
   * instead of three blocks stacked down the screen with dead space
   * between them. The greeting folds the provider name onto its own line
   * rather than giving it a third orphan row.
   */
  /**
   * The negative insets pull against the scroll view's own 16pt page
   * padding and against the logo artwork's built-in transparent margin —
   * the PNG is a square with the mark floating inside it, so the *visible*
   * logo always sits further in than its box does. Without this the mark
   * looked indented from the edge and the wordmark looked detached from
   * it, even though the box and the text were already adjacent.
   */
  /*
   * No negative margins. The ones that were here pulled a wordmark PNG
   * back into place — that file carried a wide band of transparent padding
   * and had to be dragged out of it. Mooj's mark is a sphere cropped to its
   * own edge, so the same pull dragged a 144pt circle off the top-left
   * corner of the screen and over the status bar.
   */
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  /**
   * The negative vertical margin is against the artwork, not the layout:
   * the PNG is a 499×500 square with the mark floating in the middle, so a
   * 144pt box reserves a band of empty transparent pixels above and below
   * it. Letting the box bleed past the row's height reclaims that band —
   * the visible mark keeps its size, the dead space around it does not
   * push the rest of the screen down.
   */
  logo: { width: 40, height: 40 },
  brandText: { flex: 1, gap: 2, marginEnd: Spacing.sm },
  brandName: {
    color: C.text,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: FontFamily.extraBold,
    /*
     * Loose tracking is a capitals trick: it opens up a word that has no
     * ascenders or descenders to give it shape. A mixed-case wordmark has
     * both, so the same 1.5 simply pulled the letters apart. Half of it,
     * and a point larger to keep the old optical weight.
     */
    letterSpacing: 0.4,
    ...AndroidTextFix,
  },
  welcome: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    ...AndroidTextFix,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.medium },
  /**
   * Its own tinted style rather than the neutral icon button: this ends the
   * session, and looking identical to Search made it easy to hit without
   * noticing.
   */
  /*
   * Quieter than it was. This disconnects the provider — it empties the
   * library, the history and the lineup — and it was drawn as a filled
   * accent circle in the second most prominent position on the screen,
   * which is where a primary action goes, not a destructive one.
   */
  disconnectButton: {
    width: 34,
    height: 34,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectButtonText: { color: C.textMuted, fontSize: 14, fontFamily: FontFamily.medium },



  /**
   * A right-pointing triangle built from borders: zero-size box, a solid
   * start border for the body of the shape and transparent top/bottom
   * borders for its slopes.
   */
  /**
   * Portrait only. Landscape already has narrower cards and shorter rows,
   * so the same figure carries the card there rather than crowding it.
   */

  /**
   * An explicit percentage width per card, not `flexBasis` + `flexGrow`
   * (which only wraps to a given count incidentally, depending on how much
   * space is left after rounding): two per row in portrait, all four on one
   * row in landscape, where the screen is twice as wide and half as tall
   * and a 2×2 block of tall cards ate most of the viewport.
   */
  /**
   * Sized down by roughly a quarter, and most of what went was the empty
   * frame rather than the content: the vertical padding was `xl` on both
   * sides, which put more dead space in the card than icon and label
   * together.
   */
  /** Four across, and shorter: landscape has height to spare nowhere. */

  rail: { gap: Spacing.md, paddingEnd: Spacing.lg },

  continueCard: { width: 150 },
  continueImageWrap: {
    width: 150,
    aspectRatio: 16 / 9,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  continueImage: { width: "100%", height: "100%" },
  continueImageFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceElevated,
  },
  continueImageFallbackText: { color: C.textSecondary, fontSize: 22, fontFamily: FontFamily.bold },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircleText: { color: "#fff", fontSize: 13, marginStart: 2 },
  continueProgressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  continueProgressFill: { height: "100%", backgroundColor: Brand.primary },

  featuredCard: { width: 116 },
  /*
   * A fixed height, not a minimum. Two lines whether the name needs one or
   * two, so every card in a rail ends at the same place — see the note
   * above PosterCard for what a ragged rail looks like.
   *
   * dp, like every height in a stylesheet, and only honest because both
   * Texts that sit in it carry `allowFontScaling={false}`: the two lines
   * inside are then 2 × CARD_TITLE_LINE_HEIGHT in the same unit, at any
   * system font size. See CARD_TITLE_LINE_HEIGHT for the day that cost.
   */
  featuredTitleBox: {
    height: CARD_TITLE_LINE_HEIGHT * CARD_TITLE_LINES,
    marginTop: Spacing.xs,
    paddingHorizontal: 2,
  },
  featuredTitle: {
    color: C.textSecondary,
    fontSize: 10.5,
    lineHeight: CARD_TITLE_LINE_HEIGHT,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  featuredImageWrap: {
    width: 116,
    aspectRatio: 2 / 3,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  featuredImage: { width: "100%", height: "100%" },
  featuredFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    backgroundColor: C.surfaceElevated,
  },
  ratingBadge: {
    position: "absolute",
    top: Spacing.xs,
    end: Spacing.xs,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  ratingBadgeText: { color: "#FFD700", fontSize: 10, fontFamily: FontFamily.bold },

  cardTitle: { color: C.text, fontSize: 12, fontFamily: FontFamily.medium, marginTop: Spacing.xs },
  cardSubtitle: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },
  })
);
