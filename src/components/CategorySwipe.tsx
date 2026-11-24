import { useEffect, useRef } from "react";
import { I18nManager, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Changing category by dragging the content sideways, on every browse
 * screen (2026-10-06).
 *
 * The strip of chips at the top stays exactly as it was; this is a second
 * way to reach the same thing, for a thumb that is already on the list.
 * The strip is deliberately outside this view, so it holds still while the
 * content moves and can follow the chosen chip in its own time — see
 * `CategoryTabs`, which scrolls that chip to the middle.
 *
 * ## Why it does not fight the vertical scroll
 *
 * This is the whole difficulty, and it is why the gesture is built with
 * `react-native-gesture-handler` rather than the responder system the
 * player's own gestures use. A `FlatList` is a native scroll view: once it
 * has decided a touch is a scroll it keeps it, and the responder system
 * cannot take it back cleanly. `activeOffsetX` / `failOffsetY` settle the
 * question *before* either side commits — the pan only becomes active after
 * a clear sideways movement, and is cancelled outright the moment the
 * finger moves vertically first. One of the two always wins, immediately,
 * and never both.
 *
 * ## The distances
 *
 * Android defines 160 dp as one inch, so a centimetre is about 63 dp. The
 * viewer asked for a deliberate drag of roughly one to one and a half
 * centimetres rather than a twitch, which is `COMMIT_DISTANCE` below. The
 * other numbers exist to make that one feel right: the gesture takes over
 * well before the commit point so the movement is visible while it is
 * being made, a fast flick is allowed to stand in for the distance but only
 * once it has travelled far enough not to be an accident, and a drag that
 * stops short springs back so nothing happens by halves.
 *
 * ## The transition, and the bug that shaped it
 *
 * Out in the direction of travel, accelerating, fading and **falling back**;
 * the data changes while nothing is on screen; in from the opposite side and
 * from the same depth, on a **spring**. Leaving quickly and arriving slowly
 * is what separates a transition from a slide — a symmetrical one reads as
 * mechanical however long it lasts.
 *
 * Depth and spring were added after the first version was called smooth but
 * dated (2026-10-07), and that was a fair reading. It moved two properties,
 * position and opacity, on one family of duration curves. Nothing in it
 * suggested that the content had anywhere to go *except* sideways, and a
 * duration curve ends at a moment chosen in advance — which is what reads as
 * mechanical even when every frame is on time. Receding gives the swap a
 * third dimension to happen in, and a spring ends when the motion is spent
 * rather than when a timer says so. The same pair under the finger, a
 * hundredth and a half of recede against a drag, is what turns the content
 * from a view being slid into a card being pushed.
 *
 * **One list exists at any moment.** A true sliding pager would hold two
 * lists of up to twenty thousand rows alive at once, on the screens this
 * project has twice had to repair for stuttering.
 *
 * The first version ran the arrival from inside the gesture completion
 * worklet — on the UI thread, while `runOnJS` was still on its way to React
 * with the category change. So the content that slid in and faded up was
 * the *old* category for the first frames and swapped in plain view part
 * way through, which is precisely the cheapness the viewer was reacting to.
 * The arrival now waits for the committed `activeId` (the effect at the
 * bottom), which is the only moment at which the thing coming in is certain
 * to be the thing that was asked for.
 *
 * Everything else runs on the UI thread as shared values, so the JavaScript
 * thread is touched twice per change: once to commit the category, once to
 * start the arrival.
 *
 * ## Why nothing here is memoised
 *
 * `commit` and the gesture are both built in plain render code, which looks
 * like an oversight and is not. This project lints with the React Compiler
 * rules, where `react-hooks/immutability` and `react-hooks/refs` are errors,
 * and both treat whatever a hook captures as frozen for the life of that
 * hook. A shared value exists in order to be written, so wrapping either one
 * in `useMemo` or `useCallback` makes every `translateX.value = …` an error.
 * The cost of doing it this way is a gesture object rebuilt whenever the
 * content area re-renders — which is a category change, not a scroll.
 */

/** Sideways travel before the pan takes the touch from the list. */
const ACTIVATE_X = 24;
/** Vertical travel that cancels the pan outright — this touch is a scroll. */
const FAIL_Y = 12;
/** The deliberate drag: about 1.15 cm at Android 160 dp to the inch. */
const COMMIT_DISTANCE = 72;
/** A flick may stand in for the distance, but only past this speed… */
const COMMIT_VELOCITY = 900;
/** …and only once it has gone at least this far, so a twitch never counts. */
const FLICK_MIN_DISTANCE = 40;
/** How far the content may follow the finger. Beyond this it stops moving. */
const MAX_FOLLOW = 96;
/** The most it dims while the finger is down, reached at full follow. */
const DRAG_DIM = 0.06;
/**
 * How far the content recedes under a finger, reached at full follow.
 *
 * A hair over one part in a hundred, which sounds like nothing and is the
 * whole difference between pushing a page and pushing a *card*. Any more and
 * it stops being a surface being moved and starts being an effect.
 */
const DRAG_RECEDE = 0.015;

/** How far it carries on in the direction of travel once it is let go. */
const EXIT_DISTANCE = 44;
/** Where the new content starts. Wider than the exit, so arriving has further to settle. */
const ENTER_DISTANCE = 64;
/**
 * The depth the old content falls back to, and the one the new content comes
 * forward from. Reached while nothing is on screen, so it is never seen as a
 * size — only as the sense that the content stepped back and returned.
 */
const EXIT_SCALE = 0.94;

const OUT_MS = 130;
/** The fade only. The movement is a spring now and sets its own pace. */
const IN_MS = 180;
const RETURN_MS = 180;

/** Accelerating away, decelerating into place — the Material shared-axis pairing. */
const LEAVING = Easing.in(Easing.cubic);
const ARRIVING = Easing.out(Easing.cubic);

/**
 * The spring a drag that stopped short comes back on.
 *
 * A spring rather than a timing curve because it has something to say: it
 * overshoots a hair and settles, which reads as "not far enough" the way a
 * linear glide back does not. Damped well short of a bounce — this is a
 * correction, not a toy.
 *
 * Note for anyone tuning this: `restDisplacementThreshold` and
 * `restSpeedThreshold` are Reanimated 2 and 3 keys. Version 4 does not have
 * them, ignores them in silence, and TypeScript will not object through an
 * `as const`. Reach for `duration` with `dampingRatio` instead, as the arrival
 * spring below does.
 */
const RETURN_SPRING = { damping: 20, stiffness: 240, mass: 0.6 } as const;

/**
 * The spring the new content settles on.
 *
 * Damped to about 0.9 of critical: enough that it arrives and stops without
 * argument, short of enough to stop dead. That last tenth is the whole point
 * — a duration curve ends at a moment decided in advance, which is what reads
 * as mechanical however smooth it is, while a spring ends when the motion is
 * spent. Nothing here bounces; it settles, which is a different thing.
 */
const ARRIVE_SPRING = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;

/**
 * Resistance at the ends of the strip.
 *
 * With no category to go to, the content still moves — doing nothing at all
 * reads as a broken gesture — but only a third as far, which says "there is
 * nothing this way" without a message.
 */
const EDGE_RESISTANCE = 3;

/**
 * How long the arrival is allowed not to happen before it is forced.
 *
 * Longer than a commit and a re-render, shorter than any patience with a
 * blank screen. See `commit`.
 */
const STRANDED_MS = 320;

/**
 * Which way the chips actually run, taken from the layout rather than from
 * the locale (review, 2026-10-07).
 *
 * These are not the same thing, and assuming they were inverted the gesture.
 * `useI18n().isRTL` follows the chosen language and flips the moment it is
 * chosen; the layout follows `I18nManager.forceRTL`, which Android applies on
 * the *next launch* — and the app says so, offering a restart whose first
 * button is "Later". Between choosing Arabic and restarting, the chips still
 * read left to right while the locale says otherwise, so every drag selected
 * the category on the opposite side of the one it pointed at.
 *
 * The strip is a plain horizontal list with no direction prop of its own, so
 * the order its chips appear in is decided by this and nothing else. Reading
 * it once at module scope is right as well as cheap: it cannot change while
 * the app is running, which is the entire point.
 */
const FORWARD_IS_LEFT = true;

/*
  Kept only so the import still earns its place: the strip is pinned
  left-to-right in every language (see CategoryTabs), and this records that
  the app's own layout direction is deliberately not consulted here.
*/
void I18nManager;

export function CategorySwipe({
  ids,
  activeId,
  onSelect,
  enabled = true,
  progress,
  style,
  children,
}: {
  /** Every category in strip order, including whatever "All" chip the screen puts first. */
  ids: string[];
  activeId: string;
  onSelect: (id: string) => void;
  /** False while the screen has nothing to show — a loading or error state. */
  enabled?: boolean;
  /**
   * Published to the chip strip so it can travel with the finger: 0 at rest,
   * ±1 at the point a change commits, positive towards the next category.
   *
   * The same shared value is handed to `CategoryTabs`, which turns it into a
   * scroll position. Writing a number here rather than driving the strip from
   * this component keeps the two apart — the strip owns its own geometry, and
   * this owns only how far the finger has gone.
   */
  progress?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  /** The depth. One at rest, below one while the content is being moved or replaced. */
  const scale = useSharedValue(1);
  /** Where the next content arrives from. Written on the way out, read on arrival. */
  const entryFrom = useSharedValue(0);
  /** Set from the moment a change is committed until the new content has arrived. */
  const changing = useSharedValue(false);
  /*
    Stands in when no strip is listening, so every write below is unconditional
    and the hook order never varies with the props.
  */
  const unwatched = useSharedValue(0);
  const drag = progress ?? unwatched;

  /*
    The gesture runs on the UI thread, where it cannot read React state. The
    two numbers it needs are mirrored into shared values after every render
    instead; writing them from an effect rather than during render is what
    `react-hooks/refs` asks for, and the cost is two assignments.
  */
  const index = ids.indexOf(activeId);
  const indexValue = useSharedValue(index);
  const countValue = useSharedValue(ids.length);
  useEffect(() => {
    indexValue.value = index;
    countValue.value = ids.length;
  }, [index, ids.length, indexValue, countValue]);

  /** True between committing a change and the new content being on screen. */
  const awaiting = useRef(false);

  /** Put the content back where it was, for every case where nothing changes. */
  const settle = () => {
    awaiting.current = false;
    changing.value = false;
    drag.value = withSpring(0, RETURN_SPRING);
    translateX.value = withSpring(0, RETURN_SPRING);
    scale.value = withSpring(1, RETURN_SPRING);
    opacity.value = withTiming(1, { duration: RETURN_MS, easing: ARRIVING });
  };

  /**
   * Called on the JavaScript thread once the old content has left.
   *
   * Which way is "next": the chips are laid out in the reading direction, so
   * in Arabic the next chip sits to the *left* of the current one and the
   * drag that brings it in is a drag to the right — the same convention
   * every paged interface uses, mirrored. `RTL_LAYOUT` is what decides it;
   * see its own note for why the locale is the wrong source and was.
   */
  const commit = (direction: 1 | -1) => {
    const next = ids.indexOf(activeId) + direction;
    if (next < 0 || next >= ids.length) {
      /* Nothing to go to after all — come back rather than stay blank. */
      settle();
      return;
    }
    awaiting.current = true;
    onSelect(ids[next]);
    /*
      A screen that declined the change — or set it to the category already
      showing — would leave the content faded out with nothing coming to
      bring it back. The arrival is given a deadline for that reason alone:
      the cost of it never firing is one timer per change, and the cost of
      not having it is a dead screen.
    */
    setTimeout(() => {
      if (!awaiting.current) return;
      settle();
    }, STRANDED_MS);
  };

  const pan = Gesture.Pan()
    .enabled(enabled && ids.length > 1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onUpdate((event) => {
      "worklet";
      /* Mid-transition: swallow the drag rather than fight the animation. */
      if (changing.value) return;
      const forward = FORWARD_IS_LEFT ? event.translationX < 0 : event.translationX > 0;
      const direction: 1 | -1 = forward ? 1 : -1;
      const target = indexValue.value + direction;
      const blocked = target < 0 || target >= countValue.value;
      const travel = Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, event.translationX));
      translateX.value = blocked ? travel / EDGE_RESISTANCE : travel;
      /*
        Dims and recedes in proportion to the drag. The two together are what
        make it read as a card held under the finger rather than a view being
        slid: either one alone reads as a fade or as a zoom.
      */
      const pushed = Math.abs(translateX.value) / MAX_FOLLOW;
      opacity.value = 1 - pushed * DRAG_DIM;
      scale.value = 1 - pushed * DRAG_RECEDE;
      /*
        What the chip strip follows. Measured against the commit distance
        rather than against MAX_FOLLOW, so the chips arrive at the next one
        exactly as the drag becomes long enough to change category — and the
        same resistance is applied at the ends of the strip, so a drag with
        nowhere to go barely moves the chips either.
      */
      const gone = Math.min(1, Math.abs(event.translationX) / COMMIT_DISTANCE);
      drag.value = direction * (blocked ? gone / EDGE_RESISTANCE : gone);
    })
    /*
      `commit` reads `awaiting`, and handing it to `runOnJS` here looks to
      `react-hooks/refs` like a ref escaping into render. It is not: the only
      caller is the completion callback of the exit animation, a hundred and
      ten milliseconds after the finger has left the glass, and `commit` is
      never invoked while this component renders. The flag has to be a ref
      rather than a shared value because both the writer and both readers are
      on the JavaScript thread, and a shared value written from the UI thread
      reaches JavaScript only after a hop.
    */
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event, success) => {
      "worklet";
      if (changing.value) return;

      const distance = Math.abs(event.translationX);
      const flicked = Math.abs(event.velocityX) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;
      const forward = FORWARD_IS_LEFT ? event.translationX < 0 : event.translationX > 0;
      const direction: 1 | -1 = forward ? 1 : -1;
      const target = indexValue.value + direction;
      const blocked = target < 0 || target >= countValue.value;

      /* `success` is false for a drag the system took away mid-gesture. */
      if (!success || blocked || (distance < COMMIT_DISTANCE && !flicked)) {
        drag.value = withSpring(0, RETURN_SPRING);
        translateX.value = withSpring(0, RETURN_SPRING);
        scale.value = withSpring(1, RETURN_SPRING);
        opacity.value = withTiming(1, { duration: RETURN_MS, easing: ARRIVING });
        return;
      }

      changing.value = true;
      /*
        Carry the strip the rest of the way on the same curve the content
        leaves on, so the chips finish arriving as the old content finishes
        going. At 1 the strip is already centred on the next chip, which is
        where it has to be when the category changes a moment later.
      */
      drag.value = withTiming(direction, { duration: OUT_MS, easing: LEAVING });
      const leaving = event.translationX < 0 ? -EXIT_DISTANCE : EXIT_DISTANCE;
      entryFrom.value = leaving < 0 ? ENTER_DISTANCE : -ENTER_DISTANCE;
      opacity.value = withTiming(0, { duration: OUT_MS, easing: LEAVING });
      /* Falls back as it goes, so what leaves is receding rather than merely sliding. */
      scale.value = withTiming(EXIT_SCALE, { duration: OUT_MS, easing: LEAVING });
      translateX.value = withTiming(leaving, { duration: OUT_MS, easing: LEAVING }, (finished) => {
        "worklet";
        if (!finished) return;
        runOnJS(commit)(direction);
      });
    });

  /**
   * Bring the new content in — and not a moment before it *is* the new
   * content. See "the bug that shaped it" above.
   *
   * Last in the file on purpose: `react-hooks/immutability` forbids writing
   * a value that an effect declared earlier depends on, so every other write
   * has to appear above this. Execution order is unaffected — it still runs
   * after the index mirror, which is the only ordering that matters.
   *
   * The `immutability` suppression is for `drag.value = 0` below.
   * `react-hooks/immutability` sees `drag` as an ordinary local, because the
   * `??` that gives it a stand-in erases the fact that both sides of it are
   * shared values — the rule knows what `useSharedValue` returns and does not
   * follow that knowledge through a fallback. Mutation across renders is the
   * entire contract of a shared value, and the identical assignment inside
   * the gesture worklets below is accepted; only this one, in an effect, is
   * not.
   */
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!awaiting.current) return;
    awaiting.current = false;
    changing.value = false;
    /*
      The strip is already centred on this category — it was carried there
      while the old content left. Returning to 0 against the new index is the
      same pixel, so the strip does not move; it only stops being mid-drag.
    */
    drag.value = 0;
    /*
      Placed at depth and off to the side, then let go on a spring: it comes
      forward and settles rather than arriving on a schedule. The fade is the
      one thing still on a duration, and deliberately a shorter one than the
      spring — the content should be readable while it is still settling, not
      only once it has stopped.
    */
    translateX.value = entryFrom.value;
    scale.value = EXIT_SCALE;
    translateX.value = withSpring(0, ARRIVE_SPRING);
    scale.value = withSpring(1, ARRIVE_SPRING);
    opacity.value = withTiming(1, { duration: IN_MS, easing: ARRIVING });
    /*
      The shared values are deliberately absent from the list. Each is one
      stable object for the life of the component, so naming it buys nothing,
      and `react-hooks/immutability` — an error here, where
      `exhaustive-deps` is only a warning — forbids writing to anything a
      dependency array mentions.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style, animated]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
