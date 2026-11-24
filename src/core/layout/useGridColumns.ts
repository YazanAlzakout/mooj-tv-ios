import { useWindowDimensions } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * The fewest cells a grid packs per row once the phone is on its side, and
 * the most it is allowed to reach for.
 *
 * Four was the whole answer until 2026-11-08. It is still the floor, and it
 * is wrong on its own, for a reason that only shows up with a ruler on a
 * screenshot: sideways this phone's window is 873 by 393dp, and the grid
 * gets about 173 of those 393. The chrome takes the rest — status bar,
 * search row, category strip, tab bar — and none of it shrinks when the
 * screen does.
 *
 * Four across on an 873dp window makes a poster 198dp wide, so a 3:2 poster
 * row stands 309dp tall in a 173dp viewport. The viewer never sees a whole
 * poster, in any scroll position, and the title drawn across its foot is
 * usually below the fold. Channels fared slightly better and still hid
 * every name. Both were visible in the first landscape screenshots taken
 * after the tab bar landed.
 *
 * So the count is no longer a constant. The caller hands in the row height
 * its own geometry would produce at a given column count, and the count
 * rises until a row fits the budget below.
 */
const LANDSCAPE_MIN_COLUMNS = 4;
const LANDSCAPE_MAX_COLUMNS = 10;

/**
 * The share of a sideways window one grid row may stand in.
 *
 * 0.38 of 393dp is 149dp, against a real viewport of about 173 — so a full
 * row lands with its title, and the top of the next one shows, which is
 * what tells a viewer the list continues. Measured rather than chosen: the
 * chrome either side of the grid was read off a device screenshot at
 * 2400 by 1080.
 *
 * Deliberately a fraction of the window rather than the measured viewport.
 * Measuring the list would be exact and would also feed its own result back
 * into the column count — and the column count is a FlatList `key`, so a
 * loop there is a remount loop.
 */
const LANDSCAPE_ROW_BUDGET = 0.38;

/**
 * How many cells a content grid should show per row right now.
 *
 * Portrait keeps each section's own density (channels read fine two-up,
 * posters three-up). Landscape is a different shape entirely — roughly
 * twice the width and less than half the height — so it is worked out
 * rather than declared; see the notes above.
 *
 * `rowHeightAt` is the caller's own `rowHeight()` with the list width
 * already bound, so this hook never has to know about poster ratios,
 * name blocks or cell padding. Pass it and the count adapts; leave it out
 * and the floor stands, which is what the television wants.
 *
 * `useWindowDimensions` re-renders on rotation, so callers update on their
 * own; nothing here needs an orientation listener.
 *
 * Note for callers: React Native cannot change `numColumns` on a live
 * `FlatList`. Pass the returned value as the list's `key` as well, so a
 * rotation remounts the list instead of throwing.
 */
export function useGridColumns(
  portraitColumns: number,
  rowHeightAt?: (columns: number) => number
): number {
  const { width, height } = useWindowDimensions();
  if (width <= height) return portraitColumns;

  /*
   * The television is always "landscape" and none of the above applies to
   * it: it has height to spare, it is read from three metres, and its
   * density was settled against a real set. Leaving it on the floor keeps
   * this change to the device that needed it.
   */
  if (isTvBuild || !rowHeightAt) return LANDSCAPE_MIN_COLUMNS;

  const budget = height * LANDSCAPE_ROW_BUDGET;
  let columns = LANDSCAPE_MIN_COLUMNS;
  while (columns < LANDSCAPE_MAX_COLUMNS && rowHeightAt(columns) > budget) columns++;
  return columns;
}
