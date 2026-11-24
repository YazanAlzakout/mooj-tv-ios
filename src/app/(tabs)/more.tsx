import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import {
  DownloadIcon,
  FavoriteIcon,
  HistoryIcon,
  SearchIcon,
  SettingsIcon,
  WatchLaterIcon,
} from "@/components/MenuIcons";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useTabBarSpace } from "@/components/MoojTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTapFeedback } from "@/core/feedback/useTapFeedback";
import { useI18n } from "@/core/i18n/I18nContext";
import type { ThemeColors } from "@/core/theme/palettes";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { getAllDownloadTasks } from "@/db/repositories/downloadRepository";
import { getLibraryCount } from "@/db/repositories/libraryRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";

/**
 * Everything that is not a content section.
 *
 * The app this was cloned from put these on the home screen as a grid of
 * square tiles, where they competed for the first screen with the content
 * itself. They are not a destination anybody opens the app for: they are
 * what you go looking for when you already know what you want. So they get
 * a list — scannable top to bottom, one line each, the count on the right —
 * and the home screen gets its space back.
 *
 * Counts are refreshed on focus rather than on mount. This is a tab: it
 * stays mounted while the viewer stars something three screens away, and a
 * favourites count that only ever read right on the first visit would be
 * worse than showing none at all.
 */
export default function MoreScreen() {
  useThemeRerender();
  const { t } = useI18n();
  /* The bar floats over the screen, so the screen leaves room for it. */
  const tabBarSpace = useTabBarSpace();
  /*
   * The same tick the tab bar answers a press with. A bar that clicks
   * above a list that does not is worse than neither clicking — the
   * viewer learns the sound means "that worked" and then stops getting
   * it halfway down the same screen.
   */
  const tap = useTapFeedback();

  const [favoriteCount, setFavoriteCount] = useState<number | null>(null);
  const [watchLaterCount, setWatchLaterCount] = useState<number | null>(null);
  const [downloadsCount, setDownloadsCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getLibraryCount("favorite").then(setFavoriteCount);
      getLibraryCount("watch_later").then(setWatchLaterCount);
      /*
       * Every task, not only the finished ones.
       *
       * 2026-11-17: this row was filled from getDownloadsSummary(), whose
       * SQL ends "WHERE status = 'completed'". Start three downloads, open
       * More, and the row read 0 — and because 0 is a number rather than
       * null it printed a literal zero, so the row actively said "nothing
       * here" — while the screen that row opens listed all three. A count a
       * viewer reads in order to decide whether to open a screen has to be
       * the count that screen will show, so it is now read the way
       * downloads.tsx — the screen this row opens, and the only precedent
       * that matters here — reads it: `getAllDownloadTasks()` with no filter,
       * every row of download_tasks, queued, downloading, paused, failed and
       * completed alike. "canceled" cannot show up in that total;
       * cancelDownload and deleteDownload both go through
       * deleteAndCleanupFile, which removes the row rather than marking it.
       *
       * 2026-11-18: home.tsx was cited here too and should not have been. It
       * calls the same function and then filters to `status === "completed"`,
       * which is right for what it builds — a shelf of cards you can press
       * play on — and wrong for a count that promises what the next screen
       * lists.
       *
       * getDownloadsSummary stays where it is actually wanted, in
       * settings.tsx, which is after the completed bytes and not after a
       * count at all.
       */
      if (downloadsSupported()) getAllDownloadTasks().then((ts) => setDownloadsCount(ts.length));
    }, [])
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {/*
          No back button: this is a tab, and there is nothing behind it.
          ScreenHeader pairs that with an empty leading box so the title stays
          on the window's centre line — see the note there for the 25dp it
          would be off without it. On the television that also puts it level
          with the titles the three browse tabs hang off their section
          badges; on the phone those headers are `isTvBuild`-gated and this is
          the only one in the group (corrected 2026-11-18).
        */}
        <ScreenHeader title={t("tabs", "more")} showBack={false} />

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: Spacing.xl + tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          <Row
            Icon={SearchIcon}
            label={t("home", "search")}
            delay={0}
            tap={tap}
            onPress={() => router.push("/search")}
          />
          <Row
            Icon={FavoriteIcon}
            gold
            label={t("home", "favorites")}
            delay={55}
            count={favoriteCount}
            tap={tap}
            onPress={() =>
              router.push({ pathname: "/library/[listType]", params: { listType: "favorite" } })
            }
          />
          <Row
            Icon={WatchLaterIcon}
            label={t("home", "watchLater")}
            delay={110}
            count={watchLaterCount}
            tap={tap}
            onPress={() =>
              router.push({ pathname: "/library/[listType]", params: { listType: "watch_later" } })
            }
          />
          {downloadsSupported() && (
            <Row
              Icon={DownloadIcon}
              label={t("home", "downloads")}
              delay={165}
              count={downloadsCount}
              tap={tap}
              onPress={() => router.push("/downloads")}
            />
          )}
          <Row
            Icon={HistoryIcon}
            label={t("history", "title")}
            delay={220}
            tap={tap}
            onPress={() => router.push("/history")}
          />
          <Row
            Icon={SettingsIcon}
            label={t("home", "settings")}
            delay={275}
            tap={tap}
            onPress={() => router.push("/settings")}
          />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * One line of the list.
 *
 * `count` is deliberately three-state: `null` while the query is still in
 * flight, a number once it answers, and `undefined` for a row that has no
 * count at all. Collapsing the first two would flash a zero on every visit
 * and read as "you have no favourites" for as long as the database takes.
 */
function Row({
  Icon,
  gold,
  label,
  count,
  delay,
  tap,
  onPress,
}: {
  /** Drawn, not a character — see MenuIcons for what the characters were doing. */
  Icon: (props: { color: string; size: number }) => ReactNode;
  /** Favourites only: a star the viewer placed is a different kind of thing. */
  gold?: boolean;
  label: string;
  count?: number | null;
  delay: number;
  /** Handed down rather than taken here: one audio player for the screen, not six. */
  tap: () => void;
  onPress: () => void;
}): ReactNode {
  const tint = gold ? "#F6C445" : Brand.primaryLight;
  return (
    /*
     * Each row arrives a beat after the one above it. 55ms is small enough
     * that the list still reads as one object settling rather than six
     * things queueing, and the whole cascade is over in a third of a
     * second — before anyone could have decided what to tap.
     *
     * A plain timing, not a spring. The spring that was here first
     * overshot on six rows at once and the screen looked like it was
     * bouncing rather than arriving.
     */
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
    <Focusable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.row}
    >
      <View style={[styles.glyphWrap, { backgroundColor: tint + "22", borderColor: tint + "55" }]}>
        <Icon color={tint} size={19} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {typeof count === "number" && <Text style={styles.count}>{count}</Text>}
      <Text style={styles.chevron}>›</Text>
    </Focusable>
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    /* paddingBottom is added inline from useTabBarSpace(), which needs the insets. */
    list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.border,
    },
    glyphWrap: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      flex: 1,
      color: C.text,
      fontFamily: FontFamily.medium,
      fontSize: 15,
      ...AndroidTextFix,
    },
    count: {
      color: C.textSecondary,
      fontFamily: FontFamily.semiBold,
      fontSize: 13,
      ...AndroidTextFix,
    },
    chevron: {
      color: C.textMuted,
      fontSize: 20,
      ...AndroidTextFix,
    },
  })
);
