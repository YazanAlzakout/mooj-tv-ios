import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  CHANNEL_ROW_HEIGHT,
  CHANNEL_ROW_SPACING,
  ChannelListRow,
} from "@/playback/ChannelListRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isTvBuild } from "@/core/platform/isTvBuild";
import { useI18n } from "@/core/i18n/I18nContext";
import { AndroidTextFix, Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { LiveChannel } from "@/domain/provider/types";


/**
 * Master prompt §24.3's "channel guide overlay" — a side panel (docked to
 * the trailing edge, full height, roughly 40% width) for browsing/switching
 * channels *without covering the video*, so the currently playing channel
 * stays visible and audible the whole time the guide is open — the whole
 * point of a zapping guide is picking the next channel while still watching
 * the current one, which a near-fullscreen bottom sheet defeats. Defaults
 * to the category the player opened with (an "All Channels" tab is only
 * shown when there actually is a narrower category to default to),
 * auto-scrolls to the currently playing channel on open.
 *
 * Deliberately has no search box. This panel opens *over* live playback,
 * where the job is zapping to a nearby channel, not hunting the whole
 * lineup — and a text field here meant a keyboard over the video plus a
 * debounce and a filter pass across every channel on each keystroke. The
 * full-screen channel grid is where searching belongs.
 *
 * ## On a television it lists exactly the channels it is given
 *
 * One category — the one the viewer opened — and no tab to leave it
 * ("فقط داخل التصنيف", 2026-09-18). That also matches the arrows: the
 * player filters its own channel list by category, so Up and Down already
 * walk this same set and nothing else.
 *
 * **The phone keeps its two tabs, untouched**, and keeps the two problems
 * described below with them. They are gated off on the TV build only,
 * because the phone's live-TV code is finished and closed to changes that
 * were not asked for ("كود الموبايل انتها بشكل كامل / نحن نعدل في التلفاز
 * فقط", 2026-09-18). The defect is written down here rather than fixed so
 * that whoever reopens that decision has it in hand:
 *
 * The "this category / all channels" pair does one of two things on a
 * phone, neither of them the advertised one:
 *
 *   - Opened from a named category, both tabs showed **the same list**.
 *     The player had already narrowed `channels` to that category before
 *     passing it here, so "all channels" had nothing wider to widen to.
 *   - Switched category in the phone's split view first, and the scoped
 *     tab showed **nothing at all**. `channels` was then the new
 *     category's while `categoryId` was still the route's, so the filter
 *     crossed two different categories and matched no channel — an empty
 *     list with "no results" on a lineup that was plainly there.
 *
 * Both fall out of filtering a list that has already been filtered. On
 * the TV build the panel simply trusts its input, which is the only
 * version of this that cannot disagree with the player.
 */
export function ChannelGuideOverlay({
  visible,
  onClose,
  channels,
  categoryId,
  currentChannelId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  /** Already scoped by the caller; the phone's tabs narrow it once more. */
  channels: LiveChannel[];
  /** Phone only — the TV build ignores it. See the doc comment. */
  categoryId: string | null;
  currentChannelId: string | null;
  onSelect: (channel: LiveChannel) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  /*
    `!isTvBuild` is the whole of the television change. With this false,
    `showAll` starts true, `scoped` collapses to `channels` and the tab
    row below does not render — so a TV shows one category and a phone is
    byte-for-byte what it was.
  */
  const hasCategory = !isTvBuild && Boolean(categoryId) && categoryId !== "all";
  const [showAll, setShowAll] = useState(!hasCategory);
  const listRef = useRef<FlatList<LiveChannel>>(null);

  /**
   * Reset to a clean state (scoped tab) each time the sheet
   * opens. Done during render — React's documented pattern for "adjusting
   * state when a prop changes" — rather than in a `useEffect`, since
   * calling setState synchronously inside an effect body forces an
   * avoidable second render pass (flagged by this project's
   * `react-hooks/set-state-in-effect` lint rule).
   */
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setShowAll(!hasCategory);
    }
  }

  const scoped = useMemo(
    () => (showAll || !hasCategory ? channels : channels.filter((c) => c.categoryId === categoryId)),
    [channels, showAll, hasCategory, categoryId]
  );

  /**
   * Scrolls to the playing channel **once per opening**, and never again.
   *
   * It used to depend on `currentChannelId`, which was harmless while the
   * list closed on every pick. Now that it stays open for zapping, that
   * dependency meant every channel chosen scrolled the list back to it —
   * so a viewer who scrolled down, picked something, and reached for the
   * next one found the list had jumped away under their thumb.
   *
   * Latched rather than keyed on `[visible]` alone so a re-render while
   * open cannot re-run it. After the list is on screen, the only thing that
   * moves it is a finger.
   */
  const positionedForOpenRef = useRef(false);
  const scopedRef = useRef(scoped);
  const currentChannelIdRef = useRef(currentChannelId);
  useEffect(() => {
    scopedRef.current = scoped;
    currentChannelIdRef.current = currentChannelId;
  });

  useEffect(() => {
    if (!visible) {
      positionedForOpenRef.current = false;
      return;
    }
    if (positionedForOpenRef.current) return;
    positionedForOpenRef.current = true;

    const index = scopedRef.current.findIndex((c) => c.providerItemId === currentChannelIdRef.current);
    if (index < 0) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
      } catch {
        // First-open layout race, not worth a retry loop — the list is still fully usable without it.
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} focusable={false} onPress={onClose}>
        <Pressable
          style={[styles.panel, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom }]}
          focusable={false}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t("liveGuide", "title")}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {hasCategory && (
            <View style={styles.tabs}>
              <Pressable style={[styles.tab, !showAll && styles.tabActive]} onPress={() => setShowAll(false)}>
                <Text style={[styles.tabText, !showAll && styles.tabTextActive]}>
                  {t("liveGuide", "thisCategoryTab")}
                </Text>
              </Pressable>
              <Pressable style={[styles.tab, showAll && styles.tabActive]} onPress={() => setShowAll(true)}>
                <Text style={[styles.tabText, showAll && styles.tabTextActive]}>
                  {t("liveGuide", "allChannelsTab")}
                </Text>
              </Pressable>
            </View>
          )}

          {scoped.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t("liveGuide", "noResults")}</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={scoped}
              keyExtractor={(item) => item.providerItemId}
              renderItem={({ item, index }) => (
                <ChannelListRow
                  channel={item}
                  index={index}
                  active={item.providerItemId === currentChannelId}
                  /*
                    Focus follows the playing channel on a remote, and on a
                    remote only: `hasTVPreferredFocus` calls
                    `requestFocus()` wherever it is set, so on a phone it
                    drew a focus ring on the active row for a viewer with no
                    cursor — and now that the list stays open while zapping,
                    it would redraw on every change.
                  */
                  tvFocusFirst={isTvBuild && item.providerItemId === currentChannelId}
                  /*
                    Tunes the channel. What happens to the list afterwards
                    is the caller's decision, not this row's — a phone
                    keeps it open for the next tap, a television closes it
                    behind the choice. See the player's `onSelect`.

                    Zapping through a lineup is what this list is for, and
                    closing after every pick meant reopening it for the next
                    one (requested 2026-09-16). The active row moves as the
                    channel changes, so the list doubles as the indicator of
                    where you are. Closing is still a tap on the backdrop
                    away from the list, the × button, or the back gesture —
                    all of which already existed.
                  */
                  onPress={() => onSelect(item)}
                />
              )}
              getItemLayout={(_, index) => ({
                length: CHANNEL_ROW_HEIGHT + CHANNEL_ROW_SPACING,
                offset: (CHANNEL_ROW_HEIGHT + CHANNEL_ROW_SPACING) * index,
                index,
              })}
              onScrollToIndexFailed={() => {}}
              initialNumToRender={16}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  panel: {
    backgroundColor: Colors.surface,
    borderTopStartRadius: Radii.xl,
    borderBottomStartRadius: Radii.xl,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    width: "42%",
    maxWidth: 420,
    height: "100%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  title: { color: Colors.text, fontSize: 16, fontFamily: FontFamily.extraBold },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: { color: Colors.text, fontSize: 15, fontFamily: FontFamily.bold },

  tabs: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md },
  /**
   * Fixed height + centered content + explicit `lineHeight`, same fix as
   * the category tab strips on the Live/Movies/Series screens: Noto Kufi
   * Arabic's ascender/descender metrics are tall enough at this size that
   * a `paddingVertical`-only pill clips the top and bottom of the label on
   * Android. This tab row used the old padding-only shape and was still
   * clipping when the other three were fixed.
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
  tab: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
  },
  tabActive: { backgroundColor: Brand.primaryMuted },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 22,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  tabTextActive: { color: Brand.primaryLight },


  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontFamily: FontFamily.regular },

});
