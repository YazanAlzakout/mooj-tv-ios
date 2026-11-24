import { createContext, memo, useCallback, useContext, useEffect, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type CellRendererProps,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { NO_CLIP } from "@/core/layout/listWindow";

import { BouncePressable } from "@/components/BouncePressable";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";

export interface CategoryTabItem {
  id: string;
  name: string;
}

/**
 * The horizontal category strip shared by every browsing surface.
 *
 * Two details here are load-bearing and were each found the hard way:
 * `minHeight` rather than a fixed height, because a mixed Arabic/Latin
 * category name measures a taller line box than a plain-Arabic one and a
 * fixed height can only clip that; and a solid fill for the active tab
 * rather than a tinted background plus a hairline border, because Android
 * anti-aliases a thin stroke on a fully rounded pill inconsistently and it
 * rendered as a visibly broken ring.
 *
 * ## Following the finger (2026-10-07)
 *
 * The strip takes an optional `progress` from `CategorySwipe`: a number
 * running from 0 to ±1 as a sideways drag crosses the distance that commits
 * a category change. While it is non-zero the strip scrolls to match, so the
 * chips travel under the finger at the same rate as the content and the two
 * read as one object rather than a list with a menu bolted above it.
 *
 * **The scroll target is absolute, never a delta, and that is what makes the
 * handover invisible.** At the end of a committed drag the strip sits at
 * `centre(i) + 1 × (centre(i+1) − centre(i))`, which is exactly `centre(i+1)`.
 * The category then changes, `progress` returns to 0, and the new resting
 * target is `centre(i+1)` — the same pixel. So it does not matter whether
 * React commits the new category before or after the animation reaches the
 * end, and no ordering between the two has to be arranged or defended.
 *
 * It runs entirely on the UI thread: `useAnimatedReaction` reads the shared
 * value and `scrollTo` moves the list, so a drag costs no JavaScript at all.
 *
 * ## Why the positions are measured rather than calculated
 *
 * The chips are content-width — a category name sets its own pill — so the
 * only way to know where one sits is to measure it. The measurement is taken
 * on the list's *cell*, not on the chip inside it: a `FlatList` wraps every
 * item, so a chip's own `onLayout` reports an x relative to that wrapper,
 * which is always nought and tells us nothing. The cell is a direct child of
 * the content container, so its x is the one we want.
 *
 * Measuring also sidesteps the direction question. Arabic forces a
 * right-to-left layout, where the first chip is the rightmost and x counts
 * down rather than up; measured positions and `scrollTo` are both physical,
 * so the same arithmetic holds in both languages without a special case —
 * the same reasoning as the television build's own chip strip.
 *
 * A chip too far away to be mounted has no measurement, and the strip then
 * falls back to `scrollToIndex`, which is also the path a tap takes.
 */

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<CategoryTabItem>);

/**
 * How many times a refused scroll is retried, and how long apart.
 *
 * A `FlatList` renders in batches, so a chip far along the strip becomes
 * measurable a few batches after the screen appears rather than at once.
 * Six attempts a fifth of a second apart give it a little over a second,
 * which covers a strip of any length the provider offers — and they stop,
 * so a chip that never measures cannot retry for ever.
 */
const MAX_SCROLL_ATTEMPTS = 6;
const SCROLL_RETRY_MS = 200;

/** Reports a cell's measured box. Null on the television, where nothing drags. */
const CellMeasure = createContext<((index: number, x: number, width: number) => void) | null>(null);

/**
 * The list's cell wrapper, so the measurement is taken where the geometry is.
 *
 * Declared at module scope because `react-hooks/static-components` forbids
 * creating a component type during a render, and reached through a context
 * rather than a prop because `CellRendererComponent` is given as a type, not
 * as an element — there is nowhere to pass it anything.
 */
function MeasuredCell({
  index,
  style,
  children,
  onLayout,
}: CellRendererProps<CategoryTabItem>) {
  const report = useContext(CellMeasure);
  /*
    `onFocusCapture` is the one cell prop not forwarded. It exists for
    television focus management, its React Native type does not agree with
    the one `View` accepts, and this strip is never rendered on the
    television — the grids put it behind `isTvBuild` and the split player is
    a phone layout. Forwarding it would mean a cast for something that cannot
    be reached.
  */
  return (
    <View
      style={style}
      onLayout={(event: LayoutChangeEvent) => {
        /* The list's own handler first — it is how a cell gets measured at all. */
        onLayout?.(event);
        report?.(index, event.nativeEvent.layout.x, event.nativeEvent.layout.width);
      }}
    >
      {children}
    </View>
  );
}

/**
 * One chip.
 *
 * A component of its own, memoised, because the strip is a scrolling list
 * and every chip inside it is a `BouncePressable` — which means a shared
 * value and an animated style per chip, created when it mounts. That is the
 * exact cost this project removed from the browse grids and wrote down at
 * the top of `MoviePoster`: "per-cell entrance animations plus per-cell
 * Reanimated values re-fire on every recycle during scroll, which is what
 * made scrolling stutter". The strip was left doing it, and it measures:
 * a hard fling of the strip costs more than a hard fling of the channel
 * list beneath it, which carries images.
 *
 * Memoising does not remove that cost on a genuine mount — nothing can,
 * short of dropping the bounce — but it stops every mounted chip paying it
 * again on each render of the strip, which is what a category change used
 * to do to all of them at once.
 *
 * `memo(function …)` rather than an arrow: `react/display-name` wants a
 * named function here.
 */
/*
 * Subscribed to the theme individually, unlike the grid cells.
 *
 * A memoised child does not re-render when its parent does, so a theme
 * change leaves it painted in the old palette — see the note on the grid
 * lists' `key`. Those rebuild the whole list instead; a strip of chips has
 * no key to hang that on and is small enough that one subscription each is
 * cheaper than the alternative.
 */
const Chip = memo(function Chip({
  id,
  name,
  active,
  alwaysDark,
  onSelect,
}: {
  id: string;
  name: string;
  active: boolean;
  alwaysDark: boolean;
  /** Takes the id, so the chip is handed one stable function rather than a new closure. */
  onSelect: (id: string) => void;
}) {
  useThemeRerender();
  const press = useCallback(() => onSelect(id), [onSelect, id]);
  return (
    <BouncePressable
      style={[styles.tab, alwaysDark && styles.tabDark, active && styles.tabActive]}
      onPress={press}
    >
      <Text
        style={[styles.tabText, alwaysDark && styles.tabTextDark, active && styles.tabTextActive]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </BouncePressable>
  );
});

export function CategoryTabs({
  categories,
  activeId,
  alwaysDark = false,
  onSelect,
  progress,
}: {
  categories: CategoryTabItem[];
  activeId: string;
  /**
   * Forces the dark palette regardless of the theme.
   *
   * Set by the split live layout, whose surroundings are pinned dark like
   * every other player surface. Themed, this strip turned into
   * `rgba(0,0,0,0.05)` pills with grey labels on a near-black page in light
   * mode — invisible. It is also the one themed component rendered inside a
   * screen that does not subscribe to theme changes.
   */
  alwaysDark?: boolean;
  onSelect: (id: string) => void;
  /**
   * How far a sideways drag has travelled, from `CategorySwipe`: 0 at rest,
   * ±1 at the point a category change commits, positive towards the next
   * category in strip order. Omitted on the television, where there is no
   * touchscreen and the strip is stepped with a remote.
   */
  progress?: SharedValue<number>;
}) {
  const listRef = useAnimatedRef<FlatList<CategoryTabItem>>();
  /**
   * The pending retry, so a category change can call it off.
   *
   * Nothing held it before, so a chain armed for the old chip went on
   * firing `scrollToIndex` for the old index after the category had
   * changed — dragging the strip back to where it had just come from for
   * as long as a second. Resetting the counter made it worse: the old
   * chain's next failure read as a fresh one and was given six more
   * attempts of its own.
   */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which chip the list has refused to scroll to, and how often. See the handler. */
  const retried = useRef({ index: -1, count: 0 });
  const activeIndex = categories.findIndex((category) => category.id === activeId);

  /*
    Stands in when no drag is wired up, so the reaction below is always
    installed with a real shared value and the hook order never varies.
    Nothing writes it, so the reaction simply never acts.
  */
  const atRest = useSharedValue(0);
  const drag = progress ?? atRest;

  /*
    **The measurements live in plain refs, and only three numbers cross to
    the UI thread.**

    The first version kept every measured box in a shared value, as one
    object rebuilt on each cell's layout: `boxes.value = { ...boxes.value,
    [i]: box }`. That is a read-modify-write of a value that lives in two
    runtimes, run once per cell and dozens of times in a single layout pass,
    and it is not safe to assume each write is visible to the next read. A
    whole batch could collapse to a single entry, after which the reaction
    below found no box for the active chip and did nothing at all.

    It was also more than was ever needed. The reaction only interpolates
    between the current chip and the one it is heading for, so three numbers
    are enough. They are computed here, on the thread that does the
    measuring, and only the results are published.
  */
  const boxes = useRef(new Map<number, { x: number; width: number }>());
  const stripWidth = useRef(0);
  const contentWidth = useRef(0);
  const activeIndexRef = useRef(activeIndex);

  /** Scroll offsets that centre the current chip and its two neighbours; −1 means unknown. */
  const hereCentre = useSharedValue(-1);
  const prevCentre = useSharedValue(-1);
  const nextCentre = useSharedValue(-1);

  const centreOf = useCallback((index: number) => {
    const box = boxes.current.get(index);
    const viewport = stripWidth.current;
    if (!box || viewport <= 0) return -1;
    const limit = Math.max(0, contentWidth.current - viewport);
    return Math.max(0, Math.min(limit, box.x + box.width / 2 - viewport / 2));
  }, []);

  /** Publish the three offsets the reaction needs. Cheap, and only on layout. */
  const publish = useCallback(() => {
    const index = activeIndexRef.current;
    hereCentre.value = centreOf(index);
    prevCentre.value = centreOf(index - 1);
    nextCentre.value = centreOf(index + 1);
    /*
      The shared values are deliberately absent: each is one stable object
      for the life of the component, and naming it would forbid writing to
      it under `react-hooks/immutability`, which is an error here where
      `exhaustive-deps` is only a warning.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreOf]);

  /*
    Stable, and that matters more than it looks.

    This is the context value every cell reads, so a new function on each
    render re-rendered every mounted chip — on every category change, which
    is exactly when the strip is also scrolling itself to the new chip and
    the list below it is swapping its data.
  */
  const report = useCallback(
    (index: number, x: number, width: number) => {
      const known = boxes.current.get(index);
      if (known && known.x === x && known.width === width) return;
      boxes.current.set(index, { x, width });
      publish();
    },
    [publish]
  );

  const onStripLayout = (event: LayoutChangeEvent) => {
    stripWidth.current = event.nativeEvent.layout.width;
    publish();
  };

  const onContentSizeChange = (width: number) => {
    contentWidth.current = width;
    publish();
  };

  const bring = (index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  };

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    publish();
  }, [activeIndex, publish]);

  /*
    **The chosen chip is always in view.**

    Until the sideways drag existed, the only way to change category was to
    tap a chip — necessarily one already on screen — so the strip never had
    to move and nothing here scrolled it. A drag can choose a chip that is
    off the end, and then the only sign anything had happened was the
    content changing under the finger, with the strip above still showing
    the old category filled in.

    This runs for every category change, a drag included, and **must not be
    made conditional on the drag.** It was, briefly: the reaction below was
    supposed to have already placed the strip, so this stood aside to avoid a
    second competing scroll. The two then failed together — the reaction did
    nothing for its own reasons and this had disarmed itself — and the strip
    sat perfectly still through a swipe that was otherwise working. One path
    doing redundant work is nothing; two paths that can only work together
    are a single point of failure with extra steps.

    There is no conflict to avoid anyway. This fires once per category
    change, never during a drag, and when the reaction has done its job the
    chip is already centred — so this asks for a scroll to where the strip
    already is, which costs nothing and shows nothing.
  */
  useEffect(() => {
    if (activeIndex < 0) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    retried.current = { index: -1, count: 0 };
    bring(activeIndex);
    /*
      `bring` and the shared values are stable for the life of the component,
      and `react-hooks/immutability` forbids writing to anything a dependency
      array names — which the measurement callbacks must do.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  /*
    The strip under the finger. See "Following the finger" above for why the
    target is absolute. `centre` returns null for a chip that has never been
    mounted and so never measured, and the reaction then stands down and
    leaves the settling effect to do the work.
  */
  useAnimatedReaction(
    () => drag.value,
    (p, previous) => {
      "worklet";
      /*
        Nought and not coming from a drag: the strip is at rest and this is a
        tap or a category chosen elsewhere, which the settling effect
        animates. Nought *after* a drag is the end of one, and is handled —
        it is what puts the strip exactly on the chip when the neighbour was
        never measured and the interpolation could not reach it.
      */
      if (p === 0 && !previous) return;

      /*
        Three numbers, no object, no helper function. A function declared
        inside a worklet is workletized in its own right by the Babel plugin,
        so building one on the UI thread on every frame of a drag is how an
        earlier version of this reaction came to do nothing at all while
        raising nothing a log would show.
      */
      const from = hereCentre.value;
      if (from < 0) return;
      if (p === 0) {
        scrollTo(listRef, from, 0, false);
        return;
      }

      const to = p > 0 ? nextCentre.value : prevCentre.value;
      scrollTo(listRef, to < 0 ? from : from + Math.abs(p) * (to - from), 0, false);
    }
  );

  return (
    <CellMeasure.Provider value={report}>
      <AnimatedFlatList
        {...NO_CLIP}
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        /*
          The strip is a ScrollView too, so it ate the first tap as well.

          With the soft keyboard up — which is every tap taken straight after
          typing in the Live TV, Movies or Series search box — React Native's
          default `"never"` lets this list capture the touch to dismiss the
          keyboard, and the chip underneath never sees it: the viewer presses a
          category, the keyboard closes, nothing changes, and they press again.
          `"handled"` hands the touch to the chip and still dismisses the
          keyboard on a tap that lands on the strip's own padding.

          Found on Live TV 2026-11-17, fixed here because the same tap was
          being eaten on every screen that draws this strip.
        */
        keyboardShouldPersistTaps="handled"
        onLayout={onStripLayout}
        onContentSizeChange={onContentSizeChange}
        CellRendererComponent={MeasuredCell}
        onScrollToIndexFailed={(info) => {
          /*
            A chip too far along to have been mounted has no measured frame,
            so the list refuses rather than guess.

            The first refusal of a screen is special and the first version of
            this got it wrong (review, 2026-10-07). It arrives before any cell
            has reported its layout, so `averageItemLength` is nought, the
            estimate below is nought times the index — that is, the start of
            the strip — and nothing new is mounted by going there. Spending
            the one retry on that attempt meant a chip past about the tenth
            was never centred at all: the retry fired while only the first
            batch had been measured, failed in turn, and the guard then
            silenced every refusal after it. Opening Live TV on a remembered
            category half way along the strip did exactly that.

            So: ignore an estimate of nought, and allow a handful of attempts
            rather than one. Measurement arrives in batches, and a few
            unhurried tries cover a strip of any length — while still ending,
            which is what the counter is for.
          */
          const attempt = retried.current;
          if (attempt.index !== info.index) {
            attempt.index = info.index;
            attempt.count = 0;
          }
          if (attempt.count >= MAX_SCROLL_ATTEMPTS) return;
          attempt.count += 1;
          if (info.averageItemLength > 0) {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            bring(info.index);
          }, SCROLL_RETRY_MS);
        }}
        data={categories}
        keyExtractor={(item) => item.id}
        style={styles.strip}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Chip
            id={item.id}
            name={item.name}
            active={activeId === item.id}
            alwaysDark={alwaysDark}
            onSelect={onSelect}
          />
        )}
      />
    </CellMeasure.Provider>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  /**
   * `flexGrow: 0` is load-bearing. A horizontal FlatList is still a
   * ScrollView, and inside a flex column it will happily expand past its
   * content — with the pills centred inside, that showed up as a large
   * empty band above and below the strip rather than as a scroll area.
   * The height stays content-driven, so a taller label still fits.
   */
  /*
    `direction: "ltr"` pins the chip order in every language, and it is
    there to kill a whole class of bug rather than for looks.

    Arabic forces a right-to-left layout, where the first chip is the
    rightmost and x counts down. Measured positions and scroll offsets are
    physical and count up, so the two ran opposite each other: the strip
    hit a boundary and jammed, and a drag chose the category on the far
    side of the one it pointed at. Pinning the direction makes the
    gesture, the chip order and the scroll arithmetic agree everywhere,
    with no language branch left anywhere in the feature.

    The cost is named plainly: in Arabic the first category now sits on
    the left. That is against the grain of an Arabic interface, and it is
    the price of one behaviour in every language, agreed with the owner
    on 2026-10-07.
  */
  strip: { flexGrow: 0, direction: "ltr" },
  list: {
    direction: "ltr",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    alignItems: "center",
  },
  /**
   * Half the height it started at, and without the hairline border: the
   * strip is a filter, not a row of buttons competing with the content
   * under it. `minHeight` still, never a fixed height — a mixed
   * Arabic/Latin name measures a taller line box than a plain-Arabic one.
   */
  tab: {
    minHeight: 30,
    justifyContent: "center",
    maxWidth: 200,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
  },
  tabDark: { backgroundColor: "rgba(255,255,255,0.06)" },
  tabActive: { backgroundColor: Brand.primary },
  tabText: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  tabTextDark: { color: "#9CA3AF" },
  tabTextActive: { color: "#fff" },
  })
);
