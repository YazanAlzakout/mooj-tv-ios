import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { BouncePressable } from "@/components/BouncePressable";
import { TV_RAIL_WIDTH } from "@/components/CategorySidebar";
import { BrowseLayout } from "@/components/TvBrowseLayout";
import { CachedImage } from "@/components/CachedImage";
import { Focusable } from "@/components/Focusable";
import { ScreenBackground, TV_OVERSCAN_X } from "@/components/ScreenBackground";
import { useTabBarSpace } from "@/components/MoojTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SECTION_LIVE } from "@/core/theme/sections";
import { LiveGlyph } from "@/components/TabIcons";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { CategoryPager } from "@/components/CategoryPager";
import { useI18n } from "@/core/i18n/I18nContext";
import { useCategoryDrag } from "@/core/layout/useCategoryDrag";
import { useCategoryPages } from "@/core/layout/useCategoryPages";
import { LIST_WINDOW, QUIET_LIST_WINDOW } from "@/core/layout/listWindow";
import { artworkIsKnownBad, forgetImageFailures, noteImageFailed } from "@/core/media/deadImageHosts";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { AndroidTextFix, ArtworkTile, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { getHiddenCategoryIds } from "@/db/repositories/categoryVisibilityRepository";
import { getLiveTvState, setLastCategoryId } from "@/db/repositories/liveTvStateRepository";
import type { LiveChannel } from "@/domain/provider/types";
import { useGridColumns } from "@/core/layout/useGridColumns";
import { getActiveSession } from "@/state/activeSessionStore";
import { loadLiveCategories } from "@/state/categoryQueries";
import { refreshActiveSessionChannels } from "@/state/sessionRestore";
import { getLibraryItems, toggleLibraryItem } from "@/db/repositories/libraryRepository";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const ALL_CATEGORY_ID = "all";

/** One empty array for every category with nothing in it, so the list is never handed a new one. */
const NOTHING: never[] = [];

/*
 * Cell geometry, kept beside the styles that implement it — `getItemLayout`
 * is only sound while the two agree.
 */
const GRID_PADDING = Spacing.md;
const COLUMN_GAP = Spacing.sm;
const CELL_PADDING = Spacing.xs;
/*
 * Back to very nearly square, after 16:10 was tried and was wrong.
 *
 * The reasoning for the wide card was that a channel logo is a wide mark.
 * On the real lineup it is not: the logos are square or taller, most on a
 * white ground, and `contain` inside a 16:10 frame fitted them by height
 * and left two thirds of every card empty. Twelve cards of mostly nothing.
 *
 * This is the one claim in the redesign that was made about the content
 * without looking at it, and it is the one that was wrong.
 */
const ART_RATIO = 1 / 1.15;
const ROW_GAP = Spacing.sm;
/*
 * The name block under the artwork, to the pixel.
 *
 * Two lines at a fixed line height plus the gap above them, whether the
 * name uses both lines or one — `getItemLayout` promises a single row
 * height for the whole lineup and has no way to measure a short name.
 * These are the numbers `cardNameBox` and `cardName` are built from;
 * changing one without the other is the bug this file has had once.
 */
const NAME_LINE_HEIGHT = 16;
const NAME_LINES = 2;
const NAME_BLOCK = NAME_LINE_HEIGHT * NAME_LINES + Spacing.xs;

/**
 * The exact height of one grid row.
 *
 * This is the largest list in the app — the "All" tab is the provider's
 * entire lineup — and it was the last one still measuring every cell as it
 * scrolled past. Rows also varied by a line of text, which is the same
 * content-size correction under the finger that made the movie grid shiver
 * before it was given a fixed row height.
 */
function rowHeight(listWidth: number, columns: number): number {
  const available = listWidth - GRID_PADDING * 2 - COLUMN_GAP * (columns - 1);
  const cardWidth = available / columns - CELL_PADDING * 2;
  /*
   * Card, then the name block, then the gap below the row.
   *
   * The name was drawn over the artwork for a while, which kept this sum
   * to two terms — but it needed a dark wash under it to stay readable
   * over a white logo, and that wash across every channel mark is what
   * was asked to go. Under the card the name needs nothing behind it and
   * the logo is seen whole. The cost is this third term, and it is a
   * constant: a one-line name and a two-line one both occupy NAME_BLOCK.
   */
  return cardWidth * ART_RATIO + NAME_BLOCK + ROW_GAP;
}
const SEARCH_DEBOUNCE_MS = 200;
/** Portrait density; landscape is decided by `useGridColumns`. */
const PORTRAIT_COLUMNS = 2;

interface CategoryTab {
  id: string;
  name: string;
}

/**
 * Lands directly on the channel grid (master prompt §19: "opening a channel
 * should go to the player immediately" implies browsing shouldn't need an
 * extra category-name screen first either), with the same horizontal
 * category tab strip the Movies and Series screens use — one browsing
 * pattern across all three sections rather than a different control per
 * section.
 *
 * The first launch on a provider lands on the first real category, not
 * "All": that tab still exists and still works, but a lineup of ~11k
 * channels is a poor thing to render, scroll and search by default when a
 * named category is what the viewer actually wants.
 */
export default function LiveCategoriesScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  const theme = useThemeRerender();
  const { t } = useI18n();
  /* The bar floats over the screen, so the screen leaves room for it. */
  const tabBarSpace = useTabBarSpace();
  const session = getActiveSession();
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
   * Width first, then the column count, then the row height — in that
   * order and not the other way round. The count is now worked out FROM
   * the row height a given count would produce (see useGridColumns), and
   * the row height needs the grid's width, which does not depend on the
   * count. No cycle, but the declaration order has to say so.
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
  const [categories, setCategories] = useState<CategoryTab[] | null>(null);
  const [builtForProvider, setBuiltForProvider] = useState<string | null>(session?.provider.id ?? null);
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
  /** Read once per screen; a toggle updates it locally rather than re-querying. */
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  /**
   * Latched once the grid has taken focus, so `hasTVPreferredFocus` is a
   * one-shot request rather than something that re-fires and steals focus
   * back from the tabs or the search field. See the note in this file's
   * grid cell.
   */
  const tvFocusClaimedRef = useRef(false);
  const [lastCategoryApplied, setLastCategoryApplied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * The channel the D-pad is currently on, or null on a phone.
   *
   * This exists so the header's star can act on something. The per-cell
   * star is compiled out of the television build on purpose — two extra
   * views in every one of thousands of cells was measured as the thing
   * making D-pad navigation stutter — and the consequence was that a
   * channel could never be favourited on a television at all, leaving the
   * Favourites screen permanently empty of channels. One control in the
   * header, acting on whatever holds focus, gives the feature back for one
   * view per screen instead of two per cell.
   *
   * Fed by `onTvFocus`, which every cell already called to claim the
   * initial focus; it now carries the channel with it.
   */
  const [focusedChannel, setFocusedChannel] = useState<LiveChannel | null>(null);
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
   * unmounts a navigator that is already up. So the channel lineup and the favourites — read once, at
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
    setCategories(null);
    setActiveCategoryId(ALL_CATEGORY_ID);
    setFavoriteIds(new Set());
    setLastCategoryApplied(false);
    setFocusedChannel(null);
    setSearchInput("");
    setSearch("");
    setErrorMessage(null);
  }

  const pages = useCategoryPages<LiveChannel>({ shape: search, columns, rowHeight: gridRowHeight });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * One query for the whole screen, refreshed on focus so a favourite
   * starred elsewhere shows up here. The cards read from this Set; nothing
   * per-cell touches the database.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getLibraryItems("favorite").then((items) => {
        if (cancelled) return;
        setFavoriteIds(new Set(items.filter((i) => i.contentType === "live").map((i) => i.providerItemId)));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  /**
   * Updates the local Set immediately and writes in the background — the
   * star has to respond to the tap, not to a database round-trip.
   *
   * ## Why this is a `useCallback` with no dependencies
   *
   * It is handed to every cell in the grid, and `ChannelCard` is
   * memoised. A plain function declaration is a new value on every render
   * of this screen, so the memo's prop compare failed for every mounted
   * cell every time — on each keystroke in the search field, and on each
   * star tapped. That defeated the `isFavorite` boolean two lines above,
   * which exists for exactly this reason, and it is why Movies and Series
   * wrap their equivalents. Found by review on 2026-11-08.
   *
   * The dependency that stood in the way was `favoriteIds`, read to decide
   * which way the star was going. Taking that decision inside the updater
   * instead removes the dependency and is more correct besides: the
   * updater sees the Set React is actually about to replace, not the one
   * captured when the closure was made.
   *
   * `willSave` is read again in the `catch` below, and it is set by then:
   * a press is a discrete event, so React flushes the updater before the
   * handler yields, long before a database write can fail.
   */
  const toggleFavorite = useCallback((channel: LiveChannel) => {
    let willSave = false;
    setFavoriteIds((current) => {
      willSave = !current.has(channel.providerItemId);
      const next = new Set(current);
      if (willSave) next.add(channel.providerItemId);
      else next.delete(channel.providerItemId);
      return next;
    });
    toggleLibraryItem({
      listType: "favorite",
      contentType: "live",
      providerItemId: channel.providerItemId,
      title: channel.name,
      imageUrl: channel.logoUrl,
      categoryId: channel.categoryId,
      containerExtension: null,
    }).catch(() => {
      // Put the star back if the write failed.
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (willSave) next.delete(channel.providerItemId);
        else next.add(channel.providerItemId);
        return next;
      });
    });
  }, []);

  /**
   * `useFocusEffect` re-runs `load()` every time this screen regains focus
   * — a transient failure on one of those refocus reloads (this provider's
   * Cloudflare edge briefly 404ing, per docs/DECISIONS.md) must not replace
   * an already-working list with a scary error banner. Only surface the
   * error when there's nothing on screen yet to fall back on.
   */
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [raw, hidden] = await Promise.all([loadLiveCategories(session.provider.id, session.config), getHiddenCategoryIds("live")]);
      const presentIds = new Set(session.channels.map((c) => c.categoryId));
      const nonEmpty = raw.filter((c) => presentIds.has(c.id) && !hidden.has(c.id));
      setCategories([{ id: ALL_CATEGORY_ID, name: t("liveCategories", "allCategory") }, ...nonEmpty]);
      setErrorMessage(null);
      hasDataRef.current = true;
    } catch (error) {
      // Only alarm the user when there's nothing on screen to fall back on.
      if (!hasDataRef.current) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
    }
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * Master prompt §19: "remember last live category" — applied once, the
   * first time state loads. When nothing was remembered (a first-ever
   * launch on this provider), the default lands on the first real category
   * instead of "All Channels" — see the module doc comment above for why
   * "All" is no longer the thing a viewer sees by default.
   *
   * ## The flag is raised after the decision, not before it
   *
   * It used to be set the moment the stored state came back, whether or
   * not there was anything to apply — and the categories load separately.
   * When the database answered first, which it usually does because it is
   * local and the categories are a request, the fallback branch found
   * `categories` still null, did nothing, and the flag kept it from ever
   * being tried again. The screen then sat on "All": eleven thousand
   * channels in one list, on open, which is the one thing this default
   * exists to avoid. It showed up on the device and not in any reasoning
   * about the code, because the race only resolves that way with a warm
   * database and a cold network.
   *
   * So nothing is marked applied until something has actually been
   * applied. The effect re-runs when the categories arrive, and settles
   * the first time it has both halves.
   */
  useEffect(() => {
    if (lastCategoryApplied) return;
    getLiveTvState().then((state) => {
      if (state.lastCategoryId) {
        setLastCategoryApplied(true);
        setActiveCategoryId(state.lastCategoryId);
      } else if (categories && categories.length > 1) {
        setLastCategoryApplied(true);
        setActiveCategoryId(categories[1].id);
      }
      /* Neither yet: leave the flag down so the next categories change retries. */
    });
  }, [lastCategoryApplied, categories]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    setLastCategoryId(categoryId === ALL_CATEGORY_ID ? null : categoryId).catch(() => {});
  }

  /**
   * A failed manual refresh must never destroy what's already on screen.
   * The channel list stays exactly as it was and we show a short, plain
   * notice instead of the raw `HTTP 404 from http://…` string — this
   * provider's Cloudflare edge 404s intermittently on requests that
   * succeed moments later (docs/DECISIONS.md), so the honest message is
   * "couldn't refresh, try again", not a stack-trace-grade error.
   */
  async function handleRefresh() {
    if (!session) return;
    /*
      A refresh is the viewer saying "try again", and artwork is the part of
      the screen they can see has failed. Without this the only cure for a
      tile that went blank on a bad connection was killing the app.

      This said "a pull" when it was written, and a pull was the only way in.
      The television's ⟳ button arrives here too, and so does the error
      block's Retry as of 2026-11-17 — the sentence is true of all three.
    */
    forgetImageFailures();
    setRefreshing(true);
    /*
      Two failures, not one — and the second half runs either way.

      This was a single `try` with `load()` inside it, so a provider that 404'd
      the channel list also skipped the category read. The category read is
      served from the SQLite catalogue (see state/categoryQueries), so it
      almost always succeeds, and it is the half that can still put a list on a
      screen that has none. That started to matter the moment the error
      block's Retry button was pointed at this function: Retry is pressed from
      a cold failure as well as from a failed pull. Found 2026-11-17 in the
      pre-release audit.
    */
    let channelsFailed = false;
    try {
      await refreshActiveSessionChannels();
    } catch {
      channelsFailed = true;
    }
    try {
      await load();
      /*
        Re-stated *after* `load()`, never before it. `load()` clears the banner
        when it succeeds, and succeeding from the cache is exactly what it does
        after a failed refresh — so setting the message first would have it
        wiped by a read that fetched nothing from the provider, which is the
        very "it says it worked and nothing happened" this change is about.

        And only once there is something on screen to fall back on:
        `hasDataRef` is raised inside `load()`, so reading it here asks "is
        there a list under this banner now?". With nothing loaded at all,
        `load()`'s own message names the real problem — the provider server is
        not answering — and that is more use to the viewer than "couldn't
        refresh". Same rule `load()` already applies to itself.
      */
      if (channelsFailed && hasDataRef.current) setErrorMessage(t("common", "refreshFailed"));
    } finally {
      /* In a `finally` so an unexpected throw cannot leave the pull spinner turning. */
      setRefreshing(false);
    }
  }

  /**
   * The channels of one category, for any category — not only the current one.
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
    const grouped = new Map<string, LiveChannel[]>();
    if (!session) return grouped;
    const pool = search
      ? session.channels.filter((c) => c.name.toLowerCase().includes(search))
      : session.channels;
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
  }, [session, search]);

  const itemsFor = useCallback(
    (categoryId: string) => byCategory.get(categoryId) ?? NOTHING,
    [byCategory]
  );

  /** Only for the count in the header, which is about the category being looked at. */
  const filteredChannels = useMemo(() => itemsFor(activeCategoryId), [itemsFor, activeCategoryId]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  /*
    Stable, and the memo on the card is worthless without them. Measured on
    the owner's device: memoising the movie cell and stabilising its
    callbacks took a hard fling from 21.99% janky frames to 0.70%, p50 17ms
    to 8ms, with the series screen left unmemoised as the control at 19.51%.

    Above the early return, because a hook after one is a hook that is not
    always called.
  */
  const claimTvFocus = useCallback((channel: LiveChannel) => {
    tvFocusClaimedRef.current = true;
    if (isTvBuild) setFocusedChannel(channel);
  }, []);

  /*
   * Stable between renders, and above the early return because a hook
   * after one is a hook that is not always called — the same reason
   * `claimTvFocus` sits here.
   *
   * `activeCategoryId` stays a real dependency rather than being hidden in
   * a ref. It is what the player is told to come back to, so a stale one
   * would send the viewer to the wrong list, and when it changes the grid
   * is showing different channels anyway: the cells were going to re-render
   * regardless. What this protects is the two cases where nothing about
   * the list changed — a keystroke in the search field and a star tapped.
   */
  const openChannel = useCallback(
    (channel: LiveChannel) => {
      router.push({
        pathname: "/live/player/[channelId]",
        params: { channelId: channel.providerItemId, categoryId: activeCategoryId },
      });
    },
    [activeCategoryId]
  );

  if (!session) {
    return null;
  }

  /**
   * The screen's content, shared by both layouts: the TV build puts it
   * beside the category rail, the phone build renders it directly. Held in
   * a variable rather than duplicated so the two can never drift.
   */
  const screenBody = (
    <>

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
          `handleRefresh`, not `load()`.

          `load()` reads the categories out of the SQLite catalogue, so after a
          failed refresh it succeeded without touching the provider: the banner
          vanished, the viewer read that as "refreshed", and the lineup
          underneath was byte-for-byte the one that had just failed to update —
          the channels the provider had added were still missing and the next
          pull failed again. Retry now does what the word says, and it is the
          same path as the pull gesture and the television's ⟳ button, so the
          three can only fail together. Found 2026-11-17 in the pre-release
          audit.

          Disabled while it runs, because in a cold failure this button is the
          only thing on screen: the grid is not mounted, so there is no
          RefreshControl spinner to show that anything is happening, and a
          second press would open a second channel-list request on a line that
          answers a burst with empty 404s (docs/DECISIONS.md).
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

    {categories === null ? (
      <View style={styles.centered}>
        {/* No spinner once a load has already failed — the retry button above is the way forward. */}
        {!errorMessage && <ActivityIndicator color={Brand.primary} />}
      </View>
    ) : (
      /*
        The category either side of this one is mounted and just off the
        edge, so a sideways drag reveals it coming in rather than swapping
        the content once the finger lifts. On the television it collapses
        to the single list it has always been — see `single`.
      */
      <CategoryPager
        ids={categoryIds}
        activeId={activeCategoryId}
        onSelect={selectCategory}
        enabled={!isTvBuild}
        single={isTvBuild}
        progress={categoryDrag}
        renderPage={(pageCategoryId, pageActive) => {
          /*
            Each page answers for itself. The empty state used to be a
            screen-level branch, which cannot work once three categories
            are on screen at once: one of them having nothing in it is not
            a reason to blank the other two.
          */
          const pageChannels = itemsFor(pageCategoryId);
          if (pageChannels.length === 0) {
            return (
              <View style={styles.centered}>
                <Text style={styles.emptyGlyph}>▤</Text>
                {/*
                  A search that matches nothing is not an empty category.

                  Both used to say "لا توجد قنوات متاحة." — "No channels
                  available." — on a screen holding the provider's entire
                  eleven-thousand-channel lineup, with every category still
                  listed in the strip above and repeating the same sentence as
                  you tapped through them. The honest reading of that is that
                  the account has expired. A typo, or an English name typed
                  against an Arabic lineup, is all it takes.

                  The key is the one `search.tsx` already renders for exactly
                  this case, with its {query} placeholder, translated in all six
                  locales — so this names the term the viewer typed and adds no
                  translation debt.

                  The debounced `search` and not `searchInput`: it is the term
                  the list was actually filtered by, so the sentence and the
                  empty grid under it cannot disagree — including in the 200ms
                  after the box is cleared, where the raw input would print
                  No results for "". Found 2026-11-17 in the pre-release audit.
                */}
                <Text style={styles.emptyText}>
                  {search
                    ? t("search", "noResultsFor", { query: search })
                    : t("liveChannelList", "noChannelsAvailable")}
                </Text>
              </View>
            );
          }
          return (
      <FlatList
        ref={pages(pageCategoryId).listRef}
        {...pages(pageCategoryId).scroll}
        data={pageChannels}
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
        contentContainerStyle={[styles.grid, { paddingBottom: Spacing.xl + tabBarSpace }]}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        /*
          The first tap after typing used to be eaten by the keyboard.

          A FlatList is a ScrollView, and React Native's default
          `keyboardShouldPersistTaps="never"` lets it take the first touch
          while the soft keyboard is up: the keyboard closed, the channel did
          not open, and only the second tap reached the card. On the screen the
          owner uses most, that is how every search ended. `"handled"` passes
          the touch to a child that handles it — the card, the star — and still
          dismisses the keyboard on a tap that lands on nothing. `search.tsx`
          has carried the same prop for the same arrangement since it was
          written. Found 2026-11-17 in the pre-release audit.
        */
        keyboardShouldPersistTaps="handled"
        refreshControl={
          /*
            Undefined on the television: a `RefreshControl` there is a
            native `SwipeRefreshLayout` wrapping the grid that no remote
            can ever trigger. The header button above is its replacement.
          */
          isTvBuild ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Brand.primary} />
          )
        }
        renderItem={({ item, index }) => (
          <ChannelCard
            channel={item}
            columns={columns}
            artwork={pageActive}
            tvFocusFirst={index === 0 && !tvFocusClaimedRef.current}
            onTvFocus={claimTvFocus}
            /*
              A boolean, not the Set. Handing every card the Set means every
              card re-renders whenever a star is tapped, since the screen
              replaces the Set — a memo that bails on every frame except the
              one the viewer is touching.
            */
            isFavorite={favoriteIds.has(item.providerItemId)}
            onToggleFavorite={toggleFavorite}
            onPress={openChannel}
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
    </>
  );

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
          title={t("liveCategories", "title")}
          showBack={false}
          badge={{ colour: SECTION_LIVE, glyph: <LiveGlyph color="#FFFFFF" size={20} /> }}
          subtitle={`${t("home", "liveTVSub")} · ${filteredChannels.length.toLocaleString()} ${t("liveChannelList", "channelsCountSuffix")}`}
          /*
            Two controls that exist only on the television, in a slot that
            existed and was used by nothing.

            They replace two things a remote could not do at all. **Refresh**:
            every path that reloads the catalogue was behind a
            `RefreshControl`, which needs a pull — so a provider could add
            channels and the only way to see them was to remove the provider
            and add it again. **Favourite**: see `focusedChannel`.

            Both are `isTvBuild`-gated, so the phone header is byte-for-byte
            what it was: on a phone the pull gesture and the per-cell star are
            the right controls and both still work.
          */
          right={
            isTvBuild ? (
              <View style={styles.tvHeaderActions}>
                <Focusable
                  onPress={() => focusedChannel && toggleFavorite(focusedChannel)}
                  disabled={focusedChannel === null}
                  style={styles.tvHeaderButton}
                  round
                  hitSlop={10}
                >
                  <Text
                    style={[
                      styles.tvHeaderGlyph,
                      focusedChannel !== null &&
                        favoriteIds.has(focusedChannel.providerItemId) &&
                        styles.tvHeaderGlyphOn,
                    ]}
                  >
                    {focusedChannel !== null && favoriteIds.has(focusedChannel.providerItemId)
                      ? "★"
                      : "☆"}
                  </Text>
                </Focusable>
                <Focusable
                  onPress={handleRefresh}
                  disabled={refreshing}
                  style={styles.tvHeaderButton}
                  round
                  hitSlop={10}
                >
                  <Text style={styles.tvHeaderGlyph}>{refreshing ? "⋯" : "⟳"}</Text>
                </Focusable>
              </View>
            ) : undefined
          }
        />
      )}

      {/*
        Two shapes for the same content. On a phone the categories are a
        horizontal strip above a search box; on a TV they are a rail beside
        the grid, and the search box is gone entirely — an `EditText` sitting
        on the main vertical path opens the on-screen keyboard the moment the
        D-pad passes through it, and swallows every key until Back.
      */}
      {isTvBuild ? null : (
        <>

          <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder={t("liveChannelList", "searchPlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={searchInput}
            onChangeText={setSearchInput}
          />
          <Text style={styles.searchCount}>{filteredChannels.length.toLocaleString()}</Text>
          </View>
        </>
      )}

      <BrowseLayout
        categories={categories}
        activeId={activeCategoryId}
        onSelect={selectCategory}
        progress={categoryDrag}
      >
        {screenBody}
      </BrowseLayout>
      </SafeAreaView>

    </ScreenBackground>
  );
}

/**
 * Deliberately a plain `Pressable` (via `Focusable`) with no `entering`
 * animation: this grid can carry the provider's entire lineup (~11k
 * channels). FlatList mounts and unmounts cells continuously while
 * scrolling, so a per-cell entrance animation re-fires on every recycle and
 * a per-cell Reanimated shared value gets allocated and torn down
 * constantly — together they made scrolling visibly stutter. Entrance
 * animations belong on small, fixed-size groups (the browse cards on Home,
 * a details header), never on virtualized cells.
 *
 * Also deliberately does NOT show now/next EPG — see the identical note
 * this used to carry: asking per-cell fired hundreds of `player_api.php`
 * requests during a scroll, which is what got this provider's whole line
 * blocked for a while (docs/DECISIONS.md). EPG is still fetched exactly
 * where it costs one request and is actually read: the player, for the
 * channel currently playing.
 */
/* Memoised — see `claimTvFocus`. `memo(function …)` because `react/display-name` wants a name. */
const ChannelCard = memo(function ChannelCard({
  channel,
  columns,
  artwork,
  tvFocusFirst,
  onTvFocus,
  isFavorite,
  onToggleFavorite,
  onPress,
}: {
  channel: LiveChannel;
  columns: number;
  /**
   * Whether this page may fetch its logos.
   *
   * False for the two pages either side of the one being looked at. They
   * are mounted so a drag can reveal them, which means they would otherwise
   * all fetch at once — three screens of logos for a provider that answers
   * a burst with empty 404s on every endpoint, two of those screens for
   * nobody at all.
   */
  artwork: boolean;
  /** Exactly one cell per screen sets this — where a TV remote starts. */
  tvFocusFirst: boolean;
  /** Latches the screen's one-shot focus request — see `tvFocusClaimedRef`. */
  onTvFocus: (channel: LiveChannel) => void;
  /** Whether this one channel is a favourite. See the call site. */
  isFavorite: boolean;
  onToggleFavorite: (channel: LiveChannel) => void;
  onPress: (channel: LiveChannel) => void;
}) {
  /*
    One closure each for the life of this cell, rather than three new ones
    handed down on every render of the list. That is what lets the memo bail.
  */
  const press = useCallback(() => onPress(channel), [onPress, channel]);
  const focus = useCallback(() => onTvFocus(channel), [onTvFocus, channel]);
  const star = useCallback(() => onToggleFavorite(channel), [onToggleFavorite, channel]);
  /*
   * No `useI18n` here any more. The one translated string this cell drew
   * was the LIVE pill, and with that gone the subscription was costing a
   * context read per card — on the "All" tab, per card in the provider's
   * entire lineup — to render nothing.
   */
  /*
   * Starts already-failed when this logo's host has proved dead earlier in
   * the session, so the cell draws its letter immediately instead of
   * opening a request that is known to time out. A lazy initialiser reading
   * a module-level Map is a pure read — the same shape `knownLocalUri` uses
   * in CachedImage — and it is only consulted when the cell mounts, which
   * is the only moment the decision matters.
   */
  /*
    **The same test `CachedImage` uses, and that is the whole point.**

    This asked `imageHostIsDead`, which is host-level only — three connect
    failures against one host. `CachedImage` suppresses on the wider
    `artworkIsKnownBad`, which also covers a single URL that has already
    404'd, and it suppresses by returning null before any image exists.

    Between those two tests sat the failure this provider produces most: a
    live host answering 404 for one logo. The card took the image branch
    because the host was healthy, `CachedImage` returned null because the
    URL was known bad, and the ternary below had already swapped the letter
    out — so the tile drew empty. With no image mounted `onError` could
    never fire either, so the cell could not correct itself for the rest of
    the session. Movies and Series never showed this because their skeleton
    sits permanently behind the poster instead of being swapped out.
  */
  const [logoFailed, setLogoFailed] = useState(() => artworkIsKnownBad(channel.logoUrl));
  /*
   * The saved state is handed down, not looked up here. Every card used to
   * run its own `isInLibrary` query on mount, and virtualised cells mount
   * continuously while scrolling — a fling through the "All" tab fired
   * thousands of SQLite round-trips on the thread that draws the screen.
   * The screen now reads the favourite ids once and passes a boolean.
   */
  /* Handed in, not derived — see the prop. */

  return (
    <View style={[styles.cardCell, { flex: 1 / columns, maxWidth: `${100 / columns}%` }]}>
      <Focusable onPress={press} style={styles.card} hasTVPreferredFocus={tvFocusFirst} onFocus={focus}>
        <View style={styles.cardArt}>
          {channel.logoUrl && artwork && !logoFailed ? (
            <CachedImage
              uri={channel.logoUrl}
              style={styles.cardLogo}
              resizeMode="contain"
              onError={() => {
                noteImageFailed(channel.logoUrl);
                setLogoFailed(true);
              }}
            />
          ) : (
            <Text style={styles.cardFallbackText}>{channel.name.charAt(0).toUpperCase()}</Text>
          )}

          {/*
            Absent on a television, not merely non-interactive.

            It cannot be reached by a remote at all: Android's
            `FocusFinder.isCandidate` refuses any view inside the focused
            view's own rectangle, so from a focused card no direction
            reaches the star it contains. It was made `focusable={false}`
            earlier today to stop it interrupting travel *between* cells —
            but a control that can never be used is still two native views
            per card, built and destroyed with every category change.

            Cards are the app's most repeated view tree and rebuilding them
            is what `Slow UI thread` was counting (193 of 206 janky frames
            on the test television). Cutting the parts a remote cannot use
            is the cheapest real saving available, and it costs a TV viewer
            nothing they had. Favouriting a channel from a remote is done
            in the player. Touch is unaffected: the phone still has it.
          */}
          {!isTvBuild && (
            <Pressable
              onPress={star}
              hitSlop={10}
              focusable={false}
              style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]}
            >
              <Text style={[styles.favoriteButtonText, isFavorite && styles.favoriteButtonTextActive]}>
                {isFavorite ? "★" : "☆"}
              </Text>
            </Pressable>
          )}

        </View>

        {/*
          The name sits under the artwork now, and the two things that used
          to sit on top of it — a LIVE pill and the dark wash that kept
          white text readable over a white logo — are both gone.

          The pill labelled nothing it distinguished: every item on this
          screen is a live channel. The wash was the price of putting text
          on the picture, and here the picture is a mark on a white ground,
          so the wash fell across the mark itself. Neither was worth what
          it took from the artwork.
        */}
        <View style={styles.cardNameBox}>
          <Text style={styles.cardName} numberOfLines={NAME_LINES}>
            {channel.name}
          </Text>
        </View>
      </Focusable>
    </View>
  );
});

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  emptyText: { color: C.textMuted, fontSize: 14, fontFamily: FontFamily.regular },

  /**
   * `minHeight` rather than a fixed `height` — same reasoning as the
   * category tab pills: a long mixed Arabic/Latin category name shown here
   * (this button displays the current selection) can measure a taller
   * single line than a plain-Arabic one, and a fixed height can only clip
   * that, never accommodate it.
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
  gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },

  cardCell: { paddingHorizontal: Spacing.xs },
  card: { flex: 1 },
  /**
   * Taller than it is wide-ish (was 1.5, a wide letterbox) and with far
   * less dead space around the logo: channel logos are small square-ish
   * marks, so a wide frame with a 68%-sized logo left most of the card
   * empty. 1.15 plus a 88% logo keeps the frame's proportions but gives
   * the artwork most of it.
   */
  /*
    **Television only.** A fixed dark tile instead of `C.surface` — see
    `ArtworkTile` in the theme tokens for why one surface in the app
    ignores the palette: provider logos are white, and on the light theme a
    themed surface made every one of them disappear into the page.

    The phone keeps `C.surface`/`C.border`, which is what it shipped with
    in 2.1. The token was applied to both builds when it was written, and
    that was a change to a finished screen nobody had asked for — on the
    light theme it turned the whole channel grid from near-white tiles to
    near-black ones. Reverted 2026-09-18 on the instruction that the phone
    is closed: "اريد ارجاع الكود الذي يخص الموبايل الى ذلك الوقت".

    Whether the phone wants the same fix is a separate question and a
    one-line change. The white-logo problem is real on a phone in light
    mode too; it simply is not today's work.
  */
  /* Television only — see the header's `right` slot. */
  tvHeaderActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
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
  tvHeaderGlyphOn: { color: Brand.primary },

  cardArt: {
    aspectRatio: 1.15,
    borderRadius: Radii.lg,
    backgroundColor: isTvBuild ? ArtworkTile.background : C.surface,
    borderColor: isTvBuild ? ArtworkTile.border : C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  cardLogo: { width: "88%", height: "88%" },
  cardFallbackText: { color: C.textSecondary, fontSize: 32, fontFamily: FontFamily.extraBold },
  /** Fixed two lines, so every row is exactly `rowHeight()` tall. */
  /*
   * Pinned to the bottom of the card with no height of its own, so a
   * one-line and a two-line name give rows of identical height — which is
   * the condition getItemLayout needs to promise one height for all of them.
   */
  /*
   * A fixed height, not a minimum: see NAME_BLOCK. The row height promised
   * to getItemLayout is the same for a channel called "MBC" and one called
   * "AL JAZEERA DOCUMENTARY HD", so this box has to be too.
   */
  cardNameBox: {
    height: NAME_LINE_HEIGHT * NAME_LINES,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  cardName: {
    /* On the page now rather than on artwork, so it takes the page's ink. */
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: NAME_LINE_HEIGHT,
    textAlign: "center",
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  /*
   * Lighter than it was, because of where it has to sit.
   *
   * A 26dp disc at 50% black, dropped on the corner of a channel logo that
   * is usually a mark on a white ground, reads as a hole punched in the
   * artwork — it was the heaviest thing on the card and it was not the
   * point of the card. Smaller, softer, and set hard into the corner so it
   * overlaps the `contain`-fitted logo as little as the geometry allows.
   *
   * It keeps a ground rather than floating: the star has to be legible
   * over a white logo and over a black one, and nothing without its own
   * backing is legible over both.
   */
  favoriteButton: {
    position: "absolute",
    top: 3,
    start: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButtonText: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  /* Once it means something, it is allowed to be seen: full gold, full disc. */
  favoriteButtonActive: { backgroundColor: "rgba(0,0,0,0.5)" },
  favoriteButtonTextActive: { color: "#FFD700", fontSize: 13 },
  })
);
