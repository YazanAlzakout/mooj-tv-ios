import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";

import { NO_CLIP } from "@/core/layout/listWindow";

import { Focusable } from "@/components/Focusable";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { getActiveSession } from "@/state/activeSessionStore";
import {
  ensureSearchIndexReady,
  searchContent,
  SEARCH_RESULT_LIMIT,
  type SearchResult,
  type SearchResultPage,
} from "@/state/searchIndexStore";

const SEARCH_DEBOUNCE_MS = 250;

function contentTypeLabel(t: ReturnType<typeof useI18n>["t"], contentType: SearchResult["contentType"]): string {
  return t("search", contentType);
}

export default function SearchScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const session = getActiveSession();

  const [indexReady, setIndexReady] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  /*
    The rows and the "was this cut" flag are one value, never two pieces of
    state. They are read together in the same frame — the header prints the
    count, the list prints the rows — and keeping them in one object makes
    it impossible to ever put one query's count over another query's rows.
  */
  const [page, setPage] = useState<SearchResultPage>({ results: [], truncated: false });

  useEffect(() => {
    if (!session) return;
    ensureSearchIndexReady(session.config, session.channels).then(
      () => setIndexReady(true),
      (error) => setIndexError(toUserFacingMessage(error, t("common", "providerUnreachable")))
    );
    // Only ever needs to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce: only ever sets state from the timeout callback, never
  // synchronously in the effect body.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Runs the actual (SQLite-backed) search once the debounced query settles.
  // Only ever sets state from the async `.then()` callback.
  useEffect(() => {
    if (!indexReady || !debouncedQuery) return;
    let cancelled = false;
    searchContent(debouncedQuery).then((found) => {
      if (!cancelled) setPage(found);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, indexReady]);

  const visibleResults = debouncedQuery ? page.results : [];

  /*
    What goes under the word "Search".

    A query that filled the page is shown as "50+", not as "50". The bare
    number was the whole defect: it is the cap, printed in the place a
    total belongs — so a viewer who matched four thousand titles read
    "there are fifty of these" and never learned that the title they wanted
    was in the catalogue and past the fiftieth row (pre-release audit,
    2026-11-17). The "+" is what makes the same number honest.

    And it is labelled, the way the three browse screens label theirs
    ("٢٤٨ قناة"): "50+ results" / "50+ نتيجة". A bare number under a
    screen's title is read as a total of whatever that screen is about,
    which is the same misreading in a quieter form.
  */
  const resultCount =
    debouncedQuery && page.truncated
      ? `${SEARCH_RESULT_LIMIT.toLocaleString()}+`
      : visibleResults.length.toLocaleString();

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  function openResult(result: SearchResult) {
    if (result.contentType === "live") {
      router.push({
        pathname: "/live/player/[channelId]",
        params: { channelId: result.providerItemId, categoryId: "all" },
      });
    } else if (result.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: result.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: result.providerItemId } });
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title={t("search", "title")}
        subtitle={
          indexReady && debouncedQuery ? `${resultCount} ${t("search", "resultsCountSuffix")}` : undefined
        }
      />

      <TextInput
        style={styles.search}
        placeholder={t("search", "placeholder")}
        placeholderTextColor={themeColors().textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        /*
          Not on a television.

          `autoFocus` puts the cursor in the field the moment the screen
          opens, which on a phone is exactly right — the viewer came here to
          type. On a television it raises the Leanback keyboard over the
          whole screen before the viewer has pressed anything, and the way
          out of that keyboard is not obvious. The field is still one press
          away: it is the first focusable on the screen.
        */
        autoFocus={!isTvBuild}
        value={queryInput}
        onChangeText={setQueryInput}
      />

      {indexError && <Text style={styles.error}>{indexError}</Text>}

      {!indexReady && !indexError && (
        <View style={styles.centered}>
          <ActivityIndicator color={Brand.primary} />
          <Text style={styles.hintText}>{t("search", "preparingSearch")}</Text>
        </View>
      )}

      {indexReady && !debouncedQuery && (
        <View style={styles.centered}>
          <Text style={styles.hintText}>{t("search", "typeToSearch")}</Text>
        </View>
      )}

      {indexReady && debouncedQuery && visibleResults.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.hintText}>{t("search", "noResultsFor", { query: debouncedQuery })}</Text>
        </View>
      )}

      {/*
        Rendered only when there is something in it, the way history.tsx:99
        and library/[listType].tsx:140 already do it.

        An empty FlatList is not nothing. React Native gives every
        ScrollView `flexGrow: 1, flexShrink: 1`, so an empty one standing in
        the same column as the `flex: 1` centred message took half the free
        height for itself: "Type to search across Live TV, Movies, and
        Series." and 'No results for "…"' landed about a quarter of the way
        down an otherwise blank screen, with a large void underneath. That
        is not what `centered` asks for, and not what the two sibling
        screens do. Pre-release audit, 2026-11-17.
      */}
      {indexReady && visibleResults.length > 0 && (
        <FlatList
        {...NO_CLIP}
          data={visibleResults}
          keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ResultRow result={item} onPress={() => openResult(item)} />}
          getItemLayout={(_, index) => ({ length: 66, offset: 66 * index, index })}
          initialNumToRender={16}
          windowSize={7}
        />
      )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** Plain `Pressable`, no per-row animation — search results scroll and recycle like any other large list. */
function ResultRow({ result, onPress }: { result: SearchResult; onPress: () => void }) {
  const { t } = useI18n();
  /*
    **The same test `CachedImage` uses, not a blank `false`.**

    The branch below swaps the letter tile OUT for the image, so whenever
    `CachedImage` declines to render — and it declines by returning null,
    before any image exists, for a URL that is already known bad — this row
    drew nothing at all where the artwork goes. With no image mounted
    `onError` can never fire either, so the row could not correct itself for
    the rest of the session.

    It costs more than a missing picture here: the tile is a flex child, not
    a layer behind the text, so a row that draws nothing pulls its title and
    its LIVE/MOVIE/SERIES badge 46dp towards the start edge and sits visibly
    out of line with the rows above and below it. One channel logo that
    404'd while the viewer was scrolling Live TV is enough to do it, and
    Search is one of the screens they open next.

    Same defect and same fix as the browse grid and the channel row beside
    the player (45d89d0, and ChannelListRow.tsx:61); found again here, and
    on History, Library and Downloads, in the pre-release audit 2026-11-17.
  */
  const [imageFailed, setImageFailed] = useState(() => artworkIsKnownBad(result.imageUrl));

  return (
    <Focusable onPress={onPress} style={styles.row}>
      {result.imageUrl && !imageFailed ? (
        <CachedImage
          uri={result.imageUrl}
          style={styles.rowImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.rowImageFallback}>
          <Text style={styles.rowImageFallbackText}>{result.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowTextCol}>
        <Text style={styles.rowName} numberOfLines={1}>
          {result.name}
        </Text>
        {result.subtitle && <Text style={styles.rowSubtitle}>{result.subtitle}</Text>}
      </View>
      <View style={[styles.typeBadge, styles[`typeBadge_${result.contentType}`]]}>
        <Text style={styles.typeBadgeText}>{contentTypeLabel(t, result.contentType)}</Text>
      </View>
    </Focusable>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.sm, padding: Spacing.xl },
  hintText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular, textAlign: "center" },

  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
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

  error: {
    color: C.error,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  row: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowImage: { width: 34, height: 34, borderRadius: Radii.sm },
  rowImageFallback: {
    width: 34,
    height: 34,
    borderRadius: Radii.sm,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rowImageFallbackText: { color: C.textSecondary, fontSize: 14, fontFamily: FontFamily.bold },
  rowTextCol: { flex: 1, gap: 2 },
  rowName: { color: C.text, fontSize: 14, fontFamily: FontFamily.medium },
  rowSubtitle: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },

  typeBadge: { borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  typeBadge_live: { backgroundColor: Brand.primaryMuted },
  typeBadge_movie: { backgroundColor: "rgba(109,40,217,0.25)" },
  typeBadge_series: { backgroundColor: "rgba(219,39,119,0.25)" },
  typeBadgeText: { color: C.text, fontSize: 9, fontFamily: FontFamily.bold },
  })
);
