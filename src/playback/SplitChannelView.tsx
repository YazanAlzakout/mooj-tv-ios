import type { VideoContentFit, VideoPlayer } from "expo-video";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

/*
  The engine's surface rather than `expo-video`'s `VideoView` directly: on
  Android this *is* `VideoView`, re-exported, and on iOS it is the libVLC
  surface. The `player` prop keeps its `VideoPlayer` type either way — see
  `src/playback/engine/types.ts` for why the libVLC adapter presents that
  surface instead of a neutral one.
*/
import { LiveVideoView } from "@/playback/engine";

import { useMemo } from "react";

import { brandLogoOnDark } from "@/components/BrandLogo";
import { CategorySwipe } from "@/components/CategorySwipe";
import { useCategoryDrag } from "@/core/layout/useCategoryDrag";
import type { CategoryScrollProps } from "@/core/layout/useCategoryScroll";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { Focusable } from "@/components/Focusable";
import { CategoryTabs, type CategoryTabItem } from "@/components/CategoryTabs";
import { useI18n } from "@/core/i18n/I18nContext";
import { AndroidTextFix, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { LiveChannel } from "@/domain/provider/types";
import {
  CHANNEL_ROW_HEIGHT,
  CHANNEL_ROW_SPACING,
  ChannelListRow,
} from "@/playback/ChannelListRow";

/**
 * The "modern" live layout: the video pinned as a 16:9 box at the top of a
 * portrait page, with the category strip and channel list underneath.
 *
 * The point is that picking a channel here is not navigation — it swaps the
 * source on the *same* `VideoPlayer` the caller owns, so the picture never
 * unmounts and the provider connection is never dropped and re-opened.
 * That matters more than it looks: the test account allows a single
 * connection, so a layout that rebuilt the player on every switch would
 * spend that connection reconnecting instead of playing.
 *
 * That paragraph is true of `expo-video`, which is to say of Android. On the
 * libVLC engine the native player lives inside the view and is rebuilt for
 * every source whatever the layout does, so there the saving is the one this
 * layout still makes on its own: picking a channel from the list is not a
 * navigation and does not tear down the screen. See
 * `src/playback/engine/vlc/VlcLivePlayer.ts`.
 *
 * Deliberately carries almost no chrome: the list below does the job of
 * previous/next and channel-number entry, so all that is left on the
 * picture is play/pause, back, and expand.
 */
export function SplitChannelView({
  player,
  channels,
  categories,
  activeCategoryId,
  currentChannelId,
  nowPlayingName,
  isPlaying,
  isBuffering,
  contentFit,
  errorReasonKey,
  retryPending,
  onBack,
  onSelectCategory,
  onSelectChannel,
  onTogglePlay,
  onExpand,
  listRef,
  scrollProps,
}: {
  player: VideoPlayer;
  channels: LiveChannel[];
  categories: CategoryTabItem[];
  activeCategoryId: string;
  currentChannelId: string | null;
  /**
   * The name of the channel that is playing, which is **not** read from the
   * list below.
   *
   * The list is filtered by the category strip, so the moment the viewer
   * browses a category the playing channel does not belong to, it is not in
   * `channels` at all — and a name derived from `channels` went empty. An
   * empty `Text` measures no line box on Android, so the line collapsed and
   * everything under it jumped up by its height, which is what the viewer
   * saw as a flicker while stepping through categories (2026-10-06).
   *
   * Browsing is not tuning: the picture is still playing that channel, so
   * its name is still the truth and has to come from the screen that owns
   * the player rather than from whatever the list happens to be showing.
   */
  nowPlayingName: string;
  isPlaying: boolean;
  isBuffering: boolean;
  contentFit: VideoContentFit;
  /** A reason key from core/errors/playbackReason.ts, or null. */
  errorReasonKey: string | null;
  /** True while a retry is counting down — draws the spinner beside the reason. */
  retryPending: boolean;
  onBack: () => void;
  onSelectCategory: (id: string) => void;
  onSelectChannel: (channel: LiveChannel) => void;
  onTogglePlay: () => void;
  onExpand: () => void;
  /**
   * The list's place in each category, owned by the player screen.
   *
   * It cannot live here: this view is only rendered while the phone is
   * upright, so turning it unmounts the list and anything it remembered
   * goes with it. The screen above survives the rotation, so the memory
   * does — which is the whole point of it.
   *
   * It is a callback rather than a ref object on purpose: the hook has to
   * be told when this list is replaced, which is exactly what a rotation
   * does to it, and only the ref callback carries that news.
   */
  listRef: (instance: FlatList<LiveChannel> | null) => void;
  scrollProps: CategoryScrollProps;
}) {
  const { t } = useI18n();
  /* The strip's own order, so a sideways drag and the chips can never disagree. */
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  /* Handed to both the strip and the drag surface, so the chips travel with the finger. */
  const categoryDrag = useCategoryDrag();

  return (
    <View style={styles.root}>
      <View style={styles.videoBox}>
        <LiveVideoView
          style={styles.video}
          player={player}
          nativeControls={false}
          allowsPictureInPicture
          contentFit={contentFit}
        />

        {((isBuffering && !errorReasonKey) || retryPending) && (
          <View style={styles.videoOverlay} pointerEvents="none">
            <ActivityIndicator color={Colors.text} />
          </View>
        )}

        {/*
          The same brand mark and plain sentence the fullscreen player
          shows. This branch was missed when that was built, so a failure
          here still printed the provider's raw English string with its
          HTTP code — which is exactly what was seen on the device
          (2026-09-16, "Source error / Response code: 403").
        */}
        {errorReasonKey && (
          <View style={styles.videoOverlay} pointerEvents="none">
            <Image source={brandLogoOnDark()} style={styles.errorLogo} resizeMode="contain" />
            <Text style={styles.errorText}>
              {t("livePlayer", errorReasonKey as "streamPaused")}
            </Text>
          </View>
        )}

        <Focusable onPress={onBack} style={[styles.iconButton, styles.backButton]} hitSlop={10}>
          <Text style={styles.iconButtonText}>‹</Text>
        </Focusable>

        <Focusable onPress={onExpand} style={[styles.iconButton, styles.expandButton]} hitSlop={10}>
          <Text style={styles.iconButtonText}>⛶</Text>
        </Focusable>

        {/*
          The only transport control this layout needs — the list below does
          the zapping — and it sits directly on the picture, so it stays
          nearly invisible until a finger is on it rather than parking a
          solid button in the middle of whatever is playing.
        */}
        <Pressable
          onPress={onTogglePlay}
          style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          hitSlop={10}
        >
          <Text style={styles.playButtonText}>{isPlaying ? "❙❙" : "▶"}</Text>
        </Pressable>
      </View>

      <Text style={styles.nowPlaying} numberOfLines={1}>
        {nowPlayingName}
      </Text>

      {categories.length > 1 && (
        <CategoryTabs
          categories={categories}
          activeId={activeCategoryId}
          alwaysDark
          onSelect={onSelectCategory}
          progress={categoryDrag}
        />
      )}

      {/*
        A sideways drag changes category, over the list only — the picture
        above keeps its own buttons and is never part of the gesture.
      */}
      <CategorySwipe
        ids={categoryIds}
        activeId={activeCategoryId}
        onSelect={onSelectCategory}
        enabled={!isTvBuild}
        progress={categoryDrag}
      >
      {channels.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t("liveChannelList", "noChannelsAvailable")}</Text>
        </View>
      ) : (
        <FlatList
          /*
            **Where the viewer was, not where the list begins.**

            `useCategoryScroll` in the player screen keeps one offset per
            category and hands it back here. It covers both ways this list
            arrives: a category change, where the list stays and the data
            changes, and a rotation, where the list is a new one that has
            to be told where it was.

            `getItemLayout` below is what makes the restore exact — every
            row is the same height, so an offset can be honoured without
            measuring anything.
          */
          ref={listRef}
          {...scrollProps}
          data={channels}
          keyExtractor={(item) => item.providerItemId}
          style={styles.listArea}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ChannelListRow
              channel={item}
              index={index}
              active={item.providerItemId === currentChannelId}
              onPress={() => onSelectChannel(item)}
            />
          )}
          getItemLayout={(_, index) => ({
            length: CHANNEL_ROW_HEIGHT + CHANNEL_ROW_SPACING,
            offset: (CHANNEL_ROW_HEIGHT + CHANNEL_ROW_SPACING) * index,
            index,
          })}
          initialNumToRender={12}
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
        />
      )}
      </CategorySwipe>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  /** Sized for the video box, which is a third of a portrait screen. */
  /**
   * Bigger than it first was. The video box is only a third of a portrait
   * screen, so 140pt looked like a stray icon rather than the brand mark
   * standing in for the picture.
   */
  errorLogo: { width: 190, height: 107, marginBottom: Spacing.md },
  errorText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.medium,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  iconButton: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: { top: Spacing.sm, start: Spacing.sm },
  expandButton: { top: Spacing.sm, end: Spacing.sm },
  iconButtonText: { color: Colors.text, fontSize: 16, fontFamily: FontFamily.bold },

  playButton: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.22,
  },
  playButtonPressed: { opacity: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  playButtonText: { color: Colors.text, fontSize: 18, fontFamily: FontFamily.bold },

  /**
   * A fixed height, not a line that grows from its text.
   *
   * `paddingTop` plus the 22 of `lineHeight`. Belt and braces beside the
   * prop above: the name is empty for the moment between opening the screen
   * and the channel resolving, and an empty `Text` is zero units tall on
   * Android — so without this the page would still shift once on entry.
   */
  nowPlaying: {
    height: Spacing.sm + 22,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  /**
   * `flex: 1` on the list itself, not just its content. Without a bounded
   * height a FlatList in a flex column takes its *content* height — here,
   * thousands of rows — so it overflowed its slot and scrolled up behind
   * the category strip instead of clipping at the top of its own area.
   *
   * The gap under the category strip lives here as a margin, not as the
   * content's top padding: padding is *inside* the scrollable content, so
   * it scrolled away with the first row and the spacing vanished the moment
   * the list moved. A margin belongs to the list's frame, so it holds.
   * 20 plus the strip's own 4 of bottom padding is the gap that was tuned
   * by eye.
   */
  listArea: { flex: 1, marginTop: 20 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.regular },
});
