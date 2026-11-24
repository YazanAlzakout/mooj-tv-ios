import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { Focusable } from "@/components/Focusable";

import { CachedImage } from "@/components/CachedImage";
import { forgetImageFailures } from "@/core/media/deadImageHosts";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { TV_RAIL_WIDTH } from "@/components/CategorySidebar";
import { BrowseLayout } from "@/components/TvBrowseLayout";
import { ScreenBackground, TV_OVERSCAN_X } from "@/components/ScreenBackground";
import { useTabBarSpace } from "@/components/MoojTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SECTION_MOVIES } from "@/core/theme/sections";
import { MoviesGlyph } from "@/components/TabIcons";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { CategoryPager } from "@/components/CategoryPager";
import { useI18n } from "@/core/i18n/I18nContext";
import { useCategoryDrag } from "@/core/layout/useCategoryDrag";
import { useCategoryPages } from "@/core/layout/useCategoryPages";
import { LIST_WINDOW, QUIET_LIST_WINDOW } from "@/core/layout/listWindow";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { getHiddenCategoryIds } from "@/db/repositories/categoryVisibilityRepository";
import type { MovieSummary } from "@/domain/vod/types";
import { useGridColumns } from "@/core/layout/useGridColumns";
import { getActiveSession } from "@/state/activeSessionStore";
import { loadMovieCategories } from "@/state/categoryQueries";
import { getVodMovies, loadVodMovies } from "@/state/vodStore";

const ALL_CATEGORY_ID = "all";

/** One empty array for every category with nothing in it, so the list is never handed a new one. */
const NOTHING: never[] = [];
const SEARCH_DEBOUNCE_MS = 200;
/** Portrait density; landscape is decided by `useGridColumns`. */
/*
 * Two, not the three this started with.
 *
 * Three portrait posters across a phone, with the title underneath, is the
 * shape the app this was cloned from uses — and at that size a poster is a
 * thumbnail: you read the title, not the artwork. The rail down the side
 * takes 84dp anyway, so the honest choice was two larger posters with the
 * name written over them. The artwork becomes the thing you browse by,
 * which is the whole point of having it.
 */
const PORTRAIT_COLUMNS = 2;

/*
 * Cell geometry, kept beside the styles that implement it so the two
 * cannot drift apart — `getItemLayout` is only sound while they agree.
 */
const GRID_PADDING = Spacing.md;
const COLUMN_GAP = Spacing.sm;
const CELL_PADDING = Spacing.xs;
const POSTER_RATIO = 3 / 2;
const ROW_GAP = Spacing.md;
/**
 * The title block under every poster, to the pixel.
 *
 * Two lines at a fixed line height plus the gap above them, whether the
 * name uses both or one — `getItemLayout` promises a single row height
 * for the whole catalogue and cannot measure a short name. These numbers
 * and `posterTitleBox` in the styles are one fact written twice.
 */
const TITLE_LINE_HEIGHT = 16;
const TITLE_LINES = 2;
const TITLE_BLOCK = TITLE_LINE_HEIGHT * TITLE_LINES + Spacing.xs;

/**
 * The exact height of one grid row, so the list can place every row
 * without measuring it.
 *
 * Measuring was the other half of the stutter: rows are laid out as they
 * come into view, and because titles could be one line or two the rows had
 * different heights, so the list kept correcting its own content size and
 * scroll offset underneath the finger — which reads as the screen
 * shivering. Uniform rows plus this function remove both the measuring and
 * the corrections.
 */
function rowHeight(listWidth: number, columns: number): number {
  const available = listWidth - GRID_PADDING * 2 - COLUMN_GAP * (columns - 1);
  const posterWidth = available / columns - CELL_PADDING * 2;
  /*
   * Poster, then the title block, then the gap below the row.
   *
   * The name was drawn over the poster for a while, which kept this sum to
   * two terms. It also meant printing a title on top of artwork that
   * already had one — which almost every poster does — and needing a dark
   * wash under the text to make that legible at all. Under the poster the
   * name needs nothing behind it and the artwork is seen whole. The third
   * term is a constant: one line and two lines both occupy TITLE_BLOCK.
   */
  return posterWidth * POSTER_RATIO + TITLE_BLOCK + ROW_GAP;
}

interface CategoryTab {
  id: string;
  name: string;
}

/**
 * Lands directly on the poster grid — categories are a horizontally
 * scrolling tab row filtering the same grid in place, not a separate screen
 * you have to drill through first. Matches how real IPTV players browse;
 * see the identical reasoning in live-categories.tsx.
 */
export default function MoviesCategoriesScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  const theme = useThemeRerender();
  const { t } = useI18n();
  /* The bar floats over the screen, so the screen leaves room for it. */
  const tabBarSpace = useTabBarSpace();
  const session = getActiveSession();
  /*
     * The list's own width, not the window's. The grid sits inside a
     * `SafeAreaView` with every edge enabled, and SDK 57 draws edge to edge,
     * so in landscape a navigation bar or a display cutout makes the list
     * narrower than the screen — and `getItemLayout` would then promise
     * taller rows than are actually drawn.
     */
    const { width: windowWidth } = useWindowDimensions();
  /*
   * Turned sideways the categories move to a strip on top, so nothing
   * takes width off the grid — and `getItemLayout` has to be told, or
   * it promises rows sized for a narrower list than the one drawn.
   */
  const insets = useSafeAreaInsets();
  /*
   * The rail is subtracted on TV: the grid is not the window, and
   * `getItemLayout` below promises a row height derived from this number.
   * See TV_RAIL_WIDTH for what a wrong promise does to a scrolling list.
   *
   * Subtracted unconditionally on the TV build, including the rare case of
   * a provider with one category where no rail renders. Erring this way
   * under-states the row height, which costs a little extra rendering;
   * erring the other way puts holes in the list.
   */
  /*
    `TV_OVERSCAN_X` is part of this sum because `ScreenBackground` pads the
    whole screen on the television and neither `useWindowDimensions` nor
    `useSafeAreaInsets` reports that padding. Leaving it out overstated the
    row height by the width of two 96dp margins spread across the columns.
  */
  /*
   * Declared up here because the grid's width depends on it.
   *
   * `phoneRail` used to be taken off the width in every portrait render,
   * on the assumption that portrait always draws a rail. BrowseLayout's
   * rule is narrower than that: it draws one only when there is more than
   * one category to choose between. Where there is not — a provider that
   * returns no categories, or a viewer who has hidden all of them in
   * settings, leaving the single All chip — the list is the full window
   * wide while `getItemLayout` is still promising rows sized for a list
   * 84dp narrower. That is a 23% understatement, FlatList never measures a
   * row to catch it, and the error compounds with every row scrolled until
   * cells are placed a screen away from where they are drawn.
   *
   * So the condition here is the same condition BrowseLayout uses, on the
   * same array it is handed. The two must not be able to disagree.
   */
  const [movies, setMovies] = useState<MovieSummary[] | null>(() => getVodMovies());
  const [builtForProvider, setBuiltForProvider] = useState<string | null>(session?.provider.id ?? null);
  const [categories, setCategories] = useState<CategoryTab[] | null>(null);
  const gridWidth =
    windowWidth - insets.left - insets.right - TV_OVERSCAN_X -
    /*
     * Only the television's rail takes width now. 2026-11-17 the phone moved
     * from a right-hand rail to a chip strip above the grid, and a strip costs
     * height, not width — leaving the subtraction in declared the grid
     * narrower than it draws, and `getItemLayout` believes that number
     * absolutely. That is the same mistake that put black bands down the
     * channel list before (see CategorySidebar).
     */
    (isTvBuild ? TV_RAIL_WIDTH : 0);
  /*
   * Width first, then the column count, then the row height — in that
   * order and not the other way round. The count is worked out FROM the
   * row height a given count would produce (see useGridColumns), and the
   * row height needs the grid's width, which does not depend on the
   * count. No cycle, but the declaration order has to say so.
   */
  const columns = useGridColumns(PORTRAIT_COLUMNS, (c) => rowHeight(gridWidth, c));
  const gridRowHeight = rowHeight(gridWidth, columns);
  const [chosenCategoryId, setActiveCategoryId] = useState<string>(ALL_CATEGORY_ID);
  /**
   * The category actually being shown, which is not always the one chosen.
   *
   * A chosen id can stop existing: it is dropped when the viewer hides that
   * category, when the provider stops listing it, or when its last channel
   * goes — and on Live TV it is remembered across launches, so it can
   * arrive already stale. Nothing used to reconcile the two, and the three
   * things that read it then disagreed: the header counted nought, the
   * grid fell back to "All" through the pager's own clamp, and the strip
   * filled in no chip at all, because none of them matched. The viewer saw
   * "0 channels" written over a full lineup with nothing highlighted, and
   * only tapping a chip got out of it.
   *
   * Derived rather than corrected in an effect: an effect that calls
   * `setState` on a render is a cascade this project's lint rules reject,
   * and there is nothing to correct anyway — what is shown *is* a function
   * of the chosen id and the list that exists.
   */
  const activeCategoryId = useMemo(() => {
    const strip = categories ?? [];
    if (strip.length === 0) return chosenCategoryId;
    return strip.some((c) => c.id === chosenCategoryId) ? chosenCategoryId : strip[0].id;
  }, [categories, chosenCategoryId]);
  /*
    Where the viewer was in each category, and the order a sideways drag
    steps through. Both read the same list the chip strip is built from,
    so the gesture and the strip can never disagree about what comes next.
  */
  const categoryIds = useMemo(() => (categories ?? []).map((c) => c.id), [categories]);
  /* Handed to both the strip and the drag surface, so the chips travel with the finger. */
  const categoryDrag = useCategoryDrag();
  /**
   * The provider this screen has already picked an opening category for.
   *
   * A boolean until today, and a boolean can only be raised once per mount.
   * Connecting a different provider does not unmount this tab — `handleSelect`
   * on the providers screen calls `router.dismissAll()` and then
   * `router.replace("/home")`, and neither takes down a navigator that is
   * already up, which is the same fact the provider-switch block below is
   * built on. So the latch stayed raised across the switch, the branch in
   * `load()` never fired again, and Movies opened on "All" for the rest of
   * the app's life: the new account's entire catalogue, ~20k titles in one
   * list, which is the one default that branch exists to avoid
   * (found 2026-11-17).
   *
   * Holding the id rather than a flag lowers the latch on exactly the event
   * that should lower it, and still refuses to yank the viewer back to the
   * first category on a plain refresh of the same account.
   *
   * Written only inside `load()`, never during render: a `ref.current = …`
   * in the component body is what `react-hooks/refs` rejects, so the
   * provider-switch block below deliberately leaves this one alone and the
   * id comparison in `load()` does the work instead.
   */
  const categoryAppliedRef = useRef<string | null>(null);
  /**
   * Latched once the grid has taken focus, so `hasTVPreferredFocus` is a
   * one-shot request rather than something that re-fires and steals focus
   * back from the tabs or the search field. See the note in this file's
   * grid cell.
   */
  const tvFocusClaimedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  /*
    Where the viewer was in each category — declared here, below the
    search term, because the term is part of its key. A pixel offset
    belongs to the shape that produced it: the column count, which
    changes when the phone is turned, and the search, which changes what
    is in the list at all. Give it a different shape and it reports no
    remembered position rather than a wrong one, and the list opens at
    the top.
  */
  /*
    One position per category, kept for the screen rather than for a list:
    three lists are mounted at once now, and a page keeps its place even
    after the window has moved past it and unmounted it.
  */
  /**
   * Forget everything the moment the account underneath changes.
   *
   * A tab screen is mounted once and kept. Connecting a different provider
   * does not take it down: `handleSelect` on the providers screen calls
   * `router.dismissAll()` and `router.replace("/home")`, and neither
   * unmounts a navigator that is already up. So the film list — read once, at
   * mount, from a store that `setActiveSession` has since emptied — would
   * still be the previous provider's, and this screen would draw account
   * A's catalogue while connected to account B. The focus effect below
   * does reload, but it is asynchronous: the stale frame is painted first,
   * and a card tapped in that frame opens an id belonging to the other
   * line.
   *
   * Checked during render rather than in an effect, which is the whole
   * point — React applies the reset before this render commits, so the
   * wrong data is never painted at all. It is the pattern the React
   * documentation calls adjusting state when a prop changes, and the one
   * `usePlaybackTracks` already uses to stop an old channel's audio
   * tracks appearing on a new one.
   *
   * It costs a string comparison per render and fires on nothing else: the
   * id only differs on a genuine switch.
   */
  if (builtForProvider !== (session?.provider.id ?? null)) {
    setBuiltForProvider(session?.provider.id ?? null);
    setMovies(getVodMovies());
    setCategories(null);
    setActiveCategoryId(ALL_CATEGORY_ID);
    setSearchInput("");
    setSearch("");
    setErrorMessage(null);
  }

  const pages = useCategoryPages<MovieSummary>({ shape: search, columns, rowHeight: gridRowHeight });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The provider whose catalogue this screen is actually holding, or null
   * when it is holding none.
   *
   * A boolean until today, and it is the same change `categoryAppliedRef`
   * above was given yesterday for the same reason: a flag raised on the first
   * successful load can only ever be raised once, and nothing lowered it when
   * the account underneath changed. The provider-switch block above cannot
   * lower it either — a `ref.current = …` in the component body is what
   * `react-hooks/refs` rejects — so provider A's success was carried straight
   * into provider B's first load.
   *
   * What that cost: connect B, `setActiveSession` empties both VOD stores,
   * the reset above sets `movies` to a now-null `getVodMovies()`, the focus
   * effect calls `load()`, and `loadVodMovies` meets one of this line's
   * intermittent 404s (docs/DECISIONS.md). The catch below asks "is there a
   * catalogue on screen to fall back on?"; the flag answered yes on A's
   * behalf, so no message was set and the error was swallowed. The render
   * then took the `movies === null` branch, which draws a spinner and
   * nothing else — no banner, no Retry, no list to pull, and no header ⟳
   * because that control is television-only. A spinner turning for ever over
   * an empty screen, with no way out but leaving the tab
   * (found 2026-11-18).
   *
   * Holding the id answers the question the catch is really asking, and it
   * cannot go stale: after a switch it names the previous provider, which is
   * not `session.provider.id`, so the first load on the new account is
   * treated as a first load — while a plain refresh of the same account is
   * still not.
   */
  const hasDataForProviderRef = useRef<string | null>(null);

  const load = useCallback(
    /*
     * `surfaceFailure` is for the caller that has a face to pull: only
     * `handleRefresh` passes it. The focus effect's bare `load()` has to
     * stay a promise that cannot reject, or every focus of this tab on a
     * flaky line is an unhandled rejection.
     */
    async (forceRefresh = false, surfaceFailure = false) => {
      if (!session) return;
      try {
        const cached = getVodMovies();
        const list = cached && !forceRefresh ? cached : await loadVodMovies(session.config, { forceRefresh });
        setMovies(list);

        const [raw, hidden] = await Promise.all([loadMovieCategories(session.provider.id, session.config), getHiddenCategoryIds("movie")]);
        const presentIds = new Set(list.map((m) => m.categoryId));
        const nonEmpty = raw.filter((c) => presentIds.has(c.id) && !hidden.has(c.id));
        const tabs = [{ id: ALL_CATEGORY_ID, name: t("liveCategories", "allCategory") }, ...nonEmpty];
        setCategories(tabs);
        /*
         * Open on the first real category, not "All" — the same default
         * Live TV uses. "All" here means the provider's entire catalogue
         * in one list, which is not a view anyone browses on purpose; it
         * is a filter you reach for, so it stays available as the first
         * tab rather than being where the screen starts.
         */
        if (categoryAppliedRef.current !== session.provider.id && tabs.length > 1) {
          categoryAppliedRef.current = session.provider.id;
          setActiveCategoryId(tabs[1].id);
        }
        setErrorMessage(null);
        hasDataForProviderRef.current = session.provider.id;
      } catch (error) {
        /*
         * A first load that fails owns the screen — a first load on *this*
         * provider, which is what the ref holds an id for. It has the
         * specific sentence — `toUserFacingMessage` turns this provider's
         * bare "HTTP 404 from http://…" into something a viewer can read —
         * and the Retry button under it, so it must not be overwritten a
         * moment later by the shorter "couldn't refresh" line. Hence a return
         * rather than falling through to the throw.
         */
        if (hasDataForProviderRef.current !== session.provider.id) {
          setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
          return;
        }
        /*
         * Otherwise the grid is already holding a catalogue and keeps it — a
         * failed refresh must never blank what is on screen — so nothing is
         * painted from here. But the caller has to be told, and swallowing
         * it unconditionally was the bug: a pull that failed retracted the
         * spinner and changed nothing at all, so the viewer could not tell a
         * provider with no new titles from one that never answered
         * (found 2026-11-17).
         */
        if (surfaceFailure) throw error;
      }
    },
    [session, t]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  /**
   * A failed refresh must never destroy what is already on screen — and must
   * never pass in silence either.
   *
   * The await used to be bare. `load()` swallowed its own failure once the
   * grid was holding a catalogue, the spinner retracted and nothing on screen
   * changed, so a provider with no new titles and a provider that never
   * answered looked exactly alike (found 2026-11-17). The second argument is
   * what lets a refused refresh reach the catch below; the catalogue itself
   * is untouched either way.
   */
  async function handleRefresh() {
    /*
      A pull is the viewer saying "try again", and artwork is the part of the
      screen they can see has failed. Without this the only cure for a tile
      that went blank on a bad connection was killing the app.
    */
    forgetImageFailures();
    setRefreshing(true);
    try {
      await load(true, true);
      /* Nothing to clear here: load() sets the banner to null when it gets through. */
    } catch {
      /*
       * Short and plain, not the raw HTTP line: this provider's Cloudflare
       * edge 404s intermittently on requests that succeed moments later
       * (docs/DECISIONS.md), so the honest sentence is "couldn't refresh, try
       * again". Same string and same reasoning as live-categories' own
       * `handleRefresh`, which is where this screen should have been already.
       */
      setErrorMessage(t("common", "refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * The titles of one category, for any category — not only the current one.
   *
   * `CategoryPager` keeps the page either side of this one mounted, so the
   * filtering can no longer be a value derived from `activeCategoryId`: it
   * has to answer for whichever three categories are on screen at once.
   */
  /*
    **Every category grouped once, rather than filtered three times.**

    Three pages ask for their items on every render, and the obvious shape
    — a function that filters on demand — is three scans of the whole
    catalogue each time, with a `toLowerCase` allocation per item. One
    pass that buckets everything costs the same as a single one of those
    scans and answers every category, including the ones the pager has not
    reached yet.

    A cache behind a closure was the first attempt and is not allowed here:
    `react-hooks/immutability` forbids mutating a local after render, and
    the mutation in that shape happens when a page calls the closure. This
    builds its map during the render that creates it, which is exactly what
    the rule is asking for, and is the better algorithm anyway.
  */
  const byCategory = useMemo(() => {
    const grouped = new Map<string, MovieSummary[]>();
    if (!movies) return grouped;
    const pool = search
      ? movies.filter((m) => m.name.toLowerCase().includes(search))
      : movies;
    grouped.set(ALL_CATEGORY_ID, pool);
    for (const item of pool) {
      /* The provider leaves this null on some rows; those live in "All" only. */
      const key = item.categoryId;
      if (key === null) continue;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
      else grouped.set(key, [item]);
    }
    return grouped;
  }, [movies, search]);

  const itemsFor = useCallback(
    (categoryId: string) => byCategory.get(categoryId) ?? NOTHING,
    [byCategory]
  );

  /** Only for the count in the header, which is about the category being looked at. */
  const filteredMovies = useMemo(() => itemsFor(activeCategoryId), [itemsFor, activeCategoryId]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  /*
    Stable on purpose, and the memo below is worthless without it.

    A `FlatList` builds a new render closure on every render of itself, and
    with `numColumns` above one it also hands each row a freshly allocated
    array. `CellRenderer` is a `PureComponent`, so both of those already
    fail reference equality — which is why every mounted cell re-rendered on
    every list render. A fast fling makes that happen inside the scroll
    handler itself, once per frame, which is the difference between the
    three per cent this list measures on a slow scroll and the twenty-two
    it measures on a fling.

    The cell can only bail out if what it is handed is identical, so the
    callbacks take the item rather than closing over it.
  */
  const openMovie = useCallback((movie: MovieSummary) => {
    router.push({ pathname: "/movies/details/[movieId]", params: { movieId: movie.providerItemId } });
  }, []);

  const claimTvFocus = useCallback(() => {
    tvFocusClaimedRef.current = true;
  }, []);
  if (!session) {
    return null;
  }


  return (
    <ScreenBackground>
      {/* No bottom edge, and that is what lets the bar's scoop show content.
          The capsule floats over this screen rather than sitting below it, so
          the screen has to run all the way down and pass under it; a bottom
          inset here would stop the content short and put the page colour back
          in the gap. The room the capsule needs comes from useTabBarSpace()
          as padding inside the scroller instead. */}
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      {/*
        Television only. On a phone this said the same word the tab under
        it already says, and spent a title row, a count row and their
        padding doing it — about 150dp of the screen before the first
        poster. The count moved beside the search field, which is the one
        place it is actually useful: it answers how much is left after
        what you just typed.
      */}
      {isTvBuild && (
        <ScreenHeader
          title={t("moviesCategories", "title")}
          showBack={false}
          badge={{ colour: SECTION_MOVIES, glyph: <MoviesGlyph color="#FFFFFF" size={20} /> }}
          subtitle={`${t("home", "moviesSub")} · ${filteredMovies.length.toLocaleString()} ${t("moviesGrid", "moviesCountSuffix")}`}
          /*
            The television's only way to reload the catalogue. Every other
            refresh path in the app is a pull gesture, which a remote cannot
            perform — so a provider adding titles was invisible until the
            provider was removed and re-added. `isTvBuild`-gated, so the
            phone header is unchanged and keeps the pull.
          */
          right={
            isTvBuild ? (
              <Focusable
                onPress={handleRefresh}
                disabled={refreshing}
                style={styles.tvHeaderButton}
                round
                hitSlop={10}
              >
                <Text style={styles.tvHeaderGlyph}>{refreshing ? "⋯" : "⟳"}</Text>
              </Focusable>
            ) : undefined
          }
        />
      )}

      {/*
        Phone only. On a television these two are replaced by the
        category rail below: a horizontal strip costs one press per
        category and fights the grid for Up and Down, and a `TextInput`
        on the main vertical path opens the on-screen keyboard the
        moment the D-pad passes through it and swallows every key until
        Back. Same arrangement as Live TV — see TvBrowseLayout.
      */}
      {isTvBuild ? null : (
        <>
          {/*
            The same strip Live TV uses, not a second copy of it.

            This screen carried its own inline `FlatList` with its own pill
            styles, and the two had drifted: 44pt tall chips at 13pt text
            here against 30pt at 12pt there, so Movies and Series read as a
            heavier interface than Channels for no reason
            (reported 2026-09-16). The shared component already carries
            every fix this one did — `minHeight` rather than a fixed
            height, an explicit `lineHeight`, `AndroidTextFix` and a
            `maxWidth` — which is what a mixed Arabic/Latin category name
            needs in order not to be clipped.
          */}

          <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder={t("moviesGrid", "searchPlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={searchInput}
            onChangeText={setSearchInput}
          />
          <Text style={styles.searchCount}>{filteredMovies.length.toLocaleString()}</Text>
          </View>
        </>
      )}

      <BrowseLayout
        categories={categories}
        activeId={activeCategoryId}
        onSelect={setActiveCategoryId}
        progress={categoryDrag}
      >
    {errorMessage && (
      <View style={styles.errorBlock}>
        <Text style={styles.error}>{errorMessage}</Text>
        {/*
          A first load that fails used to leave the spinner turning under
          this line for ever: the list state stayed null, so the FlatList —
          and with it pull-to-refresh — never rendered, and the only way
          out was to leave the screen and come back.
        */}
        {/*
          `handleRefresh`, not `load()`. Retry now answers two different
          failures — a first load that never arrived, and a refresh that was
          refused — and `load()` on its own only ever re-reads what is already
          stored: `getVodMovies()` returns the cached list and
          `loadMovieCategories` reads the catalog cache. After a failed
          refresh that button would therefore clear its own banner without one
          request leaving the device, which reads as "refreshed" and is not.
          `handleRefresh` forces the fetch, and leaves the banner up when the
          retry genuinely fails.

          Disabled while it runs, and saying so — the half that was left out
          yesterday. In a cold failure this button is the only thing on
          screen: `movies` is null, so no grid and no `RefreshControl` spinner
          is mounted to show that anything is happening, and a second press
          would open a second full catalogue fetch — `forceRefresh`, the whole
          ~20k-title list — on a line that answers a burst with empty 404s
          (docs/DECISIONS.md). Same shape and same strings as
          live-categories' Retry.
        */}
        <BouncePressable
          style={[styles.retryButton, refreshing && styles.retryButtonBusy]}
          disabled={refreshing}
          onPress={handleRefresh}
        >
          <Text style={styles.retryButtonText}>
            {refreshing ? t("common", "loading") : t("common", "retry")}
          </Text>
        </BouncePressable>
      </View>
    )}

    {movies === null ? (
      <View style={styles.centered}>
        {/* No spinner once a load has already failed — the retry button above is the way forward. */}
        {!errorMessage && <ActivityIndicator color={Brand.primary} />}
      </View>
    ) : (
      /*
        The category either side of this one is mounted and just off the
        edge, so a sideways drag reveals it coming in rather than swapping
        the content once the finger lifts. On the television it collapses to
        the single list it has always been — see `single`.
      */
      <CategoryPager
        ids={categoryIds}
        activeId={activeCategoryId}
        onSelect={setActiveCategoryId}
        enabled={!isTvBuild}
        single={isTvBuild}
        progress={categoryDrag}
        renderPage={(pageCategoryId, pageActive) => {
          /*
            Each page answers for itself. An empty state cannot be a
            screen-level branch once three categories are mounted at once:
            one of them having nothing in it is not a reason to blank the two
            either side. Movies had no empty state at all until yesterday — a
            search that matched nothing painted a blank area under the chip
            strip, with no glyph, no sentence and nothing to say the search
            was the cause (found 2026-11-17).

            It lives in `ListEmptyComponent` rather than in a branch that
            returns *instead of* the list, which is the shape it was given
            yesterday. Returning instead of the list takes the
            `RefreshControl` down with it, and
            on a phone that pull is the only way to reload this screen — the
            header, and with it the ⟳ button, is television-only. So a
            provider whose film catalogue came back empty (an expired
            account, or a line answering `get_vod_streams` with `[]`) drew
            "no films" with nothing to pull and no button under it, and the
            only cure was leaving the tab and coming back: the same dead end
            the Retry button above exists to prevent (found 2026-11-18). A
            list with no rows in it still keeps its scroller, so the pull
            survives.
          */
          const pageMovies = itemsFor(pageCategoryId);
          const pageEmpty = pageMovies.length === 0;
          const emptyState = (
              <View style={styles.centered}>
                <Text style={styles.emptyGlyph}>▤</Text>
                {/*
                  Which of the two sentences is honest depends on why the page
                  is empty. A typo in the search box used to fall through to
                  the catalogue-is-empty line on a screen holding the
                  provider's whole catalogue, which reads as an expired
                  account rather than as a typo.

                  The gate is the debounced term, not the one in the box: this
                  sentence has to agree with the grid under it, and the box
                  runs SEARCH_DEBOUNCE_MS ahead of the list. Read the box
                  instead and the keystroke that clears the field prints:
                  No results for "". It is also why the query is printed
                  lower-cased — `search` is what actually filtered the list,
                  and a sentence that quotes something the list did not use
                  would be a second small lie.

                  The sentence is `moviesGrid.noMoviesAvailable`, worded from
                  `liveChannelList.noChannelsAvailable` so that the three
                  browse screens answer an empty grid the same way. It
                  borrowed `library.nothingHereYet` ("Nothing here yet.")
                  while the key was being added: true, but silent about
                  what is missing, on the screen whose whole subject is movies.
                */}
                <Text style={styles.emptyText}>
                  {search
                    ? t("search", "noResultsFor", { query: search })
                    : t("moviesGrid", "noMoviesAvailable")}
                </Text>
              </View>
          );
          return (
      <FlatList
        ref={pages(pageCategoryId).listRef}
        {...pages(pageCategoryId).scroll}
        data={pageMovies}
        keyExtractor={(item) => item.providerItemId}
        /*
          The theme is in this key, and it has to be.
          `useThemeRerender` above re-renders the screen, and the screen
          re-reads its stylesheet — but every cell in this list is
          `memo`'d on props that a theme change does not touch, so the
          cells bail out and keep the palette they were built with. On a
          light page that left the artwork tiles painted #12121A, the dark
          theme's surface, which is measurable in a screenshot and was.

          A theme flip is a fair moment to rebuild a list: it is rare, and
          `useCategoryPages` puts the scroll position back because the
          `shape` it keys on has not changed.
        */
        key={`${columns}|${theme}`}
        numColumns={columns}
        /*
          `gridEmpty` only when there are no rows, and it is what makes the
          empty state sit in the middle of the screen rather than in a
          zero-height box at the top: `styles.centered` is `flex: 1`, and a
          scroller's content container is sized by its children unless it is
          told to grow. See the empty state above for why it is mounted
          inside the list at all.
        */
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: Spacing.xl + tabBarSpace },
          pageEmpty && styles.gridEmpty,
        ]}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        /*
          The first tap after typing used to be eaten by the keyboard.

          A FlatList is a ScrollView, and React Native's default
          `keyboardShouldPersistTaps="never"` lets it take the first touch
          while the soft keyboard is up: the keyboard closed, the film did not
          open, and only the second tap reached the poster. The chips above
          answered first time, because `CategoryTabs` was given this prop
          yesterday and this grid was not — which made the grid the one dead
          surface on the screen, worse than the uniform old behaviour.
          `"handled"` passes the touch to a child that handles it and still
          dismisses the keyboard on a tap that lands on nothing. `search.tsx`
          has carried it for the same arrangement since it was written.
          Found 2026-11-18.
        */
        keyboardShouldPersistTaps="handled"
        refreshControl={
          /* See the header button — a pull cannot happen on a television. */
          isTvBuild ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Brand.primary} />
          )
        }
        ListEmptyComponent={emptyState}
        renderItem={({ item, index }) => (
          <MoviePoster
            movie={item}
            columns={columns}
            artwork={pageActive}
            tvFocusFirst={index === 0 && !tvFocusClaimedRef.current}
            onTvFocus={claimTvFocus}
            onPress={openMovie}
          />
        )}
        getItemLayout={(_, index) => ({
          length: gridRowHeight,
          offset: gridRowHeight * index,
          index,
        })}
        {...(pageActive ? LIST_WINDOW : QUIET_LIST_WINDOW)}
      />
          );
        }}
      />
    )}
      </BrowseLayout>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * Plain `Pressable`, no `entering` animation — see the note on
 * `ChannelRow` in live-categories.tsx: this grid holds the provider's whole
 * catalogue (~20k titles), and per-cell entrance animations plus per-cell
 * Reanimated values re-fire on every recycle during scroll, which is what
 * made scrolling stutter.
 */
/*
  Memoised. See `openMovie` for why, and for why this is only worth
  anything together with the stable callbacks above.

  `memo(function …)` rather than an arrow: `react/display-name` requires a
  named function here.
*/
const MoviePoster = memo(function MoviePoster({
  movie,
  columns,
  artwork,
  tvFocusFirst,
  onTvFocus,
  onPress,
}: {
  movie: MovieSummary;
  columns: number;
  /**
   * Whether this page may fetch its poster.
   *
   * False for the two pages either side of the one being looked at. They are
   * mounted so a drag can reveal them, which means they would otherwise all
   * fetch at once — three screens of artwork for a provider that answers a
   * burst with empty 404s on every endpoint, two of those screens for nobody.
   * The skeleton underneath already carries the name, so holding the image
   * back reads as a card that has not loaded yet rather than as a hole.
   */
  artwork: boolean;
  /** Exactly one cell per screen sets this — where a TV remote starts. */
  tvFocusFirst: boolean;
  /** Latches the screen's one-shot focus request — see `tvFocusClaimedRef`. */
  onTvFocus: () => void;
  onPress: (movie: MovieSummary) => void;
}) {
  /*
    One closure for the life of this cell, rather than a new one handed
    down on every render of the list. That is what lets the memo bail.
  */
  const press = useCallback(() => onPress(movie), [onPress, movie]);
  return (
    <View style={[styles.posterCell, { flex: 1 / columns, maxWidth: `${100 / columns}%` }]}>
    <Focusable onPress={press} style={styles.posterWrap} hasTVPreferredFocus={tvFocusFirst} onFocus={onTvFocus}>
      <View style={styles.posterImageWrap}>
        {/*
          A plain tile behind the poster, with no text in it.

          It used to carry the name, because the name was drawn over the
          artwork and a card whose poster was missing would otherwise have
          been a blank box. The name sits under the card now, so a tile
          that still printed it would print it twice — once large and grey
          in the middle, once small underneath. The same duplication the
          home screen's fallback had, for the same reason, fixed the same
          way.

          Still rendered *behind* the poster rather than switched in and
          out by a `loaded` flag: the poster paints over it once it
          decodes, which is the same result without a state update and a
          re-render per cell arriving in the middle of a scroll.
        */}
        <View style={styles.posterSkeleton} />
        {movie.posterUrl && artwork && (
          <CachedImage uri={movie.posterUrl} style={styles.posterImage} resizeMode="cover" />
        )}
        {movie.rating !== null && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingBadgeText}>★ {movie.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      {/*
        Under the poster, not on it.

        Printing a title over artwork that already carries one gives two
        titles in the same place in two typefaces, which is what a
        screenshot of the catalogue on 2026-11-08 showed on most cards.
        Moving it down also retires the wash that was only ever there to
        make white text readable over a picture.
      */}
      <View style={styles.posterTitleBox}>
        <Text style={styles.posterTitle} numberOfLines={TITLE_LINES}>
          {movie.name}
        </Text>
      </View>
    </Focusable>
    </View>
  );
});

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  /* Television only — see the header's `right` slot. */
  tvHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tvHeaderGlyph: { color: C.text, fontSize: 20, fontFamily: FontFamily.bold },

  safeArea: { flex: 1 },
  /* The gap is for the empty state's glyph over its sentence; the loading
     spinner that also uses this style is a single child and never sees it. */
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  /* Centred and inset, unlike live-categories' copy, because this one can
     carry a query the viewer typed and that query can wrap. */
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },

  /**
   * Fixed height with vertically centred content, and an explicit
   * lineHeight on the label. Noto Kufi Arabic (this app's only font) has
   * much taller ascender/descender metrics than a Latin face at the same
   * `fontSize`, and Android was clipping the top and bottom of Arabic
   * category names inside a padding-only chip. Sizing the chip and the
   * line box explicitly — rather than letting them fall out of the font
   * metrics — makes the strip render identically for Arabic and Latin
   * names. `maxWidth` keeps a very long category name from taking the
   * whole strip.
   */
  /**
   * `minHeight` + `paddingVertical`, not a fixed `height`: a mixed
   * Arabic/Latin category name (e.g. "NETFLIX VOD - نتفلكس") was still
   * getting visually cut at the top of the pill even after the
   * `includeFontPadding`/`lineHeight` fixes above — its line box measures
   * taller than the plain-Arabic tabs next to it, mixing two scripts'
   * font metrics on one line. A fixed height can only ever clip that
   * overflow; `minHeight` lets the pill grow to whatever the content
   * actually needs instead, which makes this a structural fix rather than
   * another guessed number.
   */
  /**
   * A solid fill, not a tinted background + border. The active tab used to
   * be `primaryMuted` (a near-invisible 15%-opacity red) plus a 1px red
   * outline carrying the entire "this is selected" signal on its own — and
   * a hairline stroke on a fully-rounded pill is exactly the shape Android
   * anti-aliases inconsistently at the curve's tightest points, which
   * looked like a broken/incomplete ring around "All" (reported
   * 2026-09-03). A solid fill can't show that kind of gap: there's no
   * stroke to break, the whole shape is one filled region.
   */

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  searchCount: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  search: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    color: C.text,
    fontSize: 14,
    fontFamily: FontFamily.regular,
  },

  errorBlock: { alignItems: "center", gap: Spacing.sm, marginTop: Spacing.md },
  retryButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
  },
  /* Dimmed while the refresh it started is still running — see the call site. */
  retryButtonBusy: { opacity: 0.6 },
  retryButtonText: {
    color: C.onAccent,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  error: {
    color: C.error,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  /* paddingBottom is added inline from useTabBarSpace(), which needs the insets. */
  grid: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  /*
   * Added only on a page with no rows, so `ListEmptyComponent` has a full
   * screen to centre itself in. `flexGrow`, not `flex`, so it cannot cap the
   * content height of a list that does have rows if it is ever applied
   * unconditionally by mistake.
   */
  gridEmpty: { flexGrow: 1 },
  gridRow: { gap: Spacing.sm, marginBottom: Spacing.md },

  posterCell: { paddingHorizontal: Spacing.xs },
  posterWrap: { flex: 1 },
  posterImageWrap: {
    aspectRatio: 2 / 3,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  posterImage: { width: "100%", height: "100%" },
  posterSkeleton: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
  },
  posterFallbackText: {
    color: C.textSecondary,
    fontSize: 11,
    fontFamily: FontFamily.medium,
    textAlign: "center",
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
  /**
   * A fixed box for the title, which is what makes every row exactly
   * `rowHeight()` tall and `getItemLayout` correct.
   *
   * It is sized off an explicit `lineHeight` with room to spare — two
   * lines of 15 in a box of 32 — rather than tight to the text. Noto Kufi
   * measures a taller line box for a mixed Arabic/Latin title than for a
   * plain-Arabic one, and a box sized exactly to the nominal height clips
   * the taller case; that has bitten this project three separate times.
   */
  /*
   * Over the poster now, not under it. No height and no margin: the box is
   * pinned to the bottom edge of the artwork, so a one-line title and a
   * two-line title occupy the same row — which is what lets getItemLayout
   * promise one height for every row in the list.
   */
  /* Fixed height, not a minimum — see TITLE_BLOCK. */
  posterTitleBox: {
    height: TITLE_LINE_HEIGHT * TITLE_LINES,
    marginTop: Spacing.xs,
    paddingHorizontal: 2,
  },
  posterTitle: {
    /* On the page now rather than on artwork, so it takes the page's ink. */
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: TITLE_LINE_HEIGHT,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  })
);
