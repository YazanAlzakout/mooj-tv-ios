import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { Focusable } from "@/components/Focusable";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BouncePressable } from "@/components/BouncePressable";
import { useI18n } from "@/core/i18n/I18nContext";
import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import {
  getLibraryItems,
  removeLibraryItem,
  type LibraryItem,
  type LibraryListType,
} from "@/db/repositories/libraryRepository";

function contentTypeLabel(t: ReturnType<typeof useI18n>["t"], contentType: LibraryItem["contentType"]): string {
  return t("search", contentType);
}

/**
 * Live / Movies / Series as separate tabs rather than one mixed list — a
 * saved lineup is browsed by kind ("what did I star to watch tonight"),
 * and a channel sitting between two films made the list read as noise. The
 * order matches the app's own Live → Movies → Series ordering everywhere
 * else.
 */
const TAB_TYPES: LibraryItem["contentType"][] = ["live", "movie", "series"];

export default function LibraryListScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { listType } = useLocalSearchParams<{ listType: LibraryListType }>();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [activeType, setActiveType] = useState<LibraryItem["contentType"] | null>(null);

  const load = useCallback(() => {
    if (!listType) return;
    getLibraryItems(listType).then(setItems);
  }, [listType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const countsByType = useMemo(() => {
    const counts: Record<LibraryItem["contentType"], number> = { live: 0, movie: 0, series: 0 };
    for (const item of items ?? []) counts[item.contentType] += 1;
    return counts;
  }, [items]);

  /**
   * Land on the first tab that actually has something in it, so a library
   * holding only films doesn't open on an empty Live tab. Adjusted during
   * render (React's documented "derive state from props" pattern) rather
   * than in an effect, which this project's `react-hooks/set-state-in-effect`
   * rule rejects.
   */
  if (items !== null && activeType === null) {
    setActiveType(TAB_TYPES.find((type) => countsByType[type] > 0) ?? TAB_TYPES[0]);
  }

  const visibleItems = useMemo(
    () => (items ?? []).filter((item) => item.contentType === activeType),
    [items, activeType]
  );

  useEffect(() => {
    if (!listType) router.replace("/home");
  }, [listType]);

  if (!listType) {
    return null;
  }

  const title = listType === "favorite" ? t("library", "favoritesTitle") : t("library", "watchLaterTitle");

  function openItem(item: LibraryItem) {
    if (item.contentType === "live") {
      router.push({
        pathname: "/live/player/[channelId]",
        params: { channelId: item.providerItemId, categoryId: "all" },
      });
    } else if (item.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: item.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
    }
  }

  function removeItem(item: LibraryItem) {
    removeLibraryItem(listType, item.contentType, item.providerItemId).then(load);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={title} subtitle={items ? `${items.length}` : undefined} />

        {items !== null && items.length > 0 && (
          <View style={styles.tabsRow}>
            {TAB_TYPES.map((type) => (
              <BouncePressable
                key={type}
                style={[styles.tab, activeType === type && styles.tabActive]}
                onPress={() => setActiveType(type)}
              >
                <Text style={[styles.tabText, activeType === type && styles.tabTextActive]} numberOfLines={1}>
                  {contentTypeLabel(t, type)} · {countsByType[type]}
                </Text>
              </BouncePressable>
            ))}
          </View>
        )}

        {items !== null && items.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyGlyph}>{listType === "favorite" ? "★" : "◷"}</Text>
            <Text style={styles.emptyText}>{t("library", "nothingHereYet")}</Text>
          </View>
        )}

        {items !== null && items.length > 0 && visibleItems.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t("library", "nothingHereYet")}</Text>
          </View>
        )}

        {visibleItems.length > 0 && (
          <FlatList
        {...NO_CLIP}
            data={visibleItems}
            keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ItemRow item={item} onPress={() => openItem(item)} onRemove={() => removeItem(item)} />
            )}
            getItemLayout={(_, index) => ({ length: 66, offset: 66 * index, index })}
            initialNumToRender={16}
            windowSize={7}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** Plain `Pressable`, no per-row animation — see the note on `ChannelRow` in live-categories.tsx. */
function ItemRow({ item, onPress, onRemove }: { item: LibraryItem; onPress: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  /*
    **The same test `CachedImage` uses, not a blank `false`.**

    The branch below swaps the letter tile OUT for the image, so whenever
    `CachedImage` declines to render — and it declines by returning null,
    before any image exists, for a URL that is already known bad — this row
    drew nothing at all where the artwork goes. With no image mounted
    `onError` can never fire either, so the row could not correct itself for
    the rest of the session.

    The tile is a flex child, not a layer behind the text, so a row that
    draws nothing pulls its title and its LIVE/MOVIE/SERIES badge 46dp
    towards the start edge, out of line with the rows around it. Favourites
    is where it is near-certain rather than merely likely: a channel is
    starred from the Live TV grid, and the logo URL saved in library_items
    is the same URL that grid has just failed to load — so the star the
    viewer added right after seeing a blank tile is the row that draws
    blank here.

    Same defect and same fix as the browse grid and the channel row beside
    the player (45d89d0, and ChannelListRow.tsx:61); found again on this
    screen in the pre-release audit, 2026-11-17.
  */
  const [imageFailed, setImageFailed] = useState(() => artworkIsKnownBad(item.imageUrl));

  return (
    /* The row and its remove button are siblings — see the note below. */
    <View style={styles.rowShell}>
    <Focusable onPress={onPress} style={styles.row}>
      {item.imageUrl && !imageFailed ? (
        <CachedImage
          uri={item.imageUrl}
          style={styles.rowImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.rowImageFallback}>
          <Text style={styles.rowImageFallbackText}>{item.title.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.rowName} numberOfLines={1}>
        {item.title}
      </Text>
      <View style={[styles.typeBadge, styles[`typeBadge_${item.contentType}`]]}>
        <Text style={styles.typeBadgeText}>{contentTypeLabel(t, item.contentType)}</Text>
      </View>
    </Focusable>
      {/*
        A sibling of the row, not a child: a view inside the focused view's
        rectangle is never a focus candidate, so nested here it was
        unreachable by a remote.
      */}
      <Focusable onPress={onRemove} hitSlop={10} style={styles.removeButton}>
        <Text style={styles.removeButtonText}>✕</Text>
      </Focusable>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  emptyText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular },

  tabsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
  },
  tabActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  tabText: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 22,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  tabTextActive: { color: "#fff" },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  rowShell: { flexDirection: "row", alignItems: "center" },
  row: {
    flex: 1,
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
  rowName: { flex: 1, color: C.text, fontSize: 14, fontFamily: FontFamily.medium },

  typeBadge: { borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  typeBadge_live: { backgroundColor: Brand.primaryMuted },
  typeBadge_movie: { backgroundColor: "rgba(109,40,217,0.25)" },
  typeBadge_series: { backgroundColor: "rgba(219,39,119,0.25)" },
  typeBadgeText: { color: C.text, fontSize: 9, fontFamily: FontFamily.bold },

  removeButton: { paddingHorizontal: Spacing.xs },
  removeButtonText: { color: C.textMuted, fontSize: 14 },
  })
);
