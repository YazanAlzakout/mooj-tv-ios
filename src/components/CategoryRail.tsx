import { useCallback, useEffect, useRef } from "react";
import { FlatList, StyleSheet, Text } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { BouncePressable } from "@/components/BouncePressable";
import type { CategoryTabItem } from "@/components/CategoryTabs";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

/**
 * The rail's full horizontal footprint, border included.
 *
 * **Exported because the grid beside it must subtract this.** A grid works
 * out its column width from the width it is given and hands the resulting
 * row height to `getItemLayout`, which FlatList trusts absolutely — it
 * never measures a row itself. A grid left reading the window width while
 * this rail takes a fifth of it declares every row too tall, the error
 * compounds with each row scrolled, and some way down the list the cells
 * are placed rows away from where they are drawn: black bands, and
 * scrolling that fights the finger. That exact bug has already happened
 * once on the television rail; see TV_RAIL_WIDTH.
 *
 * 84, not the television's 241. A remote reads a rail from three metres and
 * needs the room; a thumb reads it from thirty centimetres, and every pixel
 * here is a pixel off the artwork, which is the thing people actually came
 * to look at.
 */
export const PHONE_RAIL_WIDTH = 84;

/**
 * The category list as a column down the side of the screen.
 *
 * The app this was cloned from puts categories in a horizontal strip above
 * the grid, where four fit and the rest are a sideways scroll nobody
 * discovers. A column shows eight at once and makes the fact that there are
 * more self-evident, because the list visibly continues past the bottom
 * edge.
 *
 * ## Not the television's rail
 *
 * `CategorySidebar` exists and does this job for Android TV, and it is the
 * wrong component here. It is built around a D-pad: selection follows
 * focus, with a 200ms delay so that walking through ten categories does not
 * queue ten re-filters of the provider's whole lineup. A tap has no such
 * problem — it is already a decision — so none of that machinery earns its
 * place on a phone, and its 241dp width would take more than half of one.
 *
 * ## It follows, it does not lead
 *
 * A sideways swipe on the grid still changes category, and when it does,
 * this rail scrolls the new one into view. It does not try to move *with*
 * the drag the way the horizontal strip does: that strip and the content
 * travel on the same axis, so coupling them reads as one object. A vertical
 * rail coupled to a horizontal drag reads as a glitch.
 */
export function CategoryRail({
  categories,
  activeId,
  onSelect,
}: {
  categories: CategoryTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<FlatList<CategoryTabItem> | null>(null);
  const index = categories.findIndex((c) => c.id === activeId);

  useEffect(() => {
    if (index < 0) return;
    /*
     * `viewPosition: 0.5` centres it rather than merely bringing it on
     * screen, so the categories either side of the current one are visible
     * and the rail reads as a place you are *in* rather than a list that
     * happened to stop scrolling.
     *
     * Wrapped because scrolling to an index FlatList has not rendered yet
     * throws rather than queueing, and on a cold mount that is a race this
     * cannot win. A missed scroll costs a viewer one flick; an unhandled
     * throw costs them the screen.
     *
     * And retried, which it was not. "The next change will catch it" is
     * only true if there is a next change: the case that loses is the
     * common one — the rail mounts, the remembered category is forty rows
     * down, the first attempt is refused because nothing is measured yet,
     * and nothing ever asks again. The viewer is then looking at a rail
     * whose highlighted chip is off screen. Three attempts, 120ms apart,
     * cover the first measurement batch and cost nothing when the first
     * one works.
     */
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const centre = () => {
      try {
        listRef.current?.scrollToIndex({ index, animated: attempt > 0, viewPosition: 0.5 });
      } catch {
        if (attempt >= 2) return;
        attempt += 1;
        timer = setTimeout(centre, 120);
      }
    };

    centre();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [index]);

  const renderItem = useCallback(
    ({ item }: { item: CategoryTabItem }) => (
      <Chip item={item} active={item.id === activeId} onSelect={onSelect} />
    ),
    [activeId, onSelect]
  );

  return (
    <FlatList
      ref={listRef}
      {...NO_CLIP}
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.rail}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      /*
       * Without this a failed `scrollToIndex` is an unhandled rejection.
       * Falling back to an offset is approximate — items are not a fixed
       * height because a long category name wraps to two lines — but
       * approximate and on screen beats exact and crashed.
       */
      onScrollToIndexFailed={({ index: i, averageItemLength }) => {
        /*
         * `averageItemLength` is 0 before anything has been measured, and
         * an offset of `i * 0` is the top of the list — which is both
         * wrong and indistinguishable from success, so the rail would sit
         * at the top with its chosen chip somewhere below. Ignore it and
         * let the retry above have its turn.
         */
        if (averageItemLength <= 0) return;
        listRef.current?.scrollToOffset({ offset: i * averageItemLength, animated: true });
      }}
    />
  );
}

/**
 * Memoised, and the callback takes the id rather than closing over it.
 *
 * Changing category re-renders the rail, and without this every chip in it
 * re-renders too — on a provider with ninety categories that is ninety
 * re-renders to move one highlight, on the same frame the grid is already
 * re-filtering thousands of items. The same mistake, and the same fix, as
 * the horizontal strip.
 */
const Chip = ({
  item,
  active,
  onSelect,
}: {
  item: CategoryTabItem;
  active: boolean;
  onSelect: (id: string) => void;
}) => (
  <BouncePressable
    style={[styles.chip, active && styles.chipActive]}
    onPress={() => onSelect(item.id)}
    accessibilityLabel={item.name}
  >
    {/*
      Three lines, not two. At 84dp a name like "ARABIC VOD NEW" wraps past
      two and was being cut to "ARABIC VOD NEW…", which is the half that
      tells you nothing — every category in that provider starts the same
      way and differs at the end.
    */}
    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={3}>
      {item.name}
    </Text>
  </BouncePressable>
);

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    rail: {
      width: PHONE_RAIL_WIDTH,
      flexGrow: 0,
      flexShrink: 0,
      borderLeftWidth: 1,
      borderLeftColor: C.border,
    },
    content: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, gap: Spacing.xs },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.xs,
      borderRadius: Radii.md,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: "transparent",
    },
    chipActive: {
      backgroundColor: Brand.primary,
      borderColor: Brand.primaryLight,
    },
    chipText: {
      color: C.textSecondary,
      fontFamily: FontFamily.medium,
      fontSize: 11,
      lineHeight: 15,
      textAlign: "center",
      ...AndroidTextFix,
    },
    chipTextActive: { color: "#02121F", fontFamily: FontFamily.bold },
  })
);
