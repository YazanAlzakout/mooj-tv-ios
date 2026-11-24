import { useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * The one number that joins the chip strip to the content under it
 * (2026-10-07).
 *
 * `CategorySwipe` writes it as a finger travels sideways — 0 at rest, ±1 at
 * the distance that commits a category change, positive towards the next
 * category in strip order — and `CategoryTabs` reads it and scrolls to match.
 * The result is that the chips move with the finger instead of jumping to
 * the new category after the fact, which is the difference between a strip
 * that belongs to the content and one that merely sits above it.
 *
 * It lives in the screen rather than in either component because the two are
 * siblings: the strip is deliberately *outside* the drag surface so that it
 * holds still rather than sliding away with the list. A screen that renders
 * both calls this once and hands the result to each.
 *
 * A shared value rather than React state on purpose. It changes on every
 * frame of a drag, and as state that would be sixty re-renders a second of a
 * screen carrying a list of up to twenty thousand rows. As a shared value the
 * whole gesture stays on the UI thread and the JavaScript thread never hears
 * about it.
 */
export function useCategoryDrag(): SharedValue<number> {
  return useSharedValue(0);
}
