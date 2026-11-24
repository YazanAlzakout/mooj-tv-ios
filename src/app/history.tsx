import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { Focusable } from "@/components/Focusable";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import { artworkIsKnownBad } from "@/core/media/deadImageHosts";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import {
  clearAllWatchProgress,
  clearWatchProgress,
  getRecentWatchProgress,
  type WatchProgressEntry,
} from "@/db/repositories/watchProgressRepository";

/** Master prompt §26: History is bounded (50–100), distinct from Home's ~10-item Continue Watching preview. */
const HISTORY_LIMIT = 100;

function formatRelativeTime(t: ReturnType<typeof useI18n>["t"], timestamp: number): string {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return t("common", "justNow");
  if (diffMinutes < 60) return t("common", "minutesAgo", { n: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("common", "hoursAgo", { n: diffHours });
  return t("common", "daysAgo", { n: Math.floor(diffHours / 24) });
}

export default function HistoryScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const [entries, setEntries] = useState<WatchProgressEntry[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(() => {
    getRecentWatchProgress(HISTORY_LIMIT).then(setEntries);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resume(entry: WatchProgressEntry) {
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

  function removeEntry(entry: WatchProgressEntry) {
    clearWatchProgress(entry.contentType, entry.providerItemId).then(load);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title={t("history", "title")}
          subtitle={entries ? `${entries.length}` : undefined}
          right={
            entries && entries.length > 0 ? (
              <Focusable onPress={() => setConfirmClear(true)} hitSlop={10}>
                <Text style={styles.clearAllText}>{t("home", "clear")}</Text>
              </Focusable>
            ) : undefined
          }
        />

        {entries !== null && entries.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyGlyph}>◷</Text>
            <Text style={styles.emptyText}>{t("history", "empty")}</Text>
          </View>
        )}

        {entries && entries.length > 0 && (
          <FlatList
        {...NO_CLIP}
            data={entries}
            keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <HistoryRow entry={item} onPress={() => resume(item)} onRemove={() => removeEntry(item)} t={t} />
            )}
            getItemLayout={(_, index) => ({ length: 74, offset: 74 * index, index })}
            initialNumToRender={16}
            windowSize={7}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmClear}
        title={t("home", "clearHistoryTitle")}
        message={t("home", "clearHistoryBody")}
        confirmLabel={t("home", "clear")}
        danger
        onConfirm={async () => {
          setConfirmClear(false);
          await clearAllWatchProgress();
          load();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </ScreenBackground>
  );
}

/** Plain `Pressable`, no per-row animation — history is a recycling list like any other. */
function HistoryRow({
  entry,
  onPress,
  onRemove,
  t,
}: {
  entry: WatchProgressEntry;
  onPress: () => void;
  onRemove: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  /*
    **The same test `CachedImage` uses, not a blank `false`.**

    The branch below swaps the letter tile OUT for the image, so whenever
    `CachedImage` declines to render — and it declines by returning null,
    before any image exists, for a URL that is already known bad — this row
    drew nothing at all where the artwork goes. With no image mounted
    `onError` can never fire either, so the row could not correct itself for
    the rest of the session.

    The tile is a flex child, not a layer behind the text, so a row that
    draws nothing pulls its title, its relative-time line and its progress
    bar 54dp towards the start edge, out of line with every row above and
    below it. History is the screen most exposed to it: a poster that 404'd
    once while the viewer was browsing Movies is remembered for the whole
    session, and everything they have watched is listed here carrying that
    same URL.

    Same defect and same fix as the browse grid and the channel row beside
    the player (45d89d0, and ChannelListRow.tsx:61); found again on this
    screen in the pre-release audit, 2026-11-17.
  */
  const [imageFailed, setImageFailed] = useState(() => artworkIsKnownBad(entry.imageUrl));
  const progress = entry.durationSeconds > 0 ? entry.positionSeconds / entry.durationSeconds : 0;

  return (
    /* The row and its remove button are siblings — see the note below. */
    <View style={styles.rowShell}>
    <Focusable onPress={onPress} style={styles.row}>
      {entry.imageUrl && !imageFailed ? (
        <CachedImage
          uri={entry.imageUrl}
          style={styles.rowImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.rowImageFallback}>
          <Text style={styles.rowImageFallbackText}>{entry.title.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.rowMeta}>
          {entry.contentType === "episode" && entry.seasonNumber !== null && entry.episodeNumber !== null
            ? `S${entry.seasonNumber} E${entry.episodeNumber} · ${formatRelativeTime(t, entry.updatedAt)}`
            : formatRelativeTime(t, entry.updatedAt)}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(1, progress) * 100}%` }]} />
        </View>
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

  clearAllText: { color: C.error, fontSize: 13, fontFamily: FontFamily.semiBold },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  rowShell: { flexDirection: "row", alignItems: "center" },
  row: {
    flex: 1,
    height: 66,
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
  rowImage: { width: 42, height: 42, borderRadius: Radii.sm },
  rowImageFallback: {
    width: 42,
    height: 42,
    borderRadius: Radii.sm,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rowImageFallbackText: { color: C.textSecondary, fontSize: 16, fontFamily: FontFamily.bold },
  rowMain: { flex: 1, gap: 4 },
  rowName: { color: C.text, fontSize: 13, fontFamily: FontFamily.medium },
  rowMeta: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: C.fillMedium, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Brand.primary },

  removeButton: { paddingHorizontal: Spacing.xs },
  removeButtonText: { color: C.textMuted, fontSize: 14 },
  })
);
