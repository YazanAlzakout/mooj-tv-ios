import { useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Categories as pages you can see past the edge of (2026-10-07).
 *
 * The category either side of the one you are on is **mounted and on screen**,
 * just off the edge, so a drag reveals it travelling in rather than swapping
 * the content once the finger lifts.
 *
 * ## Why this replaces `CategorySwipe`
 *
 * `CategorySwipe` moved a single list, faded it out, changed the data behind it
 * and faded it back. Its own comment defended that: a real pager "would hold two
 * lists of up to twenty thousand rows alive at once".
 *
 * That was wrong, though not by as much as the first version of this comment
 * then claimed in the other direction. A `FlatList` is virtualized: it mounts
 * the cells in its window and never the twenty thousand rows behind them. Three
 * pages is three windows, not sixty thousand rows — but it is genuinely three,
 * not "about what one page costs", which is what this file used to say. Three
 * pages of a three-column grid is on the order of a hundred and fifty mounted
 * cells against fifty. That is affordable; it is not free, and `active` below
 * exists because of the part that is not.
 *
 * ## Committing, and why it no longer waits
 *
 * The first version committed the category change inside the settling spring's
 * completion callback, so the data change waited out the whole animation — about
 * half a second, which is what the viewer reported as the strip lagging. Worse,
 * a second drag during that window cancelled the spring, the callback never ran,
 * and the page that had already arrived snapped back a full screen.
 *
 * So the commit now happens the instant the finger lifts, and the animation runs
 * **after** it. The effect below does the arithmetic that makes that invisible:
 * at the moment the category changes, every page's offset shifts by one screen
 * width, so adding that same width back to the row leaves every page exactly
 * where it already was. Then the row springs to nought. Nothing waits on
 * anything, and there is no completion callback left to lose.
 *
 * This is also what makes a drag interruptible: `startX` picks up wherever the
 * row happens to be, so a second swipe during the settle continues from there
 * instead of fighting it or being swallowed.
 */

/** Sideways travel before the pan takes the touch from the list. */
const ACTIVATE_X = 24;
/** Vertical travel that cancels the pan outright — this touch is a scroll. */
const FAIL_Y = 12;
/**
 * How much of the screen must be crossed to commit, as a fraction.
 *
 * A fraction rather than a fixed distance: with the next page visibly coming in,
 * the threshold is no longer something to be guessed at, it is something being
 * watched.
 */
const COMMIT_FRACTION = 0.2;
/** A flick may stand in for the distance, past this speed and this much travel. */
const COMMIT_VELOCITY = 700;
const FLICK_MIN_DISTANCE = 24;
/** At the first and last category there is nothing to reveal, so the row barely gives. */
const EDGE_RESISTANCE = 3;

/**
 * What the row settles on.
 *
 * Written in Reanimated 4's duration form on purpose. The first attempt used
 * `damping`/`stiffness`/`mass` with `restDisplacementThreshold` and
 * `restSpeedThreshold` — and those last two are **Reanimated 2 and 3 keys that
 * version 4 does not have**. They were ignored in silence, and TypeScript said
 * nothing because excess-property checking does not reach through an `as const`
 * variable. So the attempt to stop the spring crawling changed nothing, and the
 * spring went on ending only once its energy fell below `energyThreshold`, whose
 * default is 6e-9: a very long tail.
 *
 * `dampingRatio: 1` is critical damping and `overshootClamping` forbids passing
 * the target, which together are the calm settle without the bounce that was
 * asked for — and `duration` bounds it, so it cannot crawl again.
 */
const SETTLE = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;

/** How far a page off to the side sits back, at a full screen away. */
const PAGE_RECEDE = 0.06;
/** And how far it dims there. Both only ever reached by a page off the edge. */
const PAGE_DIM = 0.3;

/**
 * How long the commit is allowed not to arrive before the row is put back.
 *
 * The effect below runs when `activeId` changes. A screen that declines the
 * change — or sets it to the category already showing — would otherwise leave
 * the row displaced with nothing coming to straighten it.
 */
const STRANDED_MS = 400;

/**
 * How long new work is held off after a move, in milliseconds.
 *
 * The settle plus a margin. Everything a move costs — the arriving page's
 * artwork, and the mounting of the page beyond it — used to happen at the
 * instant of the commit, which is the instant the row starts moving, so the
 * viewer felt a stutter on every single swipe. None of it is urgent: the
 * page arriving is already built and already scrolled where it was left, so
 * the only thing it is waiting for is pictures, and the page beyond it is
 * not on screen at all.
 *
 * The cost of this is honest and worth naming: posters appear about a third
 * of a second after the page lands rather than during the slide. That is a
 * wait you can see, placed where nothing is moving, instead of a stutter in
 * the one moment that has to be smooth.
 */
const SETTLE_WORK_MS = 360;

/**
 * How many categories either side of the current one are kept mounted.
 *
 * One was not enough, and the reason is specific. Holding the window still
 * during a move only means "this move builds nothing" when the move starts
 * from rest — then the three mounted pages are already the three it needs.
 * Swipe again before the first move has settled and the centre advances onto
 * a page that was never built, so it is built at the instant the second slide
 * begins: exactly the stutter the hold exists to prevent, on every swipe of a
 * run after the first.
 *
 * Two means a run of two swipes needs nothing new. The two outer pages are a
 * full screen width beyond the edge, so they are never seen; they render
 * quiet and without artwork, which is four cells each. That is the price of
 * the stutter: eight cells per screen, built while nothing is moving.
 */
const PAGE_RADIUS = 2;

/**
 * One page, placed by its distance from the current category.
 *
 * A component of its own because the depth is computed per page on the UI
 * thread, and `react-hooks/static-components` forbids declaring a component
 * inside another one.
 */
function Page({
  offset,
  width,
  translateX,
  children,
}: {
  /** −1, 0 or +1: which side of the current category this page is. */
  offset: number;
  width: number;
  translateX: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const x = offset * width + translateX.value;
    const away = Math.min(1, Math.abs(x) / Math.max(1, width));
    return {
      transform: [{ translateX: x }, { scale: 1 - away * PAGE_RECEDE }],
      opacity: 1 - away * PAGE_DIM,
    };
  });

  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

export function CategoryPager({
  ids,
  activeId,
  onSelect,
  renderPage,
  progress,
  enabled = true,
  single = false,
}: {
  /** Every category in strip order, including whatever "All" chip the screen puts first. */
  ids: string[];
  activeId: string;
  onSelect: (id: string) => void;
  /**
   * Builds the list for one category.
   *
   * `artwork` is whether this page may fetch its images. It is false only
   * for the pages either side of a screen that has not been navigated yet:
   * three pages of posters fetching the moment a screen opens is three times
   * the traffic to a provider that answers a burst with empty 404s on every
   * endpoint, and two of those pages are for categories nobody has looked
   * at. After the first category change it is true for every page in the
   * window — see `warm`.
   */
  renderPage: (categoryId: string, artwork: boolean) => React.ReactNode;
  /**
   * Published to the chip strip so it travels with the finger: 0 at rest,
   * ±1 one page along, positive towards the next category.
   */
  progress?: SharedValue<number>;
  /** False on the television, which has no touchscreen. */
  enabled?: boolean;
  /**
   * Render the current category only, with no gesture and no neighbours.
   *
   * For the television, where the remote steps through the rail and three
   * focusable grids where there should be one would wreck focus.
   */
  single?: boolean;
}) {
  const { width } = useWindowDimensions();

  /*
    **Clamped, and that is not belt and braces.** `activeCategoryId` can name a
    category that is no longer in the strip: the screens restore a remembered
    one without checking it still exists, and the live list drops any category
    that has been hidden or has lost its last channel. `indexOf` then returns
    −1, every page is placed one screen to the right of where it belongs, and
    the content area — which clips — shows nothing at all while the header still
    reports a few hundred channels. Falling back to the first category means the
    worst case is the wrong category rather than a blank screen.
  */
  const found = ids.indexOf(activeId);
  const index = found < 0 ? 0 : found;

  const translateX = useSharedValue(0);
  /** Where the row was when the current gesture began, so a drag can interrupt a settle. */
  const startX = useSharedValue(0);
  const unwatched = useSharedValue(0);
  const drag = progress ?? unwatched;

  /* The gesture runs on the UI thread and cannot read React state. */
  const indexValue = useSharedValue(index);
  const countValue = useSharedValue(ids.length);
  const widthValue = useSharedValue(width);
  useEffect(() => {
    indexValue.value = index;
    countValue.value = ids.length;
    widthValue.value = width;
  }, [index, ids.length, width, indexValue, countValue, widthValue]);

  /**
   * The categories whose artwork has been let through, one at a time.
   *
   * Two wrong versions came before this, and the difference between them is
   * one page of images per move:
   *
   *   - gating on "is this page the active one" flips at the moment a
   *     category commits, so the page being left lost its posters while it
   *     was still sliding across the screen, and every return to a category
   *     paid for its images again;
   *   - a single flag for "the viewer has started moving" fixed that and
   *     opened the floodgate instead: the category *ahead*, which nobody
   *     had looked at yet, began loading too. Two pages of posters decoding
   *     during the animation rather than one, and the transition stopped
   *     being smooth.
   *
   * A page is let through when the viewer actually reaches it, and never
   * closed again. So a move costs exactly one page of artwork — the rate
   * the app fetched at before it had pages at all — while a page already
   * seen keeps what it has, and the unvisited neighbours of a screen that
   * has just opened still fetch nothing.
   *
   * **It starts empty, and seeding it was a real bug.** Seeding it with the
   * first `activeId` looks harmless and is not: on every browse screen that
   * first value is the "All" chip, held for the frame or two before the
   * catalogue loads and the screen moves to a real category. "All" is then
   * the left neighbour for ever, and being in this set it rendered at the
   * full window with artwork — the whole catalogue, twelve posters, fetching
   * beside the current category's twelve on every single screen open. That
   * is the two-page burst this mechanism exists to prevent, and the exact
   * arrangement rejected two commits ago for costing the transition its
   * smoothness. Nothing is lost by starting empty: a page that is active and
   * still gets its artwork from the second half of the test below.
   */
  const [seen, setSeen] = useState<Set<string>>(() => new Set<string>());
  /**
   * True from the moment a move commits until the row has stopped.
   *
   * While it is set, a page that is merely *active* does not get artwork —
   * only a page already in `seen` does. That is what keeps the arriving
   * page from fetching its posters during the slide. A category reached by
   * tapping a chip is unaffected, because nothing is moving then.
   */
  const [settling, setSettling] = useState(false);
  /**
   * Which category the mounted window is built around while the row moves.
   *
   * Only consulted during a move. The window is normally centred on the
   * current category, but that changes at the instant of the commit — which
   * is the instant the row starts moving — so the category beyond the one
   * arriving was mounted mid-animation, a whole page of grid cells built
   * during the one moment that has to be smooth. Holding the centre where
   * it was means the three pages already on screen are the three that stay
   * on screen: the page arriving was a neighbour a moment ago and is
   * already built, so the move mounts nothing at all.
   */
  const [windowCentre, setWindowCentre] = useState(index);
  /** Distinguishes the timer of the current move from an earlier one's. */
  const settleToken = useRef(0);

  /** +1 or −1 while a committed change is on its way to React; 0 otherwise. */
  const shift = useRef(0);

  const commit = (direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next >= ids.length) {
      translateX.value = withSpring(0, SETTLE);
      drag.value = withSpring(0, SETTLE);
      return;
    }
    shift.current = direction;
    /*
      An event, not a render. Both ends of the move go in: the one being
      reached, and the one being left — which matters when it was arrived at
      by tapping a chip rather than by a drag, and so was never recorded.
      Batched with `onSelect` below into the single render the commit
      already causes.
    */
    const arriving = ids[next];
    /*
      The page being left is recorded so that it keeps its posters while it
      slides away — but only if it has any. Mid-run it does not: it arrived
      moments ago, its own timer has not fired, and it is still quiet and
      imageless. Recording it then did the opposite of what this line is for,
      flipping it from four cells to twelve and starting a full page of
      poster requests at the instant the next slide began, for a category
      already being left behind.
    */
    if (!settling && !seen.has(activeId)) setSeen(new Set(seen).add(activeId));
    /*
      Only on the first move of a run. Advancing it on every move is what
      walked the window onto an unbuilt page mid-animation; leaving it where
      the run started keeps the mounted set still for as long as the run
      stays inside `PAGE_RADIUS`.
    */
    if (!settling) setWindowCentre(index);
    setSettling(true);
    const token = settleToken.current + 1;
    settleToken.current = token;
    onSelect(arriving);
    setTimeout(() => {
      /* A later move has already taken over; that one owns the end of it. */
      if (settleToken.current !== token) return;
      setSettling(false);
      setSeen((already) => (already.has(arriving) ? already : new Set(already).add(arriving)));
    }, SETTLE_WORK_MS);
    /*
      If the screen declines the change, nothing will straighten the row. One
      timer per commit is a cheap price for never leaving the grid displaced.
    */
    setTimeout(() => {
      if (!shift.current) return;
      shift.current = 0;
      translateX.value = withSpring(0, SETTLE);
      drag.value = withSpring(0, SETTLE);
    }, STRANDED_MS);
  };

  const pan = Gesture.Pan()
    .enabled(enabled && !single && ids.length > 1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onBegin(() => {
      "worklet";
      /* Take over from wherever the row is, mid-settle or at rest. */
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      "worklet";
      const w = Math.max(1, widthValue.value);
      let x = startX.value + event.translationX;
      const atStart = indexValue.value <= 0 && x > 0;
      const atEnd = indexValue.value >= countValue.value - 1 && x < 0;
      /* Nothing to reveal that way, so the row gives only a third as far. */
      if (atStart || atEnd) x = x / EDGE_RESISTANCE;
      translateX.value = x;
      /* The strip follows the same journey, measured in pages rather than pixels. */
      drag.value = -x / w;
    })
    /*
      `commit` reads and writes `shift`, and handing it to `runOnJS` here looks
      to `react-hooks/refs` like a ref escaping into render. It is not: the only
      caller is this gesture's end, and `commit` never runs while this component
      renders.
    */
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event, success) => {
      "worklet";
      const w = Math.max(1, widthValue.value);
      /*
        **Measured from this gesture alone, never from where the row happens
        to be.**

        `startX` exists so a drag can pick the row up mid-settle and carry on
        from there; it has no business in the decision. Reading the decision
        from `startX + translationX` inverted it: after a commit the row is
        re-based a full screen width and springs home over 300 ms, so a drag
        begun in the first half of that window started with the threshold
        already crossed and with the sign of the *leftover offset* rather
        than of the finger. Swiping forward twice in quick succession landed
        back on the category it started from.
      */
      const distance = Math.abs(event.translationX);
      const flicked =
        Math.abs(event.velocityX) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;

      /*
        A flick takes its direction from the velocity, everything else from how
        far the row has actually moved. Reading direction from displacement
        alone sent a reversing flick — dragged one way, thrown back the other —
        to the category opposite the one it was thrown towards.
      */
      const forward = flicked ? event.velocityX < 0 : event.translationX < 0;
      const target = indexValue.value + (forward ? 1 : -1);
      const blocked = target < 0 || target >= countValue.value;

      if (!success || blocked || (distance < w * COMMIT_FRACTION && !flicked)) {
        translateX.value = withSpring(0, SETTLE);
        drag.value = withSpring(0, SETTLE);
        return;
      }

      /*
        No animation here on purpose: the effect below re-bases the row the
        moment React has the new category, and animating first would be a race
        against it. See "committing, and why it no longer waits".
      */
      runOnJS(commit)(forward ? 1 : -1);
    });

  /*
    The category has changed, so every page's offset has moved by one screen
    width. Adding that width back leaves every page exactly where it already
    was, and the row then springs to nought from there — which is the whole
    transition, happening entirely after the commit rather than before it.

    `react-hooks/immutability` sees `drag` as an ordinary local because the `??`
    above erases what `useSharedValue` returned; mutation across renders is the
    entire contract of a shared value.
  */
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    const moved = shift.current;
    if (!moved) return;
    shift.current = 0;
    translateX.value = translateX.value + moved * widthValue.value;
    translateX.value = withSpring(0, SETTLE);
    drag.value = drag.value - moved;
    drag.value = withSpring(0, SETTLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /*
    `single` is the television. The empty list is the moment between a
    catalogue arriving and its categories arriving: there is nothing to page
    between yet, and the window loop below would produce no pages at all, so
    the screen would be blank while holding a full catalogue.
  */
  if (single || ids.length === 0) {
    return <View style={styles.fill}>{renderPage(activeId, true)}</View>;
  }

  /*
    The current category and the one either side. Keyed by category id, so a
    page keeps the same component — and with it its list, its cells and
    wherever the viewer had scrolled it — as the window moves across it.

    While the row is moving the centre is held one behind, so the window is
    the same three pages that were already mounted and the move builds
    nothing. The instant it is not moving the centre is the current category
    again, which is also what makes a chip tap — where nothing moves and
    `settling` is never set — land on a correct window immediately.
  */
  const held = settling ? windowCentre : index;
  /*
    The hold gives way only as far as it must, and no further. A run longer
    than the radius — or anything that moves the category without a drag —
    would put the page being looked at outside the window, and not mounting
    the page on screen is a blank screen, which is worse than any stutter.

    Dragging the centre to the nearest value that still contains `index`,
    rather than jumping it onto `index`, is what keeps that cheap: the
    window slides by one and mounts one page. Jumping would move it by the
    whole distance and mount the radius over again — three pages at once on
    the third swipe of a run, which is worse than the behaviour being fixed.
  */
  const centre = Math.min(Math.max(held, index - PAGE_RADIUS), index + PAGE_RADIUS);
  const windowIds: string[] = [];
  for (let i = centre - PAGE_RADIUS; i <= centre + PAGE_RADIUS; i++) {
    if (i >= 0 && i < ids.length) windowIds.push(ids[i]);
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>
        {windowIds.map((id) => (
          <Page key={id} offset={ids.indexOf(id) - index} width={width} translateX={translateX}>
            {renderPage(id, seen.has(id) || (!settling && id === ids[index]))}
          </Page>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
});
