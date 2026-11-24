import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * How much of a content grid a `FlatList` keeps mounted, per platform.
 *
 * Shared by the three browsing screens so they cannot drift apart — they
 * render the same kind of grid over the same kind of data and had three
 * copies of these numbers.
 *
 * Measured on the real device (TCL/Amlogic, Android 12, 2026-09-10). The
 * phone numbers mean five viewport-heights of cells held live. On a 1080p
 * television at four columns that is roughly eighty cells, each with its
 * own image view, and a category change rebuilds all of them in one
 * commit. logcat recorded what that cost:
 *
 *     Davey! duration=1463ms
 *     AnimationStart -> PerformTraversalsStart = 640ms
 *     Choreographer: Skipped 37 frames!
 *
 * Four of those in a row, one per arrow press. After cutting the window to
 * two viewports the same navigation measured a 17ms median with a 400ms
 * 99th percentile — still not perfect, but no longer a second per press.
 *
 * A television needs a *smaller* window than a phone, not a larger one: it
 * never flings, it steps one focused cell at a time, so there is nothing
 * for a deep buffer to smooth out.
 *
 * ## `removeClippedSubviews` is switched **off**, not left out
 *
 * It detaches off-screen views, and when Android detaches the view holding
 * focus it reassigns focus somewhere else — which on a D-pad is a cursor
 * that jumps on its own while you are navigating ("التنقل يقفز قفزات").
 * The attach/detach churn also lands on the UI thread, the very thread
 * being protected.
 *
 * It was set here for one build on 2026-09-10 and **deleted** the same day,
 * with a comment telling the next reader not to re-add it. That was a
 * mistake, and it lasted a week: deleting the key does not turn clipping
 * off, it restores React Native's default, and that default is
 * `removeClippedSubviews ?? Platform.OS === 'android'`
 * (node_modules/react-native/Libraries/Lists/FlatList.js:161-167). On this
 * box the default is `true`. So every list that merely omitted the prop has
 * been clipping — and detaching focused cells — the whole time.
 *
 * Hence `false` spelled out for the television, and `undefined` rather
 * than `true` for the phone: `undefined` falls through the same `??` to
 * exactly today's behaviour on every platform, so this cannot change what
 * the phone does.
 *
 * The phone keeps its exact previous values. Its lists were measured
 * smooth and are not the thing being fixed.
 */
export const LIST_WINDOW = isTvBuild
  ? {
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 60,
      /*
       * Three, not two. Two was measured fine for the frame budget but
       * leaves no margin: on a D-pad the focused cell must be *rendered*
       * to be focusable, so a window that trails the highlight stops
       * navigation rather than merely showing a gap. The cost of the extra
       * viewport is small next to that.
       */
      windowSize: 3,
      /** Off, spelled out. See the note above — omitting it means "on". */
      removeClippedSubviews: false,
    }
  : {
      initialNumToRender: 12,
      maxToRenderPerBatch: 6,
      updateCellsBatchingPeriod: 40,
      windowSize: 5,
      /** Untouched: `undefined` resolves to the platform default, as before. */
      removeClippedSubviews: undefined as boolean | undefined,
    };

/**
 * For a page the viewer has not reached yet (`CategoryPager`).
 *
 * Two of the three pages on a browse screen are off the edge, waiting to be
 * dragged into view, and one of them is brand new after every move — mounted
 * at the exact moment the transition starts. At the full window that is a
 * dozen cells built while the screen is animating, which is a stutter the
 * viewer can feel on every swipe.
 *
 * A third of the cells, built more slowly, is enough: the page only has to
 * look right along the edge it is revealed from, and it is given the full
 * window the moment the viewer actually arrives on it.
 */
export const QUIET_LIST_WINDOW = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 2,
  updateCellsBatchingPeriod: 80,
  windowSize: 2,
  removeClippedSubviews: undefined as boolean | undefined,
};

/**
 * The one prop every remote-navigated list needs, for the lists that are not
 * grids and therefore do not take `LIST_WINDOW`.
 *
 * `LIST_WINDOW` above carries `removeClippedSubviews` for the three browse
 * grids, and that left nine other lists — the category rail and strip, both
 * of Home's rows, Library, History, Search, the category-visibility list and
 * Downloads — each silently clipping, because omitting the prop is how you
 * turn clipping **on** (see the note above). Nine places to remember one
 * thing is eight too many, so it is one object spread in nine places
 * instead.
 *
 * Their window sizes are deliberately untouched: those lists are short, they
 * were not measured as a problem, and the defect here was never the window.
 * It was the clipping.
 */
export const NO_CLIP = isTvBuild
  ? { removeClippedSubviews: false }
  : /*
      Empty on the phone, not `{ removeClippedSubviews: undefined }`.
      Spreading an explicit `undefined` would still set the prop, and
      although `FlatList` resolves that through the same `??` to the same
      default, an empty object is the honest expression of "change nothing
      here".
    */
    ({} as { removeClippedSubviews?: boolean });
