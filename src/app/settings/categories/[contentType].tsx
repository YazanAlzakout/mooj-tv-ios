import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import {
  getHiddenCategoryIds,
  setCategoryHidden,
  type CategoryContentType,
} from "@/db/repositories/categoryVisibilityRepository";
import { getActiveSession } from "@/state/activeSessionStore";
import {
  loadLiveCategories,
  loadMovieCategories,
  loadSeriesCategories,
  type CategoryRow,
} from "@/state/categoryQueries";

const TITLE_NAMESPACE: Record<CategoryContentType, "liveCategories" | "moviesCategories" | "seriesCategories"> = {
  live: "liveCategories",
  movie: "moviesCategories",
  series: "seriesCategories",
};

export default function CategoryVisibilityScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { contentType } = useLocalSearchParams<{ contentType: CategoryContentType }>();
  const session = getActiveSession();

  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  /**
   * Clear a previous error the moment a new attempt starts (contentType
   * changed, or the user tapped Retry) — done during render, React's
   * documented pattern for "adjusting state when a prop changes", rather
   * than as the first line of the fetch effect below, which this project's
   * `react-hooks/set-state-in-effect` lint rule flags.
   */
  const attemptKey = `${contentType}:${reloadToken}`;
  const [lastAttemptKey, setLastAttemptKey] = useState(attemptKey);
  if (attemptKey !== lastAttemptKey) {
    setLastAttemptKey(attemptKey);
    setErrorMessage(null);
  }

  useEffect(() => {
    if (!session || !contentType) return;
    let cancelled = false;
    /*
     * Served from the device's catalog cache, not from the panel.
     *
     * Until 2026-11-17 this screen called the Xtream adapters directly, so
     * simply opening it cost one uncached `player_api.php` request — three
     * of them for someone who checks Live, Movies and Series in one visit,
     * on top of the `authenticate()` that settings.tsx already fires when
     * it opens. This panel bans a line for asking too often (the ban is
     * about request *rate*, and while it lasts every endpoint, login
     * included, answers with an empty 404), so the Settings screen was the
     * most expensive way in the app to read a list the device already had
     * on disk.
     *
     * The second half of the bug was worse than the cost. With no network
     * — or during that ban — this screen showed "the provider server isn't
     * answering right now" and a Retry button, while the three browse tabs
     * beside it listed the very same categories happily out of the catalog
     * cache. That is precisely when it matters, because un-hiding a
     * category is only possible from here: the viewer could hide one and
     * then be unable to get it back.
     *
     * `load*Categories` reads the stored list first and only reaches the
     * network when nothing is cached, writing back what it fetched so that
     * it is the last time. It also applies the DEMO_CONTENT renaming, so
     * the names on this screen finally agree with the names on every other
     * screen instead of printing the provider's real ones underneath the
     * demo ones.
     *
     * The hiding behaviour itself is deliberately untouched — the owner
     * tested it on 2026-11-17 and it worked. Only where the list comes
     * from has changed.
     */
    const fetcher =
      contentType === "live" ? loadLiveCategories : contentType === "movie" ? loadMovieCategories : loadSeriesCategories;
    fetcher(session.provider.id, session.config).then(
      (result) => {
        if (!cancelled) setCategories(result);
      },
      (error) => {
        if (!cancelled) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    );
    getHiddenCategoryIds(contentType).then((result) => {
      if (!cancelled) setHidden(result);
    });
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per contentType (plus an explicit retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, reloadToken]);

  if (!session || !contentType) {
    return null;
  }

  async function toggle(categoryId: string) {
    const isHidden = hidden.has(categoryId);
    await setCategoryHidden(contentType, categoryId, !isHidden);
    setHidden((prev) => {
      const next = new Set(prev);
      if (isHidden) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  /* One trim, read twice: the list filters on it and the empty state below
     quotes it back, and those two must never be quoting different strings. */
  const query = search.trim();
  const filtered = (categories ?? []).filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title={t(TITLE_NAMESPACE[contentType], "title")}
        subtitle={categories ? `${categories.length}` : undefined}
      />

      <TextInput
        style={styles.search}
        placeholder={t("categoryVisibility", "searchPlaceholder")}
        placeholderTextColor={themeColors().textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={search}
        onChangeText={setSearch}
      />

      {errorMessage && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <BouncePressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
          </BouncePressable>
        </View>
      )}

      {errorMessage ? null : categories === null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      ) : filtered.length === 0 ? (
        /*
         * Two characters that match nothing used to leave this page as the
         * header, the search box and an expanse of nothing — no glyph, no
         * sentence, no way to tell a typo apart from a list that had
         * broken. The same blank answered a provider that returns no
         * categories at all for a section. Found 2026-11-17.
         *
         * This is the shape history.tsx:92-97 and library/[listType].tsx:127-137
         * already use for the same moment — a muted glyph over one line —
         * and the glyph is live-categories' ▤, because that is the screen
         * these categories are hidden from.
         *
         * The copy branches because the two causes are not the same answer:
         * when there is a query it is the viewer's own search that emptied
         * the list, so quote it back with the `noResultsFor` key search.tsx
         * already uses; when there is no query the section genuinely has no
         * categories and nothing the viewer types will change that.
         *
         * That second line is `categoryVisibility.empty` — "no categories
         * in this section" — and not the content-type-neutral
         * `library.nothingHereYet` ("Nothing here yet.") it borrowed while
         * the key was being added. One screen serves live, movies and
         * series, so the sentence has to hold for all three without naming
         * any of them: hence "section", not "channels".
         */
        <View style={styles.centered}>
          <Text style={styles.emptyGlyph}>▤</Text>
          <Text style={styles.emptyText}>
            {query ? t("search", "noResultsFor", { query }) : t("categoryVisibility", "empty")}
          </Text>
        </View>
      ) : (
        <FlatList
        {...NO_CLIP}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowText} numberOfLines={1}>
                {item.name}
              </Text>
              <Switch value={!hidden.has(item.id)} onValueChange={() => toggle(item.id)} trackColor={{ true: Brand.primary }} />
            </View>
          )}
          /*
            Fifty-eight plus eight. The row is 58 tall with an 8 bottom
            margin, and this is the one list in the app whose content
            container also adds an 8 gap between cells — so the pitch is
            74, not 58. With `getItemLayout` supplied a list never measures
            a cell and trusts this arithmetic completely, so the promise
            drifted by a quarter of the distance scrolled and the window
            rendered the wrong rows once a long category list was scrolled
            far enough for the drift to outrun the buffer.
          */
          getItemLayout={(_, index) => ({ length: 74, offset: 74 * index, index })}
          initialNumToRender={16}
          windowSize={7}
        />
      )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  errorText: { color: C.error, fontSize: 14, fontFamily: FontFamily.medium, textAlign: "center" },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: C.surface,
    borderRadius: Radii.md,
  },
  retryButtonText: { color: C.text, fontFamily: FontFamily.bold },

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

  list: { padding: Spacing.lg, gap: Spacing.sm },
  row: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  rowText: { flex: 1, color: C.text, fontSize: 14, fontFamily: FontFamily.semiBold },

  /* The empty state's two lines, byte for byte the values history.tsx:194
     and library/[listType].tsx:204 use, so the three screens answer an
     empty list identically. `textAlign` is the one difference: the message
     here can carry a search term the viewer typed, which is the only one of
     the three that can wrap. */
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  emptyText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular, textAlign: "center" },
  })
);
